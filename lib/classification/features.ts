import type { NormalizedMessage } from "@/lib/gmail/types";

// ---------------------------------------------------------------------------
// SenderRecord — subset of the senders table used for feature extraction.
// Callers should select at minimum these columns.
// ---------------------------------------------------------------------------

export interface SenderRecord {
  message_count: number;
  open_count: number;
  reply_count: number;
  archive_count: number;
  restore_count: number;
  click_count: number;
  search_count: number;
  last_seen_at: string | null; // ISO timestamp — used for recency decay
  learned_state: string;       // always_keep | prefer_keep | unknown | prefer_archive | always_archive | blocked | digest_only
}

// ---------------------------------------------------------------------------
// MessageFeatures — the output of extractFeatures.
// Used as input to the classification engine.
// ---------------------------------------------------------------------------

export interface MessageFeatures {
  // Unsubscribe / bulk mail signal
  hasUnsubscribeHeader: boolean;

  // Term-count features (0–N, one point per distinct term matched)
  promoTerms: number;
  newsletterTerms: number;
  transactionalTerms: number;
  securityTerms: number;
  workSchoolTerms: number;
  personalTerms: number;

  // Sender pattern flags
  noreplyLike: boolean;

  // Sender engagement rates (0–1, safe-divided)
  senderOpenRate: number;
  senderReplyRate: number;
  senderRestoreRate: number;
  senderArchiveRate: number;
  senderSearchRate: number;

  // Sender volume and recency
  senderMessageFrequency: number;
  recentEngagementBoost: number; // 0–1, decays to 0 beyond 30 days of inactivity

  // Sender classification flags
  isNewSender: boolean;
  fromImportantDomain: boolean;
  fromSchoolOrWorkDomain: boolean;
}

// ---------------------------------------------------------------------------
// Term lists (sourced from CLAUDE.md §3.3)
// ---------------------------------------------------------------------------

const PROMO_TERMS = [
  "sale", "off", "discount", "deal", "offer", "limited time", "shop now",
];

const NEWSLETTER_TERMS = [
  "newsletter", "weekly roundup", "digest", "top stories", "edition",
];

const TRANSACTIONAL_TERMS = [
  "receipt", "invoice", "order", "shipping", "delivered", "payment", "statement",
];

const SECURITY_TERMS = [
  "password", "verification code", "security alert", "login", "2fa",
];

const WORK_SCHOOL_TERMS = [
  "meeting", "class", "assignment", "deadline", "application", "schedule",
];

const PERSONAL_TERMS = [
  "hey", "checking in", "thank you", "let me know", "can you",
];

// ---------------------------------------------------------------------------
// Domain lists
// ---------------------------------------------------------------------------

/**
 * High-stakes domains where archiving by mistake would be costly.
 * Covers banks, government-adjacent services, major account providers,
 * and financial platforms. The .gov / .mil TLD check below covers the rest.
 */
const IMPORTANT_DOMAINS = new Set([
  // US banks
  "chase.com", "bankofamerica.com", "wellsfargo.com", "citibank.com",
  "usbank.com", "tdbank.com", "capitalone.com", "pnc.com", "ally.com",
  "navyfederal.org", "usaa.com",
  // Payments & finance
  "paypal.com", "stripe.com", "venmo.com", "cash.app", "cashapp.com",
  "zelle.com", "coinbase.com",
  // Investments & retirement
  "fidelity.com", "schwab.com", "vanguard.com", "robinhood.com",
  "tdameritrade.com", "etrade.com",
  // Student loans
  "studentaid.gov", "mohela.com", "nelnet.com", "aidvantage.com",
  // Insurance
  "aetna.com", "cigna.com", "uhc.com", "anthem.com", "bcbs.com",
  "geico.com", "statefarm.com", "progressive.com",
  // Healthcare portals
  "mychart.com",
  // Big account providers (security emails matter)
  "apple.com", "google.com", "microsoft.com", "amazon.com",
  "icloud.com", "live.com",
  // Utilities & telecom (billing)
  "att.com", "verizon.com", "t-mobile.com", "comcast.com",
]);

/**
 * Free / consumer email providers. Used as negative signal in work domain detection.
 */
const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "ymail.com", "yahoo.co.uk", "yahoo.co.in",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "aol.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me",
  "tutanota.com", "tuta.io",
  "zohomail.com", "zoho.com",
  "fastmail.com",
]);

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Extracts a fixed feature vector from a normalized message and its sender
 * record. This is the sole input to the classification engine — no raw message
 * text is passed beyond this point.
 */
export function extractFeatures(
  msg: NormalizedMessage,
  sender: SenderRecord
): MessageFeatures {
  const text = [msg.subject, msg.snippet, msg.body_text]
    .map((s) => s ?? "")
    .join(" ")
    .toLowerCase();

  return {
    hasUnsubscribeHeader: msg.has_unsubscribe_header,

    promoTerms:        countMatches(text, PROMO_TERMS),
    newsletterTerms:   countMatches(text, NEWSLETTER_TERMS),
    transactionalTerms: countMatches(text, TRANSACTIONAL_TERMS),
    securityTerms:     countMatches(text, SECURITY_TERMS),
    workSchoolTerms:   countMatches(text, WORK_SCHOOL_TERMS),
    personalTerms:     countMatches(text, PERSONAL_TERMS),

    noreplyLike: /no-?reply|donotreply/i.test(msg.sender_email ?? ""),

    senderOpenRate:    safeDivide(sender.open_count,    sender.message_count),
    senderReplyRate:   safeDivide(sender.reply_count,   sender.message_count),
    senderRestoreRate: safeDivide(sender.restore_count, sender.archive_count),
    senderArchiveRate: safeDivide(sender.archive_count, sender.message_count),
    senderSearchRate:  safeDivide(sender.search_count,  sender.message_count),

    senderMessageFrequency: sender.message_count,
    recentEngagementBoost:  computeRecentEngagementBoost(sender),

    isNewSender:           sender.message_count < 3,
    fromImportantDomain:   isImportantDomain(msg.sender_domain),
    fromSchoolOrWorkDomain: looksLikeSchoolOrWorkDomain(msg.sender_domain),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Counts how many distinct terms from the list appear at least once in text.
 * Returns a value in [0, terms.length].
 */
function countMatches(text: string, terms: string[]): number {
  return terms.filter((term) => text.includes(term)).length;
}

/**
 * Divides numerator by denominator, returning 0 when the denominator is 0
 * to avoid NaN / Infinity in downstream scoring.
 */
function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Returns a boost value in [0, 1] reflecting how recently and how often the
 * user has meaningfully engaged with this sender.
 *
 * Decay model: engagement score is multiplied by a linear recency factor that
 * reaches 0 after 30 days of no messages from this sender. This prevents
 * long-dormant senders from carrying stale high scores.
 *
 * Weights:
 *   - Reply rate   0.50 — strongest intentional engagement signal
 *   - Open rate    0.35 — weaker (opens can be passive / auto-preview)
 *   - Restore rate 0.15 — rescue from archive is a strong but rare signal
 */
function computeRecentEngagementBoost(sender: SenderRecord): number {
  if (!sender.last_seen_at || sender.message_count === 0) return 0;

  const daysSinceLastSeen =
    (Date.now() - new Date(sender.last_seen_at).getTime()) /
    (1000 * 60 * 60 * 24);

  // Linear decay: 1.0 today → 0.0 at 30 days
  const recencyFactor = Math.max(0, 1 - daysSinceLastSeen / 30);
  if (recencyFactor === 0) return 0;

  const openRate    = safeDivide(sender.open_count,    sender.message_count);
  const replyRate   = safeDivide(sender.reply_count,   sender.message_count);
  const restoreRate = safeDivide(sender.restore_count, Math.max(1, sender.archive_count));

  const engagementScore =
    replyRate   * 0.50 +
    openRate    * 0.35 +
    restoreRate * 0.15;

  return parseFloat((recencyFactor * engagementScore).toFixed(4));
}

/**
 * Returns true for domains where misclassification is particularly risky —
 * banks, government, insurance, major account providers.
 *
 * Two sources:
 *  1. TLD check: .gov and .mil are always important.
 *  2. Hardcoded set of known high-stakes consumer-facing domains.
 */
function isImportantDomain(domain: string | null): boolean {
  if (!domain) return false;
  if (domain.endsWith(".gov") || domain.endsWith(".mil")) return true;
  return IMPORTANT_DOMAINS.has(domain);
}

/**
 * Returns true when the domain pattern suggests a school or workplace.
 *
 * School signals (high confidence):
 *  - .edu TLD (US universities)
 *  - .ac.<cc> (international academic, e.g. .ac.uk, .ac.jp)
 *  - .edu.<cc> (e.g. .edu.au, .edu.br)
 *  - .k12.* patterns (US school districts)
 *  - Domain contains "university", "college", or "school"
 *
 * Work signal (lower confidence):
 *  - Not a free/consumer email provider AND not a known important domain.
 *    Custom business domains (acmecorp.com) fall here. This is intentionally
 *    a soft signal — classification should weight it accordingly.
 */
function looksLikeSchoolOrWorkDomain(domain: string | null): boolean {
  if (!domain) return false;

  // ── School (high confidence) ──────────────────────────────────────────────
  if (domain.endsWith(".edu")) return true;
  if (/\.edu\.[a-z]{2}$/.test(domain)) return true;   // .edu.au, .edu.br …
  if (/\.ac\.[a-z]{2}$/.test(domain)) return true;    // .ac.uk, .ac.jp …
  if (domain.includes(".k12.")) return true;
  if (
    domain.includes("university") ||
    domain.includes("college") ||
    domain.includes("school")
  ) {
    return true;
  }

  // ── Work (lower confidence) ───────────────────────────────────────────────
  // A non-free, non-important custom domain is likely a business / employer.
  if (!FREE_EMAIL_PROVIDERS.has(domain) && !IMPORTANT_DOMAINS.has(domain)) {
    return true;
  }

  return false;
}
