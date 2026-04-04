import { getSupabaseUserId } from "@/lib/auth/get-user";
import { NextResponse }       from "next/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { fetchSenderList }    from "@/lib/senders/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();

  const senders = await fetchSenderList(supabaseUserId);
  return NextResponse.json({ senders });
}
