import { auth, currentUser }    from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { runAutopilot }              from "@/lib/autopilot/execute";

// ---------------------------------------------------------------------------
// POST /api/jobs/autopilot-run
//
// Triggers the autopilot pipeline for a single user.
//
// Two invocation paths:
//
//   1. Cron / queue system (Inngest, QStash, Vercel Cron):
//      Pass  Authorization: Bearer <CRON_SECRET>  header
//      Body: { "userId": "<supabase_user_id>" }
//      This path is used by the scheduler to process all users in turn.
//
//   2. User-initiated (browser, dashboard "sync now" button):
//      Standard Clerk session auth — no extra header needed.
//      User is inferred from the session; no userId body param required.
//
// Never permanently deletes email — autopilot only archives or queues.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Path 1: cron/queue invocation ────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    let body: { userId?: string };
    try {
      body = (await req.json()) as { userId?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    try {
      const result = await runAutopilot(body.userId);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      console.error("[autopilot-run] cron invocation failed:", err);
      return NextResponse.json(
        { error: "Autopilot run failed" },
        { status: 500 }
      );
    }
  }

  // ── Path 2: user-initiated via Clerk session ──────────────────────────────
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

  try {
    const result = await runAutopilot(user.id as string);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[autopilot-run] user-initiated run failed:", err);
    return NextResponse.json(
      { error: "Autopilot run failed" },
      { status: 500 }
    );
  }
}
