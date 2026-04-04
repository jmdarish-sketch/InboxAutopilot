import { getSupabaseUserId } from "@/lib/auth/get-user";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { fetchReviewItems }          from "@/lib/review/queries";
import type { ReviewFilter }         from "@/lib/review/queries";

export const dynamic = "force-dynamic";

const VALID_FILTERS = new Set<ReviewFilter>([
  "all", "new_senders", "borderline_promo", "possible_important", "expiring_soon",
]);

export async function GET(req: NextRequest) {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get("filter") ?? "all";
  const filter: ReviewFilter = VALID_FILTERS.has(rawFilter as ReviewFilter)
    ? (rawFilter as ReviewFilter)
    : "all";
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  const items = await fetchReviewItems(supabaseUserId, filter, limit);
  return NextResponse.json({ items, total: items.length });
}
