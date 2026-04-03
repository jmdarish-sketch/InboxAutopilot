import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import DashboardSidebar      from "@/components/dashboard/DashboardSidebar";
import ToastProvider         from "@/components/shared/ToastProvider";

// Redirect to the correct onboarding step if not yet complete.
const ONBOARDING_REDIRECTS: Record<string, string> = {
  not_started:           "/onboarding/scan",
  gmail_connected:       "/onboarding/scan",
  initial_scan_complete: "/onboarding/diagnosis",
  cleanup_reviewed:      "/onboarding/autopilot",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, onboarding_status, autopilot_mode")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");

  const redirectTo = ONBOARDING_REDIRECTS[user.onboarding_status as string];
  if (redirectTo) redirect(redirectTo);

  // Fetch the Gmail account's email address for the sidebar display.
  const { data: gmailAccount } = await supabase
    .from("gmail_accounts")
    .select("email_address")
    .eq("user_id", user.id)
    .maybeSingle();

  const gmailEmail = gmailAccount?.email_address ?? email;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <DashboardSidebar
        gmailEmail={gmailEmail}
        autopilotMode={user.autopilot_mode ?? "safe"}
      />
      <main className="flex-1 overflow-y-auto">
        <ToastProvider>
          {children}
        </ToastProvider>
      </main>
    </div>
  );
}
