import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";
import type { GmailMessage, GmailMessageListResponse } from "./types";

const GMAIL_BASE = "https://gmail.googleapis.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Proactively refresh if the token expires within this window
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface RefreshedTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function callTokenEndpoint(refreshToken: string): Promise<RefreshedTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }

  return res.json() as Promise<RefreshedTokens>;
}

async function persistTokens(
  supabaseUserId: string,
  tokens: RefreshedTokens
): Promise<void> {
  const supabase = createAdminClient();

  const updates: Record<string, string> = {
    access_token_encrypted: encrypt(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Google may rotate the refresh token — persist the new one if provided
  if (tokens.refresh_token) {
    updates.refresh_token_encrypted = encrypt(tokens.refresh_token);
  }

  const { error } = await supabase
    .from("gmail_accounts")
    .update(updates)
    .eq("user_id", supabaseUserId);

  if (error) {
    console.error("[GmailClient] Failed to persist refreshed tokens:", error);
  }
}

// ---------------------------------------------------------------------------
// GmailClient
// ---------------------------------------------------------------------------

export class GmailClient {
  private accessToken: string;
  private readonly supabaseUserId: string;

  constructor(accessToken: string, supabaseUserId: string) {
    this.accessToken = accessToken;
    this.supabaseUserId = supabaseUserId;
  }

  /**
   * Typed GET against the Gmail REST API.
   * Automatically retries once after refreshing if it gets a 401.
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${GMAIL_BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 401) {
      await this.refresh();
      return this.get<T>(path, params); // retry once with new token
    }

    if (!res.ok) {
      throw new Error(
        `Gmail API ${path} failed (${res.status}): ${await res.text()}`
      );
    }

    return res.json() as Promise<T>;
  }

  // Convenience wrappers used by sync.ts
  listMessages(params: Record<string, string>) {
    return this.get<GmailMessageListResponse>(
      "/gmail/v1/users/me/messages",
      params
    );
  }

  getMessage(id: string) {
    return this.get<GmailMessage>(
      `/gmail/v1/users/me/messages/${id}`,
      { format: "full" }
    );
  }

  /**
   * Typed POST against the Gmail REST API.
   * Automatically retries once after refreshing if it gets a 401.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${GMAIL_BASE}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      await this.refresh();
      return this.post<T>(path, body);
    }

    if (!res.ok) {
      throw new Error(
        `Gmail API POST ${path} failed (${res.status}): ${await res.text()}`
      );
    }

    // batchModify returns 204 No Content
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  /**
   * Batch-modify labels on up to 1000 messages per call.
   * Used for archiving (removeLabelIds: ["INBOX"]).
   */
  async batchModifyLabels(
    ids: string[],
    addLabelIds?: string[],
    removeLabelIds?: string[]
  ): Promise<void> {
    if (ids.length === 0) return;
    const BATCH = 1000;
    for (let i = 0; i < ids.length; i += BATCH) {
      await this.post<void>("/gmail/v1/users/me/messages/batchModify", {
        ids: ids.slice(i, i + BATCH),
        ...(addLabelIds?.length ? { addLabelIds } : {}),
        ...(removeLabelIds?.length ? { removeLabelIds } : {}),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Reactive token refresh — called automatically on 401
  // ---------------------------------------------------------------------------
  private async refresh(): Promise<void> {
    const supabase = createAdminClient();

    const { data: account, error } = await supabase
      .from("gmail_accounts")
      .select("refresh_token_encrypted")
      .eq("user_id", this.supabaseUserId)
      .single();

    if (error || !account?.refresh_token_encrypted) {
      throw new Error(
        `Cannot refresh token for user ${this.supabaseUserId}: no refresh token stored`
      );
    }

    const refreshToken = decrypt(account.refresh_token_encrypted);
    const tokens = await callTokenEndpoint(refreshToken);
    await persistTokens(this.supabaseUserId, tokens);
    this.accessToken = tokens.access_token;
  }
}

// ---------------------------------------------------------------------------
// Factory — call this to get an authenticated GmailClient
// ---------------------------------------------------------------------------

/**
 * Creates a GmailClient for the given Supabase user UUID.
 * Proactively refreshes the access token if it is expired or about to expire.
 */
export async function createGmailClient(
  supabaseUserId: string
): Promise<GmailClient> {
  const supabase = createAdminClient();

  const { data: account, error } = await supabase
    .from("gmail_accounts")
    .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", supabaseUserId)
    .single();

  if (error || !account) {
    throw new Error(`No Gmail account found for user ${supabaseUserId}`);
  }

  if (!account.access_token_encrypted || !account.refresh_token_encrypted) {
    throw new Error(
      `Gmail account for user ${supabaseUserId} has incomplete token data`
    );
  }

  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : 0;
  const tokenIsExpired = Date.now() >= expiresAt - EXPIRY_BUFFER_MS;

  let accessToken: string;

  if (tokenIsExpired) {
    const refreshToken = decrypt(account.refresh_token_encrypted);
    const tokens = await callTokenEndpoint(refreshToken);
    await persistTokens(supabaseUserId, tokens);
    accessToken = tokens.access_token;
  } else {
    accessToken = decrypt(account.access_token_encrypted);
  }

  return new GmailClient(accessToken, supabaseUserId);
}
