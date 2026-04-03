import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import AutopilotModeSelector from "@/components/onboarding/AutopilotModeSelector";

export default async function AutopilotPage() {
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

  if (!user) redirect("/connect-gmail");

  const status = user.onboarding_status;

  // Gate: must have completed cleanup first
  if (status === "not_started" || status === "gmail_connected") {
    redirect("/onboarding/scan");
  }
  if (status === "initial_scan_complete") {
    redirect("/onboarding/diagnosis");
  }

  // Already finished this step
  if (status === "autopilot_enabled") {
    redirect("/onboarding/complete");
  }

  // status === "cleanup_reviewed" — correct place to be
  return <AutopilotModeSelector />;
}
