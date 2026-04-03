import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCleanupRecommendations } from "@/lib/cleanup/recommendations";
import { updateSenderAggregates }      from "@/lib/diagnosis/aggregates";
import CleanupReview                   from "@/components/onboarding/CleanupReview";

// ---------------------------------------------------------------------------
// Page data loader
// ---------------------------------------------------------------------------

async function getCleanupData() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, onboarding_status")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");

  // Redirect back if they haven't scanned yet
  if (
    user.onboarding_status === "not_started" ||
    user.onboarding_status === "gmail_connected"
  ) {
    redirect("/onboarding/scan");
  }

  // Skip forward if cleanup was already reviewed
  if (
    user.onboarding_status === "cleanup_reviewed" ||
    user.onboarding_status === "autopilot_enabled"
  ) {
    redirect("/onboarding/autopilot");
  }

  const supabaseUserId = user.id as string;

  // Ensure sender aggregates are fresh before building recommendations
  await updateSenderAggregates(supabaseUserId);

  return buildCleanupRecommendations(supabaseUserId);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CleanupPage() {
  const { recommendations, protected: protectedSenders } = await getCleanupData();

  return (
    <CleanupReview
      recommendations={recommendations}
      protectedSenders={protectedSenders}
    />
  );
}
