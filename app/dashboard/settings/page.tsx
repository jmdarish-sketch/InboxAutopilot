import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import SettingsForm          from "@/components/dashboard/SettingsForm";
import type { UserSettings, UserPreferences } from "@/app/api/settings/route";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Default preferences (mirrors the API defaults — kept in sync manually)
// ---------------------------------------------------------------------------

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
// Page
// ---------------------------------------------------------------------------

export default async function SettingsPage() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, autopilot_mode, preferences")
    .eq("email", email)
    .single() as unknown as {
      data: {
        id:             string;
        autopilot_mode: string;
        preferences:    unknown;
      } | null;
    };

  if (!user) redirect("/connect-gmail");

  const { data: gmailAccount } = await supabase
    .from("gmail_accounts")
    .select("email_address")
    .eq("user_id", user.id)
    .single() as unknown as { data: { email_address: string } | null };

  const initial: UserSettings = {
    autopilotMode:
      (user.autopilot_mode as UserSettings["autopilotMode"]) ?? "safe",
    connectedGmailEmail: gmailAccount?.email_address ?? null,
    preferences:         mergePreferences(user.preferences),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Control how autopilot behaves and what data it stores.
        </p>
      </div>

      <SettingsForm initial={initial} />
    </div>
  );
}
