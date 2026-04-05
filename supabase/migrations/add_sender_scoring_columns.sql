-- Weighted scoring engine columns for intelligent sender classification.

-- When the user last opened, replied to, or starred an email from this sender.
-- Used for recency-weighted protection decay.
ALTER TABLE senders ADD COLUMN IF NOT EXISTS last_engaged_at timestamptz;

-- Computed: (message_count - open_count) / message_count. Updated on every stat recalc.
ALTER TABLE senders ADD COLUMN IF NOT EXISTS ignore_rate numeric(5,2) NOT NULL DEFAULT 0;

-- Computed: messages per week based on first_seen_at to last_seen_at window.
ALTER TABLE senders ADD COLUMN IF NOT EXISTS avg_emails_per_week numeric(5,2) NOT NULL DEFAULT 0;

-- Add 'balanced' as a valid autopilot mode (between safe and aggressive).
-- No enum constraint exists — the column is text — so no ALTER TYPE needed.
-- Just update the default for new users.
ALTER TABLE users ALTER COLUMN autopilot_mode SET DEFAULT 'balanced';
