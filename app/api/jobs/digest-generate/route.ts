import { auth, currentUser }      from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { generateDigest }            from "@/lib/analytics/digests";

// ---------------------------------------------------------------------------
// POST /api/jobs/digest-generate
//
// Generates a digest for a user and persists it in the digests table.
//
// Two invocation paths:
//
//   1. Cron / queue system:
//      Authorization: Bearer <CRON_SECRET>  header
//      Body: { "userId": "<supabase_user_id>", "type": "daily" | "weekly" }
//
//   2. User-initiated (dashboard):
//      Standard Clerk session auth.  type defaults to "daily".
// ---------------------------------------------------------------------------

type DigestType = "daily" | "weekly";

function periodBounds(type: DigestType): { start: Date; end: Date } {
  const end   = new Date();
  const start = new Date(end);
  if (type === "weekly") {
    start.setUTCDate(start.getUTCDate() - 7);
  } else {
    start.setUTCHours(0, 0, 0, 0); // midnight UTC — start of today
  }
  return { start, end };
}

export async function POST(req: NextRequest) {
  // ── Path 1: cron/queue invocation ────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    let body: { userId?: string; type?: string };
    try {
      body = (await req.json()) as { userId?: string; type?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const digestType: DigestType =
      body.type === "weekly" ? "weekly" : "daily";

    return runDigest(body.userId, digestType);
  }

  // ── Path 2: user-initiated ────────────────────────────────────────────────
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

  let body: { type?: string } = {};
  try { body = (await req.json()) as { type?: string }; } catch { /* no body */ }

  const digestType: DigestType =
    body.type === "weekly" ? "weekly" : "daily";

  return runDigest(user.id as string, digestType);
}

async function runDigest(
  supabaseUserId: string,
  digestType: DigestType
): Promise<NextResponse> {
  const supabase = createAdminClient();

  try {
    const { start, end } = periodBounds(digestType);
    const summary        = await generateDigest(supabaseUserId, start, end);

    const { data, error } = await supabase
      .from("digests")
      .insert({
        user_id:      supabaseUserId,
        digest_type:  digestType,
        period_start: start.toISOString(),
        period_end:   end.toISOString(),
        summary:      summary,
        delivered:    false,
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, digestId: (data as { id: string }).id, summary });
  } catch (err) {
    console.error("[digest-generate] failed:", err);
    return NextResponse.json({ error: "Digest generation failed" }, { status: 500 });
  }
}
