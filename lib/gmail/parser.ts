import type { GmailMessage, GmailMessagePart, NormalizedMessage } from "./types";

// ---------------------------------------------------------------------------
// Gmail category labels
// ---------------------------------------------------------------------------
const GMAIL_CATEGORIES = [
  "CATEGORY_PERSONAL",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
] as const;

// ---------------------------------------------------------------------------
// Keyword lists for deterministic heuristics
// ---------------------------------------------------------------------------
const TRANSACTIONAL_TERMS = [
  "order", "receipt", "invoice", "payment", "confirmation", "confirmed",
  "shipment", "shipped", "delivery", "tracking", "booking", "reservation",
  "transaction", "purchase", "refund", "subscription", "renewal",
];

const SECURITY_TERMS = [
  "password", "verify", "verification", "confirm your", "security alert",
  "login attempt", "sign-in", "two-factor", "2fa", "authentication",
  "unauthorized", "suspicious", "reset your", "account access",
];

const TIME_SENSITIVE_TERMS = [
  "expires", "expiring", "deadline", "urgent", "last chance", "today only",
  "limited time", "act now", "ends today", "offer ends", "by tomorrow",
  "don't miss", "hurry", "only .* left", "48 hours", "24 hours",
];

const BULK_SENDER_HEADERS = [
  "list-id",
  "list-unsubscribe",
  "list-unsubscribe-post",
  "x-mailchimp-campaign",
  "x-campaign",
  "x-mailer",
  "precedence",       // "bulk" or "list" value indicates bulk mail
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw Gmail API message into the shape expected by the
 * messages and senders tables. Classification fields are left null —
 * those are filled by the classification engine later.
 */
export function parseMessage(raw: GmailMessage): NormalizedMessage {
  const headers = extractHeaders(raw.payload);
  const labelIds = raw.labelIds ?? [];

  const subject = header(headers, "subject");
  const snippet = raw.snippet ?? null;
  const searchable = `${subject ?? ""} ${snippet ?? ""}`.toLowerCase();

  const { text: body_text, html: body_html } = extractBody(raw.payload);
  const { url: unsubscribe_url, mailto: unsubscribe_mailto } =
    parseUnsubscribeHeader(header(headers, "list-unsubscribe"));

  const has_unsubscribe_header =
    header(headers, "list-unsubscribe") !== null;
  const hasBulkHeaders = BULK_SENDER_HEADERS.some(
    (h) => header(headers, h) !== null
  );
  const is_newsletter = has_unsubscribe_header || header(headers, "list-id") !== null;
  const is_promotion =
    labelIds.includes("CATEGORY_PROMOTIONS") ||
    (hasBulkHeaders && !is_newsletter); // bulk but no unsubscribe link

  const is_transactional =
    !is_newsletter &&
    !is_promotion &&
    containsAny(searchable, TRANSACTIONAL_TERMS);

  const is_security_related = containsAny(searchable, SECURITY_TERMS);

  const { email: sender_email, name: sender_name } = parseFromHeader(
    header(headers, "from") ?? ""
  );
  const sender_domain = sender_email ? extractDomain(sender_email) : null;

  // A message is personal-like when there are no bulk signals at all
  const is_personal_like =
    !is_newsletter &&
    !is_promotion &&
    !is_transactional &&
    !hasBulkHeaders;

  const contains_time_sensitive_terms = TIME_SENSITIVE_TERMS.some((term) =>
    new RegExp(term, "i").test(searchable)
  );

  const gmailCategory =
    GMAIL_CATEGORIES.find((c) => labelIds.includes(c)) ?? null;

  return {
    gmail_message_id: raw.id,
    gmail_thread_id: raw.threadId,
    gmail_history_id: raw.historyId ?? null,

    subject,
    snippet,
    body_text,
    body_html,

    internal_date: raw.internalDate
      ? new Date(parseInt(raw.internalDate, 10)).toISOString()
      : null,
    has_attachments: hasAttachments(raw.payload),
    is_read: !labelIds.includes("UNREAD"),
    is_starred: labelIds.includes("STARRED"),
    is_important_label: labelIds.includes("IMPORTANT"),
    gmail_category: gmailCategory,
    label_ids: labelIds,

    has_unsubscribe_header,
    unsubscribe_url,
    unsubscribe_mailto,

    is_newsletter,
    is_promotion,
    is_transactional,
    is_security_related,
    is_personal_like,
    contains_time_sensitive_terms,

    sender_email,
    sender_name,
    sender_domain,
  };
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

type HeaderMap = Map<string, string>;

function extractHeaders(payload: GmailMessagePart | undefined): HeaderMap {
  const map = new Map<string, string>();
  for (const h of payload?.headers ?? []) {
    map.set(h.name.toLowerCase(), h.value);
  }
  return map;
}

function header(headers: HeaderMap, name: string): string | null {
  return headers.get(name.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Body extraction
// ---------------------------------------------------------------------------

/**
 * Recursively walks the MIME tree and returns the best text/plain and
 * text/html parts. Prefers the deepest multipart/alternative we find.
 */
function extractBody(
  part: GmailMessagePart | undefined
): { text: string | null; html: string | null } {
  if (!part) return { text: null, html: null };

  const mime = part.mimeType?.toLowerCase() ?? "";

  if (mime === "text/plain") {
    return { text: decodeBase64Url(part.body?.data), html: null };
  }

  if (mime === "text/html") {
    return { text: null, html: decodeBase64Url(part.body?.data) };
  }

  if (mime.startsWith("multipart/")) {
    let text: string | null = null;
    let html: string | null = null;

    for (const child of part.parts ?? []) {
      const { text: t, html: h } = extractBody(child);
      if (t) text = t;
      if (h) html = h;
    }

    return { text, html };
  }

  return { text: null, html: null };
}

/**
 * Decodes a Gmail base64url encoded body string.
 * Returns null if the input is absent or empty.
 */
function decodeBase64Url(data: string | undefined | null): string | null {
  if (!data) return null;
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Attachment detection
// ---------------------------------------------------------------------------

function hasAttachments(part: GmailMessagePart | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
    return true;
  }
  return (part.parts ?? []).some(hasAttachments);
}

// ---------------------------------------------------------------------------
// From header parsing
// ---------------------------------------------------------------------------

/**
 * Parses a From header value into display name and email address.
 *
 * Handles these common formats:
 *   "Display Name" <email@domain.com>
 *   Display Name <email@domain.com>
 *   <email@domain.com>
 *   email@domain.com
 */
function parseFromHeader(from: string): {
  email: string | null;
  name: string | null;
} {
  if (!from) return { email: null, name: null };

  // Format: Name <email>
  const angleMatch = from.match(/^(.*?)\s*<([^>]+)>/);
  if (angleMatch) {
    const name = angleMatch[1].replace(/^["']|["']$/g, "").trim() || null;
    const email = angleMatch[2].trim().toLowerCase();
    return { email, name };
  }

  // Bare email address
  const bareEmail = from.trim().toLowerCase();
  if (bareEmail.includes("@")) {
    return { email: bareEmail, name: null };
  }

  return { email: null, name: null };
}

function extractDomain(email: string): string | null {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Unsubscribe header parsing
// ---------------------------------------------------------------------------

/**
 * Parses a List-Unsubscribe header value.
 * Format: `<https://...>, <mailto:...>` (order varies, either may be absent)
 */
function parseUnsubscribeHeader(value: string | null): {
  url: string | null;
  mailto: string | null;
} {
  if (!value) return { url: null, mailto: null };

  let url: string | null = null;
  let mailto: string | null = null;

  // Find all <...> entries
  const entries = value.match(/<([^>]+)>/g) ?? [];

  for (const entry of entries) {
    const inner = entry.slice(1, -1).trim();
    if (inner.startsWith("mailto:")) {
      mailto = inner;
    } else if (inner.startsWith("http://") || inner.startsWith("https://")) {
      url = inner;
    }
  }

  return { url, mailto };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((t) => text.includes(t));
}
