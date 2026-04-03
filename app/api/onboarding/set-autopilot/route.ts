import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AutopilotMode = "suggest_only" | "safe" | "aggressive";

const VALID_MODES = new Set<AutopilotMode>(["suggest_only", "safe", "aggressive"]);

export async function POST(req: NextRequest) {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

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

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { error } = await supabase
    .from("users")
    .update({
      autopilot_mode:    mode,
      onboarding_status: "autopilot_enabled",
      updated_at:        new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[set-autopilot] update failed:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
