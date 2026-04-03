# Inbox Autopilot — Setup Guide

Step-by-step instructions to get the app running locally.

## Prerequisites

- Node.js 18+ and npm
- A Gmail account for testing
- Accounts on: [Supabase](https://supabase.com), [Clerk](https://clerk.com), [Google Cloud Console](https://console.cloud.google.com), [OpenAI](https://platform.openai.com)

---

## 1. Clone and install

```bash
git clone <your-repo-url>
cd InboxAutopilot
npm install
```

## 2. Supabase — database

### Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Pick a region close to your users. Note the project password — you won't need it in the app but you'll need it for direct DB access.
3. Wait for the project to finish provisioning.

### Get your credentials

Go to **Settings > API** in the Supabase dashboard. You need three values:

| Value | Where to find it | Env var |
|-------|-------------------|---------|
| Project URL | Settings > API > Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon/public key | Settings > API > Project API keys | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key | Settings > API > Project API keys (reveal) | `SUPABASE_SERVICE_ROLE_KEY` |

The service_role key bypasses Row Level Security. Never expose it in client-side code.

### Run the migrations

Open the **SQL Editor** in the Supabase dashboard and run these two files in order:

**Migration 1 — Initial schema:**

Copy the contents of `supabase/migrations/20260402000000_initial_schema.sql` and execute it. This creates all 10 tables (users, gmail_accounts, senders, messages, threads, sender_rules, feedback_events, actions_log, review_queue, digests) and their indexes.

**Migration 2 — User preferences column:**

Copy the contents of `supabase/migrations/add_user_preferences.sql` and execute it. This adds the `preferences` jsonb column to the users table (used by the Settings page).

Alternatively, if you have the Supabase CLI installed:

```bash
supabase db push
```

## 3. Clerk — authentication

### Create the application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) and create a new application.
2. Enable **Email** as a sign-in method. You can also enable Google OAuth here for one-click sign-in.
3. Go to **API Keys** and copy:

| Value | Env var |
|-------|---------|
| Publishable key | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Secret key | `CLERK_SECRET_KEY` |

### Configure redirect URLs

In Clerk dashboard, go to **Paths** (or configure via env vars):

```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

## 4. Google Cloud — Gmail API and OAuth

This is the most involved step. You need a Google Cloud project with the Gmail API enabled and OAuth 2.0 credentials.

### Create the project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (e.g., "Inbox Autopilot Dev").

### Enable the Gmail API

1. Go to **APIs & Services > Library**.
2. Search for **Gmail API** and click **Enable**.

### Configure the OAuth consent screen

1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** user type (unless you have a Google Workspace org).
3. Fill in the required fields:
   - App name: `Inbox Autopilot`
   - User support email: your email
   - Developer contact: your email
4. On the **Scopes** step, add these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` — read email content
   - `https://www.googleapis.com/auth/gmail.modify` — archive, label, modify messages
   - `https://www.googleapis.com/auth/gmail.labels` — manage labels
5. On the **Test users** step, add your Gmail address. While in testing mode, only listed test users can authorize the app.
6. Save and continue.

### Create OAuth credentials

1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Inbox Autopilot`
5. Authorized redirect URIs — add:
   - `http://localhost:3000/api/gmail/oauth/callback` (development)
   - `https://your-domain.com/api/gmail/oauth/callback` (production, add later)
6. Click **Create** and copy:

| Value | Env var |
|-------|---------|
| Client ID | `GOOGLE_CLIENT_ID` |
| Client secret | `GOOGLE_CLIENT_SECRET` |

### Important notes

- While your app is in **Testing** status on Google, tokens expire after 7 days. Users need to re-authorize weekly. To avoid this, submit for **verification** when ready for production.
- The app never requests `gmail.send` scope — it cannot send emails on behalf of users.

## 5. OpenAI — LLM classification

The app uses OpenAI only for ambiguous email classification — not every email hits the API.

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Create a new API key.
3. Set:

| Value | Env var |
|-------|---------|
| API key | `OPENAI_API_KEY` |

The default model is `gpt-4o-mini` which is fast and cheap. To override:

```
OPENAI_CLASSIFICATION_MODEL=gpt-4o-mini
```

## 6. Encryption key

Gmail OAuth tokens are encrypted at rest using AES-256. Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the output as `ENCRYPTION_KEY` in your `.env.local`.

## 7. Cron secret

Used to authenticate Vercel Cron job requests. Generate any strong random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set as `CRON_SECRET`. In production on Vercel, this is automatically passed to cron endpoints.

## 8. Environment variables

Copy the example file and fill in every value:

```bash
cp .env.example .env.local
```

Here's the complete list:

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_CLASSIFICATION_MODEL=gpt-4o-mini

# Encryption (64-char hex)
ENCRYPTION_KEY=aabbccdd...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron
CRON_SECRET=your-random-secret
```

## 9. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the landing page.

### First-run walkthrough

1. Click **Connect Gmail** and sign in with Clerk.
2. Connect your Gmail account — you'll be redirected to Google's OAuth consent screen.
3. The initial scan runs automatically, analyzing your recent inbox.
4. Review the diagnosis and cleanup recommendations.
5. Choose an autopilot mode and you're done.

## 10. Background jobs (production)

The app uses two recurring jobs defined in `vercel.json`:

| Job | Schedule | Endpoint |
|-----|----------|----------|
| Autopilot run | Every 15 minutes | `/api/cron/autopilot` |
| Daily digest | Daily at 8 AM UTC | `/api/cron/digest` |

These run automatically on Vercel when deployed. For local development, you can trigger them manually:

```bash
# Trigger autopilot for your user (uses Clerk session)
curl -X POST http://localhost:3000/api/jobs/autopilot-run

# Or use the "Sync now" button on the dashboard
```

## Troubleshooting

**"Unauthorized" on Gmail connect**
- Check that your Google OAuth redirect URI exactly matches `http://localhost:3000/api/gmail/oauth/callback`.
- Make sure your Gmail address is listed as a test user in the Google Cloud consent screen.

**"User not found" after sign-in**
- The user row is created in Supabase during the Gmail OAuth callback. Make sure you've connected Gmail before accessing the dashboard.

**Tokens expire after 7 days**
- This happens while your Google Cloud app is in Testing mode. Submit for verification to get long-lived tokens.

**Classification seems generic**
- Check that `OPENAI_API_KEY` is set. Without it, the LLM fallback is skipped and only deterministic rules + scoring are used.

**Cron jobs not running locally**
- Vercel Cron only works in production. Use the dashboard "Sync now" button or call the API endpoints directly during development.
