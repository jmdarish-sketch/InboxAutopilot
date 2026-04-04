import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { getSupabaseUserId }         from "@/lib/auth/get-user";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserPreferences {
  autoArchiveEnabled:     boolean;
  autoUnsubscribeEnabled: boolean;
  reviewQueueEnabled:     boolean;
  protectedCategories: {
    finance:          boolean;
    travel:           boolean;
    security:         boolean;
    schoolWork:       boolean;
    personalContacts: boolean;
    receiptsOrders:   boolean;
  };
  notifications: "none" | "daily_digest" | "important_only" | "weekly_summary";
}

export interface UserSettings {
  autopilotMode:       "suggest_only" | "safe" | "aggressive";
  connectedGmailEmail: string | null;
  preferences:         UserPreferences;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoArchiveEnabled:     true,
  autoUnsubscribeEnabled: false,
  reviewQueueEnabled:     true,
  protectedCategories: {
    finance:          true,
    travel:           true,
    security:         true,
    schoolWork:       true,
    personalContacts: true,
    receiptsOrders:   true,
  },
  notifications: "daily_digest",
};

function mergePreferences(stored: unknown): UserPreferences {
  if (!stored || typeof stored !== "object") return DEFAULT_PREFERENCES;
  const s = stored as Partial<UserPreferences>;
  return {
    autoArchiveEnabled:
      typeof s.autoArchiveEnabled === "boolean"
        ? s.autoArchiveEnabled
        : DEFAULT_PREFERENCES.autoArchiveEnabled,
    autoUnsubscribeEnabled:
      typeof s.autoUnsubscribeEnabled === "boolean"
        ? s.autoUnsubscribeEnabled
        : DEFAULT_PREFERENCES.autoUnsubscribeEnabled,
    reviewQueueEnabled:
      typeof s.reviewQueueEnabled === "boolean"
        ? s.reviewQueueEnabled
        : DEFAULT_PREFERENCES.reviewQueueEnabled,
    protectedCategories: {
      finance:
        typeof s.protectedCategories?.finance === "boolean"
          ? s.protectedCategories.finance
          : DEFAULT_PREFERENCES.protectedCategories.finance,
      travel:
        typeof s.protectedCategories?.travel === "boolean"
          ? s.protectedCategories.travel
          : DEFAULT_PREFERENCES.protectedCategories.travel,
      security:
        typeof s.protectedCategories?.security === "boolean"
          ? s.protectedCategories.security
          : DEFAULT_PREFERENCES.protectedCategories.security,
      schoolWork:
        typeof s.protectedCategories?.schoolWork === "boolean"
          ? s.protectedCategories.schoolWork
          : DEFAULT_PREFERENCES.protectedCategories.schoolWork,
      personalContacts:
        typeof s.protectedCategories?.personalContacts === "boolean"
          ? s.protectedCategories.personalContacts
          : DEFAULT_PREFERENCES.protectedCategories.personalContacts,
      receiptsOrders:
        typeof s.protectedCategories?.receiptsOrders === "boolean"
          ? s.protectedCategories.receiptsOrders
          : DEFAULT_PREFERENCES.protectedCategories.receiptsOrders,
    },
    notifications:
      ["none", "daily_digest", "important_only", "weekly_summary"].includes(
        s.notifications as string
      )
        ? (s.notifications as UserPreferences["notifications"])
        : DEFAULT_PREFERENCES.notifications,
  };
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function resolveUser() {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) return null;

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, autopilot_mode, preferences")
    .eq("id", supabaseUserId)
    .single() as unknown as {
      data: {
        id:             string;
        autopilot_mode: string;
        preferences:    unknown;
      } | null;
    };

  if (!user) return null;

  const { data: gmailAccount } = await supabase
    .from("gmail_accounts")
    .select("email_address")
    .eq("user_id", user.id)
    .single() as unknown as { data: { email_address: string } | null };

  return { supabase, user, gmailEmail: gmailAccount?.email_address ?? null };
}

// ---------------------------------------------------------------------------
// GET /api/settings
// ---------------------------------------------------------------------------

export async function GET() {
  const ctx = await resolveUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, gmailEmail } = ctx;
  const settings: UserSettings = {
    autopilotMode:
      (user.autopilot_mode as UserSettings["autopilotMode"]) ?? "safe",
    connectedGmailEmail: gmailEmail,
    preferences:         mergePreferences(user.preferences),
  };

  return NextResponse.json({ settings });
}

// ---------------------------------------------------------------------------
// PATCH /api/settings
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const ctx = await resolveUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase, user } = ctx;

  let body: Partial<{
    autopilotMode: string;
    preferences:   Partial<UserPreferences>;
  }>;

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate autopilotMode if provided
  const validModes = ["suggest_only", "safe", "aggressive"];
  if (
    body.autopilotMode !== undefined &&
    !validModes.includes(body.autopilotMode)
  ) {
    return NextResponse.json(
      { error: "Invalid autopilotMode" },
      { status: 422 }
    );
  }

  // Merge incoming preferences with existing
  const current  = mergePreferences(user.preferences);
  const incoming = body.preferences ?? {};
  const merged: UserPreferences = {
    autoArchiveEnabled:
      typeof incoming.autoArchiveEnabled === "boolean"
        ? incoming.autoArchiveEnabled
        : current.autoArchiveEnabled,
    autoUnsubscribeEnabled:
      typeof incoming.autoUnsubscribeEnabled === "boolean"
        ? incoming.autoUnsubscribeEnabled
        : current.autoUnsubscribeEnabled,
    reviewQueueEnabled:
      typeof incoming.reviewQueueEnabled === "boolean"
        ? incoming.reviewQueueEnabled
        : current.reviewQueueEnabled,
    protectedCategories: {
      finance:
        typeof incoming.protectedCategories?.finance === "boolean"
          ? incoming.protectedCategories.finance
          : current.protectedCategories.finance,
      travel:
        typeof incoming.protectedCategories?.travel === "boolean"
          ? incoming.protectedCategories.travel
          : current.protectedCategories.travel,
      security:
        typeof incoming.protectedCategories?.security === "boolean"
          ? incoming.protectedCategories.security
          : current.protectedCategories.security,
      schoolWork:
        typeof incoming.protectedCategories?.schoolWork === "boolean"
          ? incoming.protectedCategories.schoolWork
          : current.protectedCategories.schoolWork,
      personalContacts:
        typeof incoming.protectedCategories?.personalContacts === "boolean"
          ? incoming.protectedCategories.personalContacts
          : current.protectedCategories.personalContacts,
      receiptsOrders:
        typeof incoming.protectedCategories?.receiptsOrders === "boolean"
          ? incoming.protectedCategories.receiptsOrders
          : current.protectedCategories.receiptsOrders,
    },
    notifications:
      incoming.notifications !== undefined
        ? incoming.notifications
        : current.notifications,
  };

  const updatePayload: Record<string, unknown> = {
    preferences:  merged,
    updated_at:   new Date().toISOString(),
  };
  if (body.autopilotMode) {
    updatePayload.autopilot_mode = body.autopilotMode;
  }

  const { error } = await supabase
    .from("users")
    .update(updatePayload)
    .eq("id", user.id);

  if (error) {
    console.error("[settings PATCH]", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// DELETE /api/settings — account deletion and data wipe sub-actions
// Accepts: { action: "delete_email_data" | "delete_account" }
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const ctx = await resolveUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase, user } = ctx;

  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "delete_email_data") {
    // Wipe messages, senders, actions_log, review_queue, feedback_events,
    // digests — but keep the user row and Gmail connection.
    await Promise.all([
      supabase.from("messages").delete().eq("user_id", user.id),
      supabase.from("senders").delete().eq("user_id", user.id),
      supabase.from("actions_log").delete().eq("user_id", user.id),
      supabase.from("review_queue").delete().eq("user_id", user.id),
      supabase.from("feedback_events").delete().eq("user_id", user.id),
      supabase.from("digests").delete().eq("user_id", user.id),
    ]);
    return NextResponse.json({ success: true });
  }

  if (body.action === "delete_account") {
    // Cascade deletes everything via FK on delete cascade in schema.
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", user.id);
    if (error) {
      console.error("[settings DELETE account]", error);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
