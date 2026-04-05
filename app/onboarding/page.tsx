import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseUserId } from "@/lib/auth/get-user";

// ---------------------------------------------------------------------------
// /onboarding — redirect hub
//
// Routes the user to the correct onboarding step based on their current
// onboarding_status and Gmail sync state. Never re-runs the scan if it
// already completed successfully.
// ---------------------------------------------------------------------------

const STATUS_ROUTES: Record<string, string> = {
  not_started:           "/onboarding/scan",
  gmail_connected:       "/onboarding/scan",
  initial_scan_complete: "/onboarding/diagnosis",
  cleanup_reviewed:      "/onboarding/autopilot",
  autopilot_enabled:     "/dashboard",
};

export default async function OnboardingPage() {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) redirect("/sign-in");

  const supabase = createAdminClient();

  const [{ data: user }, { data: gmailAccount }] = await Promise.all([
    supabase
      .from("users")
      .select("onboarding_status")
      .eq("id", supabaseUserId)
      .single(),
    supabase
      .from("gmail_accounts")
      .select("sync_status")
      .eq("user_id", supabaseUserId)
      .maybeSingle(),
  ]);

  const status = (user?.onboarding_status as string) ?? "not_started";

  // If sync completed but onboarding_status is still gmail_connected
  // (e.g. user closed tab during finalization), fix the state
  if (
    (status === "not_started" || status === "gmail_connected") &&
    gmailAccount?.sync_status === "synced"
  ) {
    await supabase
      .from("users")
      .update({ onboarding_status: "initial_scan_complete", updated_at: new Date().toISOString() })
      .eq("id", supabaseUserId);
    redirect("/onboarding/diagnosis");
  }

  // No Gmail account connected yet
  if (!gmailAccount && (status === "not_started" || status === "gmail_connected")) {
    redirect("/connect-gmail");
  }

  const destination = STATUS_ROUTES[status] ?? "/onboarding/scan";
  redirect(destination);
}
