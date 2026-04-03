// ---------------------------------------------------------------------------
// Raw Gmail API types
// ---------------------------------------------------------------------------

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: {
    size: number;
    data?: string;         // base64url encoded
    attachmentId?: string; // present when body is a separate attachment
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string; // epoch milliseconds as a string
  payload?: GmailMessagePart;
  sizeEstimate?: number;
}

export interface GmailMessageListItem {
  id: string;
  threadId: string;
}

export interface GmailMessageListResponse {
  messages?: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

// ---------------------------------------------------------------------------
// Normalized message — maps directly to the messages table columns that are
// known at ingestion time. Classification fields (final_category, scores,
// recommended_action, etc.) are left to the classification engine.
// ---------------------------------------------------------------------------

export interface NormalizedMessage {
  // Gmail identifiers
  gmail_message_id: string;
  gmail_thread_id: string;
  gmail_history_id: string | null;

  // Content
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;

  // Metadata
  internal_date: string | null; // ISO timestamp
  has_attachments: boolean;
  is_read: boolean;
  is_starred: boolean;
  is_important_label: boolean;
  gmail_category: string | null; // e.g. "CATEGORY_PROMOTIONS"
  label_ids: string[];

  // Unsubscribe signals
  has_unsubscribe_header: boolean;
  unsubscribe_url: string | null;
  unsubscribe_mailto: string | null;

  // Deterministic heuristic flags (set by parser, not the classification engine)
  is_newsletter: boolean;
  is_promotion: boolean;
  is_transactional: boolean;
  is_security_related: boolean;
  is_personal_like: boolean;
  contains_time_sensitive_terms: boolean;

  // Sender — used to upsert the senders table
  sender_email: string | null;
  sender_name: string | null;
  sender_domain: string | null;
}
