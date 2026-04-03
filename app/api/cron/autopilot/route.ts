import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { runAutopilot }              from "@/lib/autopilot/execute";

// ---------------------------------------------------------------------------
// GET /api/cron/autopilot
//
// Vercel Cron calls this every 15 minutes. It iterates all active users
// (onboarding complete, autopilot not in suggest_only mode) and runs the
// autopilot pipeline for each.
//
// Auth: CRON_SECRET header — Vercel injects this automatically for cron jobs.
// ---------------------------------------------------------------------------

export const dynamic  = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for Vercel functions

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch all active users: onboarding complete and autopilot enabled
  const { data: users, error } = await supabase
    .from("users")
    .select("id, autopilot_mode")
    .eq("onboarding_status", "autopilot_enabled")
    .neq("autopilot_mode", "suggest_only") as unknown as {
      data: Array<{ id: string; autopilot_mode: string }> | null;
      error: unknown;
    };

  if (error || !users) {
    console.error("[cron/autopilot] Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  const results: Array<{
    userId:  string;
    success: boolean;
    processed?: number;
    archived?:  number;
    error?:  string;
  }> = [];

  // Process users sequentially to avoid rate-limiting Gmail API
  for (const user of users) {
    try {
      const result = await runAutopilot(user.id);
      results.push({
        userId:    user.id,
        success:   true,
        processed: result.processed,
        archived:  result.archived,
      });
    } catch (err) {
      console.error(`[cron/autopilot] Failed for user ${user.id}:`, err);
      results.push({
        userId:  user.id,
        success: false,
        error:   err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed    = results.filter(r => !r.success).length;

  console.log(
    `[cron/autopilot] Completed: ${succeeded} succeeded, ${failed} failed out of ${users.length} users`
  );

  return NextResponse.json({
    usersProcessed: users.length,
    succeeded,
    failed,
    results,
  });
}
