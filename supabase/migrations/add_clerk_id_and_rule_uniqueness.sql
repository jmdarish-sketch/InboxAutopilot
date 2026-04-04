-- Store Clerk user ID for more reliable auth lookups
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_unique ON users(clerk_user_id);

-- Prevent duplicate active rules for the same sender
CREATE UNIQUE INDEX IF NOT EXISTS sender_rules_unique_active_sender_rule
  ON sender_rules (user_id, sender_id, rule_action)
  WHERE active = true AND sender_id IS NOT NULL;

-- Safety constraints on sender counters
ALTER TABLE senders
  ADD CONSTRAINT IF NOT EXISTS senders_message_count_nonneg CHECK (message_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS senders_open_count_nonneg CHECK (open_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS senders_reply_count_nonneg CHECK (reply_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS senders_archive_count_nonneg CHECK (archive_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS senders_restore_count_nonneg CHECK (restore_count >= 0);
