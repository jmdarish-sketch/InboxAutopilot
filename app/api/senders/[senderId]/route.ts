import { getSupabaseUserId } from "@/lib/auth/get-user";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { fetchSenderDetail }         from "@/lib/senders/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ senderId: string }> }
) {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();

  const { senderId } = await params;
  const detail = await fetchSenderDetail(supabaseUserId, senderId);
  if (!detail) return NextResponse.json({ error: "Sender not found" }, { status: 404 });

  return NextResponse.json(detail);
}
