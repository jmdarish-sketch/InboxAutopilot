import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import ScanProgress from "@/components/onboarding/ScanProgress";

export default async function ScanPage() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);

  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  // If the scan has already completed, skip straight to review
  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("onboarding_status")
    .eq("email", email)
    .single();

  if (user?.onboarding_status === "initial_scan_complete") {
    redirect("/onboarding/diagnosis");
  }

  return <ScanProgress />;
}
