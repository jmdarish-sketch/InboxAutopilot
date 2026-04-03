import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { generateDigest }            from "@/lib/analytics/digests";

// ---------------------------------------------------------------------------
// GET /api/cron/digest
//
// Vercel Cron calls this once daily at 8:00 AM UTC. For each active user,
// generates a daily digest and stores it in the digests table.
//
// Timezone note: Vercel Cron uses UTC. We run at 8 AM UTC which covers
// morning delivery for most US/EU timezones. A future improvement could
// batch users by timezone for more precise delivery.
//
// Auth: CRON_SECRET header.
// ---------------------------------------------------------------------------

export const dynamic  = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch all users who have completed onboarding
  const { data: users, error } = await supabase
    .from("users")
    .select("id")
    .eq("onboarding_status", "autopilot_enabled") as unknown as {
      data: Array<{ id: string }> | null;
      error: unknown;
    };

  if (error || !users) {
    console.error("[cron/digest] Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  // TODO: Filter by user notification preference (daily_digest or weekly_summary)
  // For now, generate for all active users.

  const end   = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1); // last 24 hours

  let succeeded = 0;
  let failed    = 0;

  for (const user of users) {
    try {
      const summary = await generateDigest(user.id, start, end);

      await supabase.from("digests").insert({
        user_id:      user.id,
        digest_type:  "daily",
        period_start: start.toISOString(),
        period_end:   end.toISOString(),
        summary,
        delivered:    false,
      });

      succeeded++;
    } catch (err) {
      console.error(`[cron/digest] Failed for user ${user.id}:`, err);
      failed++;
    }
  }

  console.log(
    `[cron/digest] Completed: ${succeeded} succeeded, ${failed} failed out of ${users.length} users`
  );

  return NextResponse.json({
    usersProcessed: users.length,
    succeeded,
    failed,
  });
}
