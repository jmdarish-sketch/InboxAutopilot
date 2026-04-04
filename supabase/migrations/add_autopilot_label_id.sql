-- Cache the Gmail label ID for "Autopilot/Archived" so we don't look it up on every archive call.
ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS autopilot_label_id text;
