-- Add preferences jsonb column to users table.
-- Stores autopilot toggles, protected categories, and notification settings.
-- See app/api/settings/route.ts for the full schema and defaults.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
