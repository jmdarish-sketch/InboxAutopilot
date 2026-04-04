import { getSupabaseUserId } from "@/lib/auth/get-user";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AutopilotMode = "suggest_only" | "safe" | "aggressive";

const VALID_MODES = new Set<AutopilotMode>(["suggest_only", "safe", "aggressive"]);

export async function POST(req: NextRequest) {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();

  let mode: AutopilotMode;
  try {
    const body = (await req.json()) as { mode?: unknown };
    if (!body.mode || !VALID_MODES.has(body.mode as AutopilotMode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    mode = body.mode as AutopilotMode;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      autopilot_mode:    mode,
      onboarding_status: "autopilot_enabled",
      updated_at:        new Date().toISOString(),
    })
    .eq("id", supabaseUserId);

  if (error) {
    console.error("[set-autopilot] update failed:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
