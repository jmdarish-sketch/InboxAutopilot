import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves the current Clerk session to a Supabase user ID.
 * Uses clerk_user_id for lookup (falls back to email for legacy rows).
 *
 * Returns null if unauthenticated or user not found.
 */
export async function getSupabaseUserId(): Promise<string | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const supabase = createAdminClient();

  // Primary lookup: by clerk_user_id
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (user) return user.id as string;

  // Fallback: legacy rows that don't have clerk_user_id set yet.
  // This handles users who connected before the migration.
  // We also backfill clerk_user_id when found this way.
  const { currentUser } = await import("@clerk/nextjs/server");
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const { data: legacyUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (legacyUser) {
    // Backfill clerk_user_id for future lookups
    await supabase
      .from("users")
      .update({ clerk_user_id: clerkUserId, updated_at: new Date().toISOString() })
      .eq("id", legacyUser.id);
    return legacyUser.id as string;
  }

  return null;
}
