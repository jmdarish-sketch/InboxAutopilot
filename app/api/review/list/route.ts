import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { fetchReviewItems }          from "@/lib/review/queries";
import type { ReviewFilter }         from "@/lib/review/queries";

export const dynamic = "force-dynamic";

const VALID_FILTERS = new Set<ReviewFilter>([
  "all", "new_senders", "borderline_promo", "possible_important", "expiring_soon",
]);

export async function GET(req: NextRequest) {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get("filter") ?? "all";
  const filter: ReviewFilter = VALID_FILTERS.has(rawFilter as ReviewFilter)
    ? (rawFilter as ReviewFilter)
    : "all";
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  const items = await fetchReviewItems(user.id as string, filter, limit);
  return NextResponse.json({ items, total: items.length });
}
