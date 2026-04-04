-- Track emails received but never opened after 72 hours.
-- Used by the behavior scoring engine to detect ignored senders.
ALTER TABLE senders ADD COLUMN IF NOT EXISTS ignore_count int NOT NULL DEFAULT 0;
