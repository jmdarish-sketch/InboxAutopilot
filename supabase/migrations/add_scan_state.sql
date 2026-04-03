-- Stores scan progress between chunked API calls during onboarding.
-- JSON shape: { messageIds: string[], cursor: number, phase: string }
ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS scan_state jsonb;
