import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse }       from "next/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { fetchDashboardSummary } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const summary = await fetchDashboardSummary(user.id as string);
  return NextResponse.json(summary);
}
