import OpenAI from "openai";
import type { NormalizedMessage } from "@/lib/gmail/types";
import type { MessageFeatures, SenderRecord } from "./features";
import type { DeterministicResult } from "./rules";
import type { ScoredResult } from "./scorer";
import type { MessageCategory } from "./rules";

// ---------------------------------------------------------------------------
// LLMDecision — constrained output schema returned by the model (§3.7).
// Deliberately narrower than RecommendedAction: "delete" is excluded by
// prompt instruction, and "unsubscribe"/"mute_thread"/"none" are excluded
// because those are post-classification actions, not classification decisions.
// ---------------------------------------------------------------------------

export type LLMRecommendedAction = "keep_inbox" | "archive" | "review" | "digest_only";

export interface LLMDecision {
  category: MessageCategory;
  recommendedAction: LLMRecommendedAction;
  confidence: number;         // 0–1
  explanationTags: string[];  // short snake_case labels, e.g. ["promo_language", "bulk_sender"]
}

// ---------------------------------------------------------------------------
// JSON schema passed to OpenAI structured outputs.
// strict: true means every property must be in `required` and
// additionalProperties must be false — no hallucinated fields.
// ---------------------------------------------------------------------------

const LLM_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "critical_transactional",
        "personal_human",
        "work_school",
        "recurring_useful",
        "recurring_low_value",
        "promotion",
        "newsletter",
        "spam_like",
        "uncertain",
      ],
    },
    recommendedAction: {
      type: "string",
      enum: ["keep_inbox", "archive", "review", "digest_only"],
    },
    confidence: { type: "number" },
    explanationTags: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["category", "recommendedAction", "confidence", "explanationTags"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// System prompt — sets role, defines categories, enforces constraints.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `\
You are the classification engine for Inbox Autopilot, an AI inbox cleanup product.
Your job is to classify a single email and decide what should happen to it.

CATEGORIES (pick exactly one):
- critical_transactional  Payment receipts, shipping confirmations, security alerts, account notices, bills
- personal_human          Genuine person-to-person email, not automated
- work_school             Email related to a job, classes, assignments, or institutions
- recurring_useful        Regular senders the user actually engages with (newsletters they open, digests they read)
- recurring_low_value     Recurring senders the user ignores or consistently archives
- promotion               One-time or campaign marketing, sales, discounts
- newsletter              Curated content digests, editorial newsletters, roundups
- spam_like               Unsolicited bulk mail, phishing patterns, or very low-quality senders
- uncertain               Genuinely ambiguous; use this sparingly

ACTIONS (pick exactly one):
- keep_inbox   Leave in inbox. Use for important, personal, transactional, or risky-to-miss email.
- archive      Move out of inbox. Use only when confident the email is low-value and safe to archive.
- review       Surface for the user to decide. Use when uncertain or when archiving feels risky.
- digest_only  Batch into a periodic summary. Use for recurring low-value senders.

RULES:
- Never recommend deleting email — "delete" is not an option.
- When in doubt, keep_inbox or review. Never archive something that could be important.
- confidence should reflect how certain you are, not how decisive the action is.
- explanationTags should be 1–4 short snake_case phrases describing your reasoning.

Return valid JSON matching the schema exactly. No prose, no markdown.`;

// ---------------------------------------------------------------------------
// shouldUseLLM (§3.6)
//
// Gate function — returns true only when the cheaper deterministic + scoring
// layers couldn't reach sufficient confidence. Ordered from cheapest exit
// condition to most expensive check.
// ---------------------------------------------------------------------------

export function shouldUseLLM(
  scored: ScoredResult,
  deterministic: DeterministicResult,
  sender: SenderRecord
): boolean {
  // High confidence non-uncertain result → no LLM needed
  if (deterministic.category !== "uncertain" && scored.confidence > 0.85) {
    return false;
  }

  // Explicit user preference already set → the resolution layer handles these,
  // no point asking the LLM to speculate on a decision already made
  if (
    sender.learned_state === "always_keep" ||
    sender.learned_state === "always_archive"
  ) {
    return false;
  }

  // Very high risk → safety layer will force keep_inbox regardless of what
  // the LLM says, so there's no value in the call
  if (scored.riskScore > 80) return false;

  // Scores are too close to call → LLM needed to break the tie
  if (Math.abs(scored.importanceScore - scored.clutterScore) < 15) return true;

  // Overall confidence too low → LLM needed
  if (scored.confidence < 0.7) return true;

  return false;
}

// ---------------------------------------------------------------------------
// classifyWithLLM
//
// Calls GPT-4o-mini with structured output to classify a message the
// deterministic + scoring layers couldn't handle confidently.
//
// Returns null on any error (network failure, parse failure, invalid schema)
// so callers can fall through to the heuristic fallback in resolveFinalClassification.
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export async function classifyWithLLM(
  msg: NormalizedMessage,
  f: MessageFeatures
): Promise<LLMDecision | null> {
  try {
    const userMessage = buildUserMessage(msg, f);

    const response = await getClient().chat.completions.create({
      model: process.env.OPENAI_CLASSIFICATION_MODEL ?? "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_classification",
          strict: true,
          schema: LLM_RESPONSE_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      temperature: 0,     // deterministic output — classification, not generation
      max_tokens: 200,    // LLMDecision JSON is small; cap to avoid runaway cost
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    return validateLLMDecision(JSON.parse(raw));
  } catch (err) {
    console.error("[classifyWithLLM] error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// buildUserMessage
//
// Gives the model the signals it needs without sending the full message body
// (which could be huge and isn't necessary for classification). Sender
// engagement rates are expressed as percentages for readability.
// ---------------------------------------------------------------------------

function buildUserMessage(msg: NormalizedMessage, f: MessageFeatures): string {
  const pct = (r: number) => `${Math.round(r * 100)}%`;

  const lines = [
    "Email to classify:",
    `  From:    ${msg.sender_email ?? "unknown"} (${msg.sender_domain ?? "unknown domain"})`,
    `  Subject: ${msg.subject ?? "(no subject)"}`,
    `  Snippet: ${msg.snippet ?? "(empty)"}`,
    "",
    "Pre-computed signals:",
    `  Unsubscribe header present: ${f.hasUnsubscribeHeader ? "yes" : "no"}`,
    `  No-reply sender pattern:    ${f.noreplyLike ? "yes" : "no"}`,
    `  New sender (< 3 messages):  ${f.isNewSender ? "yes" : "no"}`,
    `  From important domain:      ${f.fromImportantDomain ? "yes" : "no"}`,
    `  From school/work domain:    ${f.fromSchoolOrWorkDomain ? "yes" : "no"}`,
    "",
    "Term matches (count of distinct terms found):",
    `  Promo terms:         ${f.promoTerms}`,
    `  Newsletter terms:    ${f.newsletterTerms}`,
    `  Transactional terms: ${f.transactionalTerms}`,
    `  Security terms:      ${f.securityTerms}`,
    `  Work/school terms:   ${f.workSchoolTerms}`,
    `  Personal terms:      ${f.personalTerms}`,
    "",
    "Sender engagement history:",
    `  Open rate:    ${pct(f.senderOpenRate)}`,
    `  Reply rate:   ${pct(f.senderReplyRate)}`,
    `  Archive rate: ${pct(f.senderArchiveRate)}`,
    `  Restore rate: ${pct(f.senderRestoreRate)}`,
    `  Search rate:  ${pct(f.senderSearchRate)}`,
    `  Recent engagement boost: ${f.recentEngagementBoost.toFixed(3)}`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// validateLLMDecision
//
// Validates the parsed JSON against expected shape and value ranges.
// Returns null if anything is missing or out of range — callers treat null
// as "LLM failed; fall through to heuristic resolution".
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set<string>([
  "critical_transactional", "personal_human", "work_school",
  "recurring_useful", "recurring_low_value", "promotion",
  "newsletter", "spam_like", "uncertain",
]);

const VALID_ACTIONS = new Set<string>([
  "keep_inbox", "archive", "review", "digest_only",
]);

function validateLLMDecision(raw: unknown): LLMDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;

  if (!VALID_CATEGORIES.has(d.category as string)) return null;
  if (!VALID_ACTIONS.has(d.recommendedAction as string)) return null;
  if (typeof d.confidence !== "number" || d.confidence < 0 || d.confidence > 1) return null;
  if (!Array.isArray(d.explanationTags)) return null;

  return {
    category:          d.category as MessageCategory,
    recommendedAction: d.recommendedAction as LLMRecommendedAction,
    confidence:        d.confidence,
    explanationTags:   (d.explanationTags as unknown[]).filter((t): t is string => typeof t === "string"),
  };
}
