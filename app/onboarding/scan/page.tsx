import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseUserId } from "@/lib/auth/get-user";
import ScanProgress          from "@/components/onboarding/ScanProgress";

// Statuses that mean the scan is already done — redirect forward
const POST_SCAN_ROUTES: Record<string, string> = {
  initial_scan_complete: "/onboarding/diagnosis",
  cleanup_reviewed:      "/onboarding/autopilot",
  autopilot_enabled:     "/dashboard",
};

export default async function ScanPage() {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) redirect("/sign-in");

  const supabase = createAdminClient();

  // Fetch user status and gmail sync status in parallel
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

  // If onboarding is past the scan step, redirect forward
  const forwardRoute = POST_SCAN_ROUTES[status];
  if (forwardRoute) {
    redirect(forwardRoute);
  }

  // If Gmail sync already completed but onboarding_status wasn't advanced
  // (e.g. auto-cleanup crashed, user closed tab mid-finalize), fix it and
  // redirect to diagnosis.
  if (gmailAccount?.sync_status === "synced") {
    await supabase
      .from("users")
      .update({ onboarding_status: "initial_scan_complete", updated_at: new Date().toISOString() })
      .eq("id", supabaseUserId);
    redirect("/onboarding/diagnosis");
  }

  // If no Gmail account at all, they need to connect first
  if (!gmailAccount) {
    redirect("/connect-gmail");
  }

  // Show scan UI — either starting fresh or resuming an in-progress scan
  return <ScanProgress />;
}
