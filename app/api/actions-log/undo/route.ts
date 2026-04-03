import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { createGmailClient }         from "@/lib/gmail/client";

export async function POST(req: NextRequest) {
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

  const supabaseUserId = user.id as string;

  let body: { actionId: string };
  try {
    body = (await req.json()) as { actionId: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: action } = await supabase
    .from("actions_log")
    .select("id, action_type, gmail_message_id, sender_id, reversible, undone")
    .eq("id", body.actionId)
    .eq("user_id", supabaseUserId)
    .single();

  if (!action) return NextResponse.json({ error: "Action not found" }, { status: 404 });
  if (action.undone) return NextResponse.json({ error: "Already undone" }, { status: 409 });
  if (!action.reversible) return NextResponse.json({ error: "Not reversible" }, { status: 400 });

  if (action.action_type === "archive" && action.gmail_message_id) {
    try {
      const gmail = await createGmailClient(supabaseUserId);
      await gmail.post(
        `/gmail/v1/users/me/messages/${action.gmail_message_id}/modify`,
        { addLabelIds: ["INBOX"] }
      );
    } catch (err) {
      console.error("[actions-log/undo] Gmail restore failed:", err);
      // Continue to mark as undone in DB even if Gmail call fails
    }
  }

  // Mark undone in DB
  await supabase
    .from("actions_log")
    .update({ undone: true, undone_at: new Date().toISOString() })
    .eq("id", body.actionId);

  // If there's a sender rule from this action, deactivate it
  if (action.sender_id) {
    await supabase
      .from("sender_rules")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("user_id", supabaseUserId)
      .eq("sender_id", action.sender_id)
      .eq("source", "initial_cleanup");
  }

  return NextResponse.json({ success: true });
}
