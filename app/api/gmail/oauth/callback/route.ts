import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getGmailProfile } from "@/lib/gmail/oauth";
import { encrypt } from "@/lib/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

function redirectWithError(request: NextRequest, error: string) {
  return NextResponse.redirect(
    new URL(`/connect-gmail?error=${error}`, request.url)
  );
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const googleError = searchParams.get("error");

  // User denied access on Google's consent screen
  if (googleError) {
    return redirectWithError(request, encodeURIComponent(googleError));
  }

  if (!code || !state) {
    return redirectWithError(request, "missing_params");
  }

  // Verify state to prevent CSRF
  const cookieStore = await cookies();
  const storedState = cookieStore.get("gmail_oauth_state")?.value;

  // Clear state cookie regardless of outcome
  cookieStore.set("gmail_oauth_state", "", { maxAge: 0, path: "/" });

  if (!storedState || storedState !== state) {
    return redirectWithError(request, "state_mismatch");
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      // This should not happen with prompt=consent, but guard anyway
      return redirectWithError(request, "no_refresh_token");
    }

    // Fetch Gmail profile to get the connected address and historyId
    const gmailProfile = await getGmailProfile(tokens.access_token);

    // Get Clerk user for identity
    const clerkUser = await currentUser();
    const clerkEmail = clerkUser?.emailAddresses[0]?.emailAddress;
    const clerkUserId = clerkUser?.id;

    if (!clerkEmail || !clerkUserId) {
      return redirectWithError(request, "no_clerk_email");
    }

    const tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    const supabase = createAdminClient();

    // Check if user already exists (by clerk_user_id or email)
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .or(`clerk_user_id.eq.${clerkUserId},email.eq.${clerkEmail}`)
      .maybeSingle();

    let userRow: { id: string } | null;

    if (existingUser) {
      // Update existing user
      const { data, error: updateError } = await supabase
        .from("users")
        .update({
          clerk_user_id: clerkUserId,
          email: clerkEmail,
          gmail_connected: true,
          gmail_account_email: gmailProfile.emailAddress,
          onboarding_status: "gmail_connected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingUser.id)
        .select("id")
        .single();
      userRow = data as { id: string } | null;
      if (updateError) {
        console.error("[gmail/callback] user update failed:", updateError);
        return redirectWithError(request, "db_error");
      }
    } else {
      // Create new user with clerk_user_id as the identity key
      const { data, error: insertError } = await supabase
        .from("users")
        .insert({
          clerk_user_id: clerkUserId,
          email: clerkEmail,
          gmail_connected: true,
          gmail_account_email: gmailProfile.emailAddress,
          onboarding_status: "gmail_connected",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      userRow = data as { id: string } | null;
      if (insertError) {
        console.error("[gmail/callback] user insert failed:", insertError);
        return redirectWithError(request, "db_error");
      }
    }

    const userError = !userRow;

    if (userError || !userRow) {
      console.error("[gmail/callback] user upsert failed:", userError);
      return redirectWithError(request, "db_error");
    }

    // Upsert gmail_accounts — one row per user (enforced by unique(user_id))
    const { error: accountError } = await supabase
      .from("gmail_accounts")
      .upsert(
        {
          user_id: userRow.id,
          // gmail_user_id: Google doesn't return a stable user ID from the
          // profile endpoint; using emailAddress as a stable identifier.
          gmail_user_id: gmailProfile.emailAddress,
          email_address: gmailProfile.emailAddress,
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: encrypt(tokens.refresh_token),
          token_expires_at: tokenExpiresAt,
          history_id: gmailProfile.historyId,
          sync_status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (accountError) {
      console.error("[gmail/callback] gmail_accounts upsert failed:", accountError);
      return redirectWithError(request, "db_error");
    }

    return NextResponse.redirect(new URL("/onboarding", request.url));
  } catch (err) {
    console.error("[gmail/callback] unexpected error:", err);
    return redirectWithError(request, "unexpected");
  }
}
