import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// /onboarding — redirect hub
//
// Routes the user to the correct onboarding step based on their current
// onboarding_status. The Gmail OAuth callback redirects here after a
// successful connection.
// ---------------------------------------------------------------------------

const STATUS_ROUTES: Record<string, string> = {
  not_started:           "/onboarding/scan",
  gmail_connected:       "/onboarding/scan",
  initial_scan_complete: "/onboarding/diagnosis",
  cleanup_reviewed:      "/onboarding/autopilot",
  autopilot_enabled:     "/dashboard",
};

export default async function OnboardingPage() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("onboarding_status")
    .eq("email", email)
    .single();

  const status   = (user?.onboarding_status as string) ?? "not_started";
  const destination = STATUS_ROUTES[status] ?? "/onboarding/scan";

  redirect(destination);
}
