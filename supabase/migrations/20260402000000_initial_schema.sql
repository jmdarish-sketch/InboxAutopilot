-- =============================================================================
-- Inbox Autopilot — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 users
-- Core user record. Mirrors the Supabase auth.users row via trigger/RLS.
-- autopilot_mode: suggest_only | safe | aggressive
-- onboarding_status: not_started | gmail_connected | initial_scan_complete |
--                    cleanup_reviewed | autopilot_enabled
-- ---------------------------------------------------------------------------
create table users (
  id                  uuid        primary key default gen_random_uuid(),
  email               text        not null unique,
  full_name           text,
  gmail_connected     boolean     not null default false,
  gmail_account_email text,
  autopilot_mode      text        not null default 'safe',
  onboarding_status   text        not null default 'not_started',
  timezone            text        not null default 'America/Los_Angeles',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1.2 gmail_accounts
-- One row per connected Gmail account (currently max 1 per user in V1).
-- Tokens must be encrypted before storage — never store raw.
-- history_id is the Gmail API cursor for incremental sync.
-- sync_status: pending | syncing | synced | error
-- ---------------------------------------------------------------------------
create table gmail_accounts (
  id                        uuid        primary key default gen_random_uuid(),
  user_id                   uuid        not null references users(id) on delete cascade,
  gmail_user_id             text,
  email_address             text        not null,
  access_token_encrypted    text,
  refresh_token_encrypted   text,
  token_expires_at          timestamptz,
  history_id                text,
  sync_status               text        not null default 'pending',
  last_full_sync_at         timestamptz,
  last_incremental_sync_at  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id),
  unique (email_address)
);

-- ---------------------------------------------------------------------------
-- 1.3 senders
-- One row per (user, sender_email) pair. Accumulates engagement signals used
-- by the preference-learning engine to compute trust/importance/clutter scores.
-- learned_state: always_keep | prefer_keep | unknown | prefer_archive |
--               always_archive | blocked | digest_only
-- ---------------------------------------------------------------------------
create table senders (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null references users(id) on delete cascade,
  sender_email        text          not null,
  sender_name         text,
  sender_domain       text          not null,
  first_seen_at       timestamptz,
  last_seen_at        timestamptz,
  message_count       int           not null default 0,
  open_count          int           not null default 0,
  reply_count         int           not null default 0,
  archive_count       int           not null default 0,
  restore_count       int           not null default 0,
  click_count         int           not null default 0,
  search_count        int           not null default 0,
  unsubscribe_count   int           not null default 0,
  trust_score         numeric(5,2)  not null default 0,
  importance_score    numeric(5,2)  not null default 0,
  clutter_score       numeric(5,2)  not null default 0,
  sender_category     text,
  learned_state       text          not null default 'unknown',
  review_required     boolean       not null default false,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  unique (user_id, sender_email)
);

-- ---------------------------------------------------------------------------
-- 1.4 messages
-- One row per Gmail message. Stores classification output, scoring, and the
-- action taken (or recommended).
--
-- final_category: critical_transactional | personal_human | work_school |
--                 recurring_useful | recurring_low_value | promotion |
--                 newsletter | spam_like | uncertain
-- recommended_action / executed_action:
--                 keep_inbox | archive | unsubscribe | mute_thread |
--                 digest_only | review | none
-- action_status:  none | pending | executed | failed | undone
-- review_status:  not_needed | queued | user_kept | user_archived |
--                 user_unsubscribed | expired
-- ---------------------------------------------------------------------------
create table messages (
  id                            uuid          primary key default gen_random_uuid(),
  user_id                       uuid          not null references users(id) on delete cascade,
  sender_id                     uuid          references senders(id) on delete set null,
  gmail_message_id              text          not null,
  gmail_thread_id               text          not null,
  gmail_history_id              text,
  subject                       text,
  snippet                       text,
  body_text                     text,
  body_html                     text,
  internal_date                 timestamptz,
  has_attachments               boolean       not null default false,
  is_read                       boolean       not null default false,
  is_starred                    boolean       not null default false,
  is_important_label            boolean       not null default false,
  gmail_category                text,
  label_ids                     text[]        not null default '{}',
  has_unsubscribe_header        boolean       not null default false,
  unsubscribe_url               text,
  unsubscribe_mailto            text,
  is_newsletter                 boolean       not null default false,
  is_promotion                  boolean       not null default false,
  is_transactional              boolean       not null default false,
  is_security_related           boolean       not null default false,
  is_personal_like              boolean       not null default false,
  contains_time_sensitive_terms boolean       not null default false,
  deterministic_category        text,
  model_category                text,
  final_category                text,
  importance_score              numeric(5,2),
  clutter_score                 numeric(5,2),
  risk_score                    numeric(5,2),
  confidence_score              numeric(5,2),
  recommended_action            text,
  executed_action               text,
  action_status                 text          not null default 'none',
  action_reason                 text,
  review_status                 text          not null default 'not_needed',
  created_at                    timestamptz   not null default now(),
  updated_at                    timestamptz   not null default now(),
  unique (user_id, gmail_message_id)
);

-- ---------------------------------------------------------------------------
-- 1.5 threads
-- Lightweight thread-level record. Used for mute state and thread grouping.
-- ---------------------------------------------------------------------------
create table threads (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references users(id) on delete cascade,
  gmail_thread_id text        not null,
  subject         text,
  message_count   int         not null default 0,
  last_message_at timestamptz,
  is_muted        boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, gmail_thread_id)
);

-- ---------------------------------------------------------------------------
-- 1.6 sender_rules
-- Explicit or system-learned rules for how to handle a sender or domain.
-- rule_type:   sender_exact | domain | category | pattern
-- rule_action: always_keep | always_archive | digest_only | always_review |
--              unsubscribe_if_possible | never_unsubscribe
-- source:      user_manual | system_learned | onboarding_cleanup
-- sender_id is nullable — a rule can target a domain without a specific sender.
-- ---------------------------------------------------------------------------
create table sender_rules (
  id               uuid          primary key default gen_random_uuid(),
  user_id          uuid          not null references users(id) on delete cascade,
  sender_id        uuid          references senders(id) on delete cascade,
  sender_email     text,
  sender_domain    text,
  rule_type        text          not null,
  rule_action      text          not null,
  source           text          not null,
  confidence_score numeric(5,2),
  active           boolean       not null default true,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

-- ---------------------------------------------------------------------------
-- 1.7 feedback_events
-- Immutable event log of user signals used to train the preference-learning
-- engine. Never update rows — only insert.
-- event_type: email_opened | email_replied | email_clicked |
--             email_archived_manual | email_restored | email_marked_important |
--             sender_keep_forever | sender_archive_forever |
--             unsubscribe_confirmed | search_for_sender |
--             review_keep | review_archive
-- ---------------------------------------------------------------------------
create table feedback_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references users(id) on delete cascade,
  sender_id   uuid        references senders(id) on delete set null,
  message_id  uuid        references messages(id) on delete set null,
  event_type  text        not null,
  event_value text,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1.8 actions_log
-- Audit trail for every action the system (or user) takes on a message.
-- Stores gmail_message_id as a denormalized fallback in case the messages row
-- is later deleted.
-- action_source: system_autopilot | user_manual | initial_cleanup | review_queue
-- status:        pending | succeeded | failed | undone
-- ---------------------------------------------------------------------------
create table actions_log (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references users(id) on delete cascade,
  sender_id        uuid        references senders(id) on delete set null,
  message_id       uuid        references messages(id) on delete set null,
  gmail_message_id text,
  action_type      text        not null,
  action_source    text        not null,
  status           text        not null,
  reason           text,
  reversible       boolean     not null default true,
  undone           boolean     not null default false,
  undone_at        timestamptz,
  metadata         jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1.9 review_queue
-- Messages that the safety agent flagged for user review before action.
-- priority: 1 (highest) – 100 (lowest), default 50.
-- One row per (user, message) — enforced by unique constraint.
-- ---------------------------------------------------------------------------
create table review_queue (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references users(id) on delete cascade,
  message_id      uuid        not null references messages(id) on delete cascade,
  sender_id       uuid        references senders(id) on delete set null,
  queue_reason    text        not null,
  priority        int         not null default 50,
  expires_at      timestamptz,
  resolved        boolean     not null default false,
  resolved_action text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, message_id)
);

-- ---------------------------------------------------------------------------
-- 1.10 digests
-- Periodic summary records sent to the user.
-- digest_type: daily | weekly | on_demand
-- summary is a free-form JSONB blob (counts, top senders, actions taken, etc.)
-- ---------------------------------------------------------------------------
create table digests (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  digest_type  text        not null,
  period_start timestamptz not null,
  period_end   timestamptz not null,
  summary      jsonb       not null,
  delivered    boolean     not null default false,
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- messages: most common query patterns
create index idx_messages_user_internal_date   on messages(user_id, internal_date desc);
create index idx_messages_user_sender          on messages(user_id, sender_id);
create index idx_messages_user_final_category  on messages(user_id, final_category);
create index idx_messages_user_review_status   on messages(user_id, review_status);

-- senders: score-ranked lookups
create index idx_senders_user_importance on senders(user_id, importance_score desc);
create index idx_senders_user_clutter    on senders(user_id, clutter_score desc);

-- review_queue: fetch unresolved items for a user
create index idx_review_queue_user_resolved on review_queue(user_id, resolved);

-- actions_log: chronological fetch per user
create index idx_actions_log_user_created_at on actions_log(user_id, created_at desc);

-- feedback_events: chronological fetch per user
create index idx_feedback_events_user_created_at on feedback_events(user_id, created_at desc);
