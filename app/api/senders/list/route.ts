import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse }       from "next/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { fetchSenderList }    from "@/lib/senders/queries";

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

  const senders = await fetchSenderList(user.id as string);
  return NextResponse.json({ senders });
}
