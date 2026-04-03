an AI inbox operating system that does an initial cleanup, then continuously learns what matters and quietly keeps the inbox clean over time.

1. Product thesis
Core problem
People get too many emails, and existing tools fail in one of four ways:
dumb unsubscribe bundles
static filters
aggressive cleanup that feels dangerous
“AI assistant” products that generate replies but do not reduce inbox burden
The real pain is not just spam. It is:
promotional overload
irrelevant recurring emails
inbox clutter hiding important messages
time wasted manually triaging
fear of missing something important
Core promise
Inbox Autopilot cleans your inbox once, then keeps it clean automatically without making risky decisions.
Product outcome
A user should feel:
important emails are surfaced
junk disappears
newsletters/promos stop owning the inbox
the system keeps getting smarter
they stay in control

2. Target user
Do not start broad. That’s a mistake.
Best initial user
People with high email volume but low desire to manually manage email:
college applicants / students
busy professionals
founders / operators
job seekers
parents
people with years of accumulated inbox mess
Best wedge
The strongest wedge is:
“Clean up my inbox and keep it clean.”
Not:
“AI email assistant”
“smart email”
“personal productivity agent”
Those are too vague.

3. Positioning
One-line positioning
An AI autopilot for your inbox that learns what you care about and handles the rest.
Sharp differentiation
Compared to Unroll.me:
not just newsletters
not static
learns over time
takes actions continuously
Compared to Gmail filters:
no manual rule writing
adapts to changing behavior
understands importance, not just keywords
Compared to AI email drafting tools:
this reduces inbox burden instead of helping write more email

4. Product principles
These are non-negotiable.
Principle 1: Safety first
If users think the product might hide something important, they will not trust it.
So:
never permanently delete by default
archive before delete
always make actions reversible
explain why something was classified
use confidence thresholds
Principle 2: Value in 5 minutes
Initial cleanup must feel magical.
The first session should:
scan inbox
group obvious clutter
show quick wins
allow one-click cleanup
immediately reduce visible mess
Principle 3: Quiet automation
The product should not constantly ask for permission.
It should:
act automatically on high-confidence cases
ask only on borderline cases
summarize what it did
Principle 4: Learn from behavior
Real product moat comes from personalized learning:
what user opens
what user replies to
what user searches for later
what user moves back from archive
what user stars / marks important
what user explicitly rescues or blocks
Principle 5: Never feel like homework
Most productivity tools fail because they create setup work.
This should be:
connect email
review suggestions
approve autopilot level
done

5. Product scope
V1
Focus on one email provider first:
Gmail only
That is the right move.
 Do not support Outlook, iCloud, Yahoo, etc. at launch.
Core V1 capabilities
Gmail connect
Initial inbox scan
Categorize emails into buckets
Bulk cleanup suggestions
Autopilot rules with learning
Safe archive / unsubscribe / label actions
Daily or real-time maintenance
Recovery center for mistakes
User feedback loop
Explicitly not in V1
Do not build these yet:
AI reply generation
calendar integration
scheduling assistant
voice assistant
team/shared inbox
cross-provider support
complex workflows
Those are distractions.

6. Core agent system
This product does not need fake “agent theater.” It needs a reliable decision system.
The actual architecture should look like this:
Main components
Email ingestion service
Classification engine
Preference learning engine
Action engine
Safety / policy engine
User feedback engine
Digest / transparency layer
Functional agent roles
1. Ingestion agent
Responsible for:
fetching emails from Gmail
parsing headers/body/metadata
extracting sender, domain, thread patterns, unsubscribe links, categories, frequency
2. Classification agent
Determines:
important
personal
transactional
work/school relevant
promotional
newsletter
spam-like
low-value recurring
uncertain
It also outputs:
confidence score
reasoning tags
recommended action
3. Preference-learning agent
Builds a user-specific model of:
what senders matter
what content patterns matter
what domains are usually junk
what the user consistently ignores
what the user unexpectedly cares about
4. Action agent
Executes:
archive
label
unsubscribe
mute thread
keep in inbox
mark high priority
summarize in daily digest
5. Safety agent
Checks:
is confidence high enough?
has the user historically wanted this type of message?
is this sender new or previously important?
is there any billing / travel / school / security signal?
should this be held for review?
6. Digest agent
Creates:
“what was handled”
“what might need review”
“new senders I’m unsure about”
“rescued emails that helped train the system”

7. Detailed backend logic
Now the real part.
7.1 Email ingestion pipeline
Step 1: Gmail OAuth
User connects Gmail account with scopes for:
read email metadata/body as needed
modify labels
archive messages
optionally unsubscribe via message headers or sender pages where safe
Do not request dangerous permissions you do not need.
Step 2: Initial sync
System pulls a bounded set first:
inbox emails
recent archived/promotional emails
maybe last 90–180 days initially
Do not ingest the entire inbox history at once unless needed. Too slow and expensive.
Step 3: Normalize email objects
For each email:
message_id
thread_id
sender_name
sender_email
sender_domain
subject
snippet
body_text
timestamp
labels
category
unsubscribe headers present?
attachment presence
transactional signals
thread reply count
read/unread status
starred/important status
Step 4: Sender-level aggregation
Build sender profiles:
email frequency
average open rate
average reply rate
archive rate
restore-from-archive rate
unsubscribe likelihood
category distribution
recency pattern
This matters because decisions should often be made at sender/domain level, not just per-message.

7.2 Feature extraction
For each email and sender, derive signals.
Email-level signals
contains invoice/receipt/order/shipping terms
contains school/work/calendar/logistics terms
security-related language
urgency phrases
promo language
discount / sale / marketing language
newsletter structure
no-reply sender
mass email patterns
has unsubscribe header
thread engagement
known personal contact
past user action on similar emails
Sender-level signals
open ratio
reply ratio
star ratio
search-back ratio
archive without read ratio
delete ratio
rescue ratio
frequency per week
domain trust score
new sender vs known sender
User-behavior signals
opens within 24 hours
replies ever
moves from archive back to inbox
searches sender later
clicks email often
reads fully vs ignores
marks important
manually unsubscribes
manually keeps recurring sender

7.3 Classification logic
You should not rely on one LLM call deciding everything. Bad idea.
Use a layered system:
Layer 1: deterministic rules
Handle obvious cases:
receipts
shipping confirmations
password resets
2FA codes
calendar invites
billing notices
school domains
known contacts
obvious promos/newsletters
Layer 2: ML / scoring model
Use structured features to produce:
category probabilities
risk score
action recommendation score
Layer 3: LLM adjudication for ambiguous emails
Use an LLM only when:
class is uncertain
sender is new
content is nuanced
rules conflict
the consequence of being wrong is meaningful
LLM output should be constrained JSON, not freeform.
Example output:
category
importance_score
action
confidence
explanation_tags
Example classes
critical_transactional
personal_human
work_or_school_relevant
recurring_but_useful
recurring_low_value
promotion
newsletter
spam_like
uncertain

7.4 Decision engine
This is where the product lives or dies.
For each email:
If critical / personal / school / security
keep inbox
optionally mark priority
If promo/newsletter with very high confidence and low user engagement
archive automatically
optionally recommend unsubscribe
If recurring low-value sender with strong evidence
archive automatically
show in digest only
If uncertain
leave in inbox or place in review queue
ask user with lightweight decision UI
If sender used to be ignored but recently engaged
downgrade automation aggressiveness for that sender
This is crucial. Preferences are not static.

7.5 Preference learning logic
This is the moat.
You need a per-user preference graph.
Sender preference state
For each sender/domain:
trust_score
importance_score
promo_tolerance
archive_propensity
unsubscribe_propensity
review_required flag
last_override timestamp
Learning updates
Every user action should update the model:
opens boost importance
replies strongly boost importance
repeated archive-without-open lowers importance
restore-from-archive strongly penalizes automation aggressiveness
manual unsubscribe boosts unsubscribe confidence
searching for sender after archive means “do not over-filter this sender”
Behavior decay
Use time decay.
 Old behavior should matter less than recent behavior.
Example:
user ignored Spotify for 6 months
now starts opening Spotify weekly
system must adapt quickly
This directly answers the issue you raised in prior chats.

7.6 Action engine
Actions should be tiered.
Safe actions
label
archive
mute
show in digest
Medium-risk actions
unsubscribe
sender-level future archive rule
High-risk actions
delete permanently
block sender entirely
Do not do high-risk actions by default.
Action policy
archive is default
unsubscribe only after strong evidence or explicit user approval
delete only via trash and only when user deliberately opts in

7.7 Autopilot modes
Need clear control.
Mode 1: Suggest Only
system recommends actions
user approves
Mode 2: Safe Autopilot
auto-archives high-confidence clutter
asks before unsubscribe on borderline senders
Mode 3: Aggressive Autopilot
auto-archives and unsubscribes more broadly
still protects critical categories
Most users should start in Mode 2.

7.8 Recovery system
This is mandatory.
Recovery center must include
all archived emails by autopilot
all unsubscribe actions
all sender-level rules created
undo per action
restore sender to inbox
“always keep” setting
“never keep” setting
Without this, product trust collapses.

8. Data model
At a high level:
Users
id
email
provider
autopilot_mode
notification preferences
onboarding state
Messages
message_id
thread_id
user_id
sender_id
subject
snippet
body_hash / structured content
category
importance_score
confidence_score
recommended_action
executed_action
action_reason
Senders
sender_id
user_id
sender_email
domain
sender_name
aggregated_behavior_metrics
sender_state
last_seen
Feedback events
user_id
message_id / sender_id
event_type
timestamp
before_state
after_state
Rules / preferences
user_id
sender/domain/category target
action
source (manual / learned / inferred)
confidence
active status
Audit log
action_id
user_id
message_id
action_type
timestamp
reversible
undo_status

9. UX flow
Now the product experience.
The best UX is not “dashboard first.”
 It should feel like guided transformation.
Primary flow
Landing page
Connect Gmail
Initial scan / analysis
Inbox diagnosis
Review cleanup recommendations
Choose autopilot mode
Enter live dashboard
Receive ongoing digests / passive maintenance

10. Page-by-page UI design
Now the exact product structure.

Page 1: Landing page
Goal
Get connection and explain value instantly.
Above the fold
Headline:
 Your inbox, on autopilot.
Subheadline:
 Clean up the mess, unsubscribe from what you don’t want, and keep important emails front and center.
Primary CTA:
 Connect Gmail
Secondary CTA:
 See how it works
Key sections
1. Before / after visual
Split mock inbox:
cluttered inbox
clean inbox with important emails surfaced
2. How it works
Three steps:
scan your inbox
review quick wins
turn on autopilot
3. Safety section
never permanently deletes by default
everything is reversible
you stay in control
4. Social proof placeholder
Later:
testimonials
number of emails cleaned
unsubscribe count
Design style
minimal
not corporate blue spam-tool aesthetic
clean white / off-white with strong black text
maybe subtle green for “clean” state
product-first, not AI buzzword-first

Page 2: Connect Gmail page
Goal
Reduce trust friction.
Layout
Centered card:
Google sign-in button
permission explanation
short bullets:
read your inbox to classify messages
archive and label on your behalf
never send email without your permission
Below
“Why we need access” expandable explainer
Design note
This page should feel extremely trustworthy and boring in the best way possible.

Page 3: Initial scan page
Goal
Make the wait feel valuable.
UI
Progress screen with live stats:
emails scanned
recurring senders found
promo/newsletter candidates
important senders detected
likely cleanup opportunities
Dynamic micro-updates
“Found 124 promotional emails from 18 repeat senders”
“Detected 9 high-priority senders you consistently engage with”
“Found 34 low-value recurring threads”
Important
Do not show a spinner with no meaning. That feels fake.

Page 4: Inbox diagnosis page
Goal
Give the user a clear picture of the problem.
Main sections
Top summary cards
Potential emails to archive
Potential senders to unsubscribe from
Important senders detected
Estimated inbox reduction
Email categories chart/list
promotions
newsletters
transactional
personal
school/work
uncertain
Repeat clutter table
Columns:
sender
emails in last 30 days
your engagement
suggested action
CTA
Review Cleanup Plan
This page is where the user first feels, “oh wow.”

Page 5: Cleanup review page
Goal
Deliver the initial magic moment.
Layout
Three stacked modules:
Module A: Safe bulk archives
Examples:
“Archive 248 promotional emails from senders you never open”
“Hide recurring low-value updates from 12 senders”
Each row includes:
sender
rationale
risk indicator
preview count
toggle on/off
Module B: Suggested unsubscribes
Examples:
“Unsubscribe from 8 senders you archive every time”
Each includes:
sender
evidence
confidence badge
preview
Module C: Protected senders
Examples:
friends/family
school
finance/security
travel
shopping receipts you tend to open
This reassures trust.
Bottom CTA
Apply Cleanup
UX requirement
User must be able to click any sender and inspect sample emails before approving.

Page 6: Cleanup complete / autopilot setup
Goal
Convert the one-time wow into ongoing usage.
Top state
Celebratory but restrained:
“Your inbox is now cleaner.”
“We archived 318 emails and unsubscribed you from 6 low-value senders.”
Next step
Choose autopilot mode:
Suggest Only
Safe Autopilot
Aggressive Autopilot
Recommendation
Highlight Safe Autopilot as recommended.
Supporting explanation
what happens automatically
what still comes to review
how to undo anytime
CTA:
 Turn On Autopilot

Page 7: Main dashboard
This is the core logged-in product.
Layout
Left sidebar:
Overview
Review Queue
Important
Handled
Senders
Recovery Center
Settings
Main overview page sections
1. Today summary
emails handled
archived automatically
unsubscribed
messages needing review
high-priority emails surfaced
2. Review queue
Cards for uncertain items:
sender
subject
snippet
why it’s uncertain
 Actions:
keep
archive
always keep sender
always archive sender
unsubscribe
3. Important surfaced
Emails the system believes matter most
4. Recent autopilot actions
A feed of:
archived promotional thread
muted sender digest
flagged billing email important
This builds transparency.

Page 8: Review queue page
Goal
Train the model with minimal friction.
UI pattern
Tinder-style binary decisions would be tempting but is too gimmicky.
 Better is a compact triage list.
Each email card:
sender
subject
snippet
tag chips: promo / newsletter / work / uncertain / new sender
reason text: “You’ve never opened this sender, but it contains event language.”
Actions:
Keep inbox
Archive
Ask me next time
Always keep sender
Always archive sender
Unsubscribe
Keyboard shortcuts
Important for power users.

Page 9: Senders page
Goal
Let users manage patterns, not individual emails.
Table columns
sender
category
emails / month
your engagement
current rule
confidence
last action
Sender detail drawer
Shows:
recent messages
engagement history
why system made current decision
controls:
always keep
always archive
always summarize
unsubscribe
reset learned preference
This page is extremely important because sender-level control makes the product feel intelligent.

Page 10: Recovery center
Goal
Make trust bulletproof.
Sections
Archived by autopilot
Unsubscribed senders
Muted threads
Recent rule changes
Each entry includes:
what happened
when
why
undo button
Key UI element
Search bar:
 “Find something the autopilot handled”
This should be very easy to use.

Page 11: Daily digest page / email view
Goal
Show non-urgent handled items without cluttering inbox.
Sections
Handled today
New recurring senders detected
Review needed
Suggested unsubscribes
Important items surfaced
Digest tone:
calm
concise
operational
No fluffy AI language.

Page 12: Settings
Sections
Autopilot controls
mode
confidence threshold
action types allowed
Protected categories
finance
travel
school/work
security
personal contacts
Notifications
instant
daily digest
weekly summary
none
Connected account
Gmail account management
disconnect
Privacy / data
delete stored data
export preferences
model training transparency

11. Critical UX details
These matter more than fancy visuals.
Show reasoning
Users need to know why something happened.
Each handled email should have a short explanation like:
“Archived because you’ve received 17 emails from this sender in 30 days and haven’t opened any.”
“Kept in inbox because you usually open this sender within 24 hours.”
“Flagged important because it contains billing language and comes from a sender you engage with.”
Confidence badges
Useful categories:
High confidence
Needs review
New pattern detected
Soft trust language
Never say:
“We know what matters to you”
 Say:
“Based on your recent behavior…”
That is less creepy and more honest.

12. Notifications strategy
Do not overdo notifications.
Best approach
initial setup summary
daily digest optional
only alert for:
important surfaced item
new uncertain sender pattern
failed unsubscribe/action issue

13. Backend technical architecture
A clean version:
Services
1. Auth service
Gmail OAuth
session management
2. Sync service
pulls new emails incrementally
webhook or polling-based updates
3. Parsing service
cleans and structures email content
4. Classification service
rules + scoring + LLM fallback
5. Preference engine
updates sender/user model from actions
6. Action execution service
archive / label / unsubscribe / mute
7. Audit/recovery service
log and undo actions
8. Digest service
generates user-facing summaries

14. Suggested backend execution order
This is the actual build order I’d recommend.
Phase 1: Core infrastructure
Gmail auth
inbox sync
message parsing
basic data model
dashboard shell
Phase 2: Initial cleanup engine
sender aggregation
deterministic rules
safe recommendations UI
archive flow
unsubscribe flow
recovery center
Phase 3: Autopilot
ongoing sync
automated safe archive
review queue
audit logs
digest system
Phase 4: Personalization moat
preference learning
recent behavior weighting
sender trust scoring
recovery-aware learning
LLM handling for uncertainty

15. Biggest product risks
Be honest about these.
Risk 1: Trust collapse
One bad miss can kill retention.
Mitigation
archive, don’t delete
recovery center
protected categories
conservative defaults
Risk 2: Weak personalization
If it feels generic, users will leave.
Mitigation
sender-level learning
recent behavior weighting
strong feedback loops
Risk 3: Setup friction
Too much configuration kills adoption.
Mitigation
default-safe onboarding
instant initial value
minimal choices upfront
Risk 4: Gmail dependency
Platform constraints matter.
Mitigation
build Gmail-first deeply rather than pretending to be cross-platform

16. What makes this genuinely good
The winning version is not just “AI sorts email.”
It has to combine:
instant cleanup
continuous autonomous maintenance
behavior-based personalization
extreme reversibility
low-friction UI
That combination is what makes it valuable.

17. My blunt recommendation on the product direction
This product is strong enough to build.
But only if you stay disciplined.
You should build:
Gmail only
inbox cleanup first
sender-level intelligence
archive first, delete never by default
review queue
recovery center
behavioral learning
You should not build yet:
AI reply generation
assistant chat wrapper
“compose better email”
calendar assistant
broad life admin tool
Those would dilute the wedge and weaken the product.

18. Best V1 framing
If I were positioning the first version, I would frame it as:
Inbox Autopilot
 Clean up your inbox once. Then keep it clean automatically.
That is clear, useful, and easy to market.



Frontend: Next.js App Router + TypeScript + Tailwind
Backend: Next.js API routes or route handlers for V1
DB: Postgres via Supabase or Neon
Auth: Clerk or NextAuth, plus Gmail OAuth
Queue/jobs: Upstash QStash or Inngest
LLM: OpenAI only for ambiguous classification, not every email
Email provider: Gmail only
Initial deployment: Vercel
That is enough.

1. Exact database schema
Use Postgres.
1.1 users
This stores product-level user info.
create table users (
 id uuid primary key default gen_random_uuid(),
 email text not null unique,
 full_name text,
 gmail_connected boolean not null default false,
 gmail_account_email text,
 autopilot_mode text not null default 'safe',
 onboarding_status text not null default 'not_started',
 timezone text not null default 'America/Los_Angeles',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
Notes
autopilot_mode: suggest_only, safe, aggressive
onboarding_status: not_started, gmail_connected, initial_scan_complete, cleanup_reviewed, autopilot_enabled

1.2 gmail_accounts
Separate Gmail connection info from app user info.
create table gmail_accounts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 gmail_user_id text,
 email_address text not null,
 access_token_encrypted text,
 refresh_token_encrypted text,
 token_expires_at timestamptz,
 history_id text,
 sync_status text not null default 'pending',
 last_full_sync_at timestamptz,
 last_incremental_sync_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id),
 unique(email_address)
);
Notes
history_id is important for Gmail incremental syncing.
Encrypt tokens. Do not store raw.

1.3 senders
This is critical. The product should think at sender/domain level, not just email level.
create table senders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 sender_email text not null,
 sender_name text,
 sender_domain text not null,
 first_seen_at timestamptz,
 last_seen_at timestamptz,
 message_count int not null default 0,
 open_count int not null default 0,
 reply_count int not null default 0,
 archive_count int not null default 0,
 restore_count int not null default 0,
 click_count int not null default 0,
 search_count int not null default 0,
 unsubscribe_count int not null default 0,
 trust_score numeric(5,2) not null default 0,
 importance_score numeric(5,2) not null default 0,
 clutter_score numeric(5,2) not null default 0,
 sender_category text,
 learned_state text not null default 'unknown',
 review_required boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, sender_email)
);
learned_state values
always_keep
prefer_keep
unknown
prefer_archive
always_archive
blocked
digest_only

1.4 messages
This stores normalized email-level data.
create table messages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 sender_id uuid references senders(id) on delete set null,
 gmail_message_id text not null,
 gmail_thread_id text not null,
 gmail_history_id text,
 subject text,
 snippet text,
 body_text text,
 body_html text,
 internal_date timestamptz,
 has_attachments boolean not null default false,
 is_read boolean not null default false,
 is_starred boolean not null default false,
 is_important_label boolean not null default false,
 gmail_category text,
 label_ids text[] not null default '{}',
 has_unsubscribe_header boolean not null default false,
 unsubscribe_url text,
 unsubscribe_mailto text,
 is_newsletter boolean not null default false,
 is_promotion boolean not null default false,
 is_transactional boolean not null default false,
 is_security_related boolean not null default false,
 is_personal_like boolean not null default false,
 contains_time_sensitive_terms boolean not null default false,
 deterministic_category text,
 model_category text,
 final_category text,
 importance_score numeric(5,2),
 clutter_score numeric(5,2),
 risk_score numeric(5,2),
 confidence_score numeric(5,2),
 recommended_action text,
 executed_action text,
 action_status text not null default 'none',
 action_reason text,
 review_status text not null default 'not_needed',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, gmail_message_id)
);
Useful enums conceptually
final_category:
critical_transactional
personal_human
work_school
recurring_useful
recurring_low_value
promotion
newsletter
spam_like
uncertain
recommended_action / executed_action:
keep_inbox
archive
unsubscribe
mute_thread
digest_only
review
none
review_status:
not_needed
queued
user_kept
user_archived
user_unsubscribed
expired

1.5 threads
Optional but useful.
create table threads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 gmail_thread_id text not null,
 subject text,
 message_count int not null default 0,
 last_message_at timestamptz,
 is_muted boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, gmail_thread_id)
);

1.6 sender_rules
This is how you keep user control explicit.
create table sender_rules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 sender_id uuid references senders(id) on delete cascade,
 sender_email text,
 sender_domain text,
 rule_type text not null,
 rule_action text not null,
 source text not null,
 confidence_score numeric(5,2),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
rule_type
sender_exact
domain
category
pattern
rule_action
always_keep
always_archive
digest_only
always_review
unsubscribe_if_possible
never_unsubscribe
source
user_manual
system_learned
onboarding_cleanup

1.7 feedback_events
This is the training loop.
create table feedback_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 sender_id uuid references senders(id) on delete set null,
 message_id uuid references messages(id) on delete set null,
 event_type text not null,
 event_value text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
event_type
email_opened
email_replied
email_clicked
email_archived_manual
email_restored
email_marked_important
sender_keep_forever
sender_archive_forever
unsubscribe_confirmed
search_for_sender
review_keep
review_archive

1.8 actions_log
This is the audit trail and recovery backbone.
create table actions_log (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 sender_id uuid references senders(id) on delete set null,
 message_id uuid references messages(id) on delete set null,
 gmail_message_id text,
 action_type text not null,
 action_source text not null,
 status text not null,
 reason text,
 reversible boolean not null default true,
 undone boolean not null default false,
 undone_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
action_source
system_autopilot
user_manual
initial_cleanup
review_queue
status
pending
succeeded
failed
undone

1.9 review_queue
Useful to keep explicit review items instead of recomputing every time.
create table review_queue (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 message_id uuid not null references messages(id) on delete cascade,
 sender_id uuid references senders(id) on delete set null,
 queue_reason text not null,
 priority int not null default 50,
 expires_at timestamptz,
 resolved boolean not null default false,
 resolved_action text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, message_id)
);

1.10 digests
create table digests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 digest_type text not null,
 period_start timestamptz not null,
 period_end timestamptz not null,
 summary jsonb not null,
 delivered boolean not null default false,
 delivered_at timestamptz,
 created_at timestamptz not null default now()
);

1.11 indexing
You will need indexes or this will get slow.
create index idx_messages_user_internal_date on messages(user_id, internal_date desc);
create index idx_messages_user_sender on messages(user_id, sender_id);
create index idx_messages_user_final_category on messages(user_id, final_category);
create index idx_messages_user_review_status on messages(user_id, review_status);
create index idx_senders_user_importance on senders(user_id, importance_score desc);
create index idx_senders_user_clutter on senders(user_id, clutter_score desc);
create index idx_review_queue_user_resolved on review_queue(user_id, resolved);
create index idx_actions_log_user_created_at on actions_log(user_id, created_at desc);
create index idx_feedback_events_user_created_at on feedback_events(user_id, created_at desc);

2. Exact Next.js App Router page structure
This is the clean V1 structure.
2.1 app routes
src/
 app/
   layout.tsx
   page.tsx

   (marketing)/
     page.tsx                -> landing page
     how-it-works/
       page.tsx
     privacy/
       page.tsx
     security/
       page.tsx

   (auth)/
     sign-in/
       page.tsx
     connect-gmail/
       page.tsx

   onboarding/
     layout.tsx
     page.tsx                -> onboarding redirect
     scan/
       page.tsx              -> initial scan progress
     diagnosis/
       page.tsx              -> inbox diagnosis
     cleanup/
       page.tsx              -> cleanup review
     autopilot/
       page.tsx              -> choose mode
     complete/
       page.tsx              -> success state

   dashboard/
     layout.tsx
     page.tsx                -> overview
     review/
       page.tsx
     important/
       page.tsx
     handled/
       page.tsx
     senders/
       page.tsx
     senders/
       [senderId]/
         page.tsx
     recovery/
       page.tsx
     digest/
       page.tsx
     settings/
       page.tsx

   api/
     auth/
       session/
         route.ts
     gmail/
       oauth/
         start/
           route.ts
         callback/
           route.ts
       sync/
         start/
           route.ts
         incremental/
           route.ts
       unsubscribe/
         route.ts
       archive/
         route.ts
       restore/
         route.ts

     onboarding/
       diagnosis/
         route.ts
       cleanup-preview/
         route.ts
       apply-cleanup/
         route.ts
       set-autopilot/
         route.ts

     review/
       list/
         route.ts
       resolve/
         route.ts

     senders/
       list/
         route.ts
       [senderId]/
         route.ts
       [senderId]/
         rule/
           route.ts

     recovery/
       list/
         route.ts
       undo/
         route.ts

     dashboard/
       summary/
         route.ts

     jobs/
       initial-sync/
         route.ts
       classify/
         route.ts
       autopilot-run/
         route.ts
       digest-generate/
         route.ts

2.2 component structure
src/
 components/
   marketing/
     Hero.tsx
     BeforeAfterInbox.tsx
     SafetySection.tsx
     HowItWorks.tsx

   onboarding/
     ScanProgress.tsx
     DiagnosisSummaryCards.tsx
     CategoryBreakdown.tsx
     RepeatClutterTable.tsx
     CleanupRecommendationList.tsx
     ProtectedSendersList.tsx
     AutopilotModeSelector.tsx

   dashboard/
     DashboardSidebar.tsx
     TopSummaryStats.tsx
     ReviewQueuePreview.tsx
     ImportantInboxList.tsx
     RecentActionsFeed.tsx
     HandledActionsTable.tsx
     SenderTable.tsx
     SenderDetailDrawer.tsx
     RecoveryTable.tsx
     DigestCard.tsx

   review/
     ReviewItemCard.tsx
     ReviewActionBar.tsx
     ReviewReasonBadge.tsx

   shared/
     AppShell.tsx
     PageHeader.tsx
     StatCard.tsx
     EmptyState.tsx
     LoadingSkeleton.tsx
     ConfidenceBadge.tsx
     ReasonPill.tsx
     UndoToast.tsx
     SearchInput.tsx
     FilterTabs.tsx
     ConfirmDialog.tsx

2.3 lib structure
src/
 lib/
   db.ts
   auth.ts
   gmail/
     client.ts
     sync.ts
     parser.ts
     history.ts
     actions.ts
   classification/
     rules.ts
     features.ts
     scorer.ts
     llm.ts
     final-decision.ts
   autopilot/
     policy.ts
     execute.ts
     review.ts
     learning.ts
   analytics/
     diagnosis.ts
     summary.ts
     digests.ts
   utils/
     dates.ts
     strings.ts
     email.ts
     confidence.ts

3. Full backend decision tree and action logic in pseudocode
This is the heart of the product.
Do not let the LLM run the product. Use deterministic logic first, then scoring, then LLM only for ambiguity.

3.1 initial sync pipeline
async function runInitialSync(userId: string) {
 const gmailAccount = await getGmailAccount(userId)
 const rawMessages = await gmailFetchRecentMessages(gmailAccount, {
   windowDays: 120,
   includeInbox: true,
   includePromotions: true,
   limit: 5000
 })

 for (const raw of rawMessages) {
   const parsed = normalizeGmailMessage(raw)
   const sender = await upsertSender(userId, parsed.sender)
   const features = extractFeatures(parsed, sender)
   const deterministic = classifyDeterministically(parsed, features)
   const scored = scoreMessage(parsed, sender, features, deterministic)

   let llmDecision = null
   if (shouldUseLLM(scored, deterministic, sender)) {
     llmDecision = await classifyWithLLM(parsed, sender, features)
   }

   const final = resolveFinalClassification({
     parsed,
     sender,
     deterministic,
     scored,
     llmDecision
   })

   await upsertMessage(userId, sender.id, parsed, final)
   await updateSenderAggregatesFromMessage(userId, sender.id, parsed, final)
 }

 await computeInboxDiagnosis(userId)
}

3.2 normalization
function normalizeGmailMessage(raw: GmailRawMessage): NormalizedMessage {
 return {
   gmailMessageId: raw.id,
   gmailThreadId: raw.threadId,
   subject: extractHeader(raw, "Subject"),
   from: extractHeader(raw, "From"),
   senderEmail: parseSenderEmail(raw),
   senderName: parseSenderName(raw),
   senderDomain: parseSenderDomain(raw),
   snippet: raw.snippet ?? "",
   bodyText: getBodyText(raw),
   bodyHtml: getBodyHtml(raw),
   internalDate: new Date(Number(raw.internalDate)),
   labelIds: raw.labelIds ?? [],
   hasAttachments: detectAttachments(raw),
   unsubscribeHeader: extractListUnsubscribe(raw),
   gmailCategory: inferGmailCategory(raw.labelIds),
   isRead: !raw.labelIds?.includes("UNREAD"),
   isStarred: raw.labelIds?.includes("STARRED") ?? false,
   isImportantLabel: raw.labelIds?.includes("IMPORTANT") ?? false
 }
}

3.3 feature extraction
function extractFeatures(msg: NormalizedMessage, sender: SenderRecord): MessageFeatures {
 const text = `${msg.subject} ${msg.snippet} ${msg.bodyText}`.toLowerCase()

 return {
   hasUnsubscribeHeader: !!msg.unsubscribeHeader,
   promoTerms: countMatches(text, [
     "sale", "off", "discount", "deal", "offer", "limited time", "shop now"
   ]),
   newsletterTerms: countMatches(text, [
     "newsletter", "weekly roundup", "digest", "top stories", "edition"
   ]),
   transactionalTerms: countMatches(text, [
     "receipt", "invoice", "order", "shipping", "delivered", "payment", "statement"
   ]),
   securityTerms: countMatches(text, [
     "password", "verification code", "security alert", "login", "2fa"
   ]),
   workSchoolTerms: countMatches(text, [
     "meeting", "class", "assignment", "deadline", "application", "schedule"
   ]),
   personalTerms: countMatches(text, [
     "hey", "checking in", "thank you", "let me know", "can you"
   ]),
   noreplyLike: /no-?reply|donotreply/i.test(msg.senderEmail),
   senderOpenRate: safeDivide(sender.open_count, sender.message_count),
   senderReplyRate: safeDivide(sender.reply_count, sender.message_count),
   senderRestoreRate: safeDivide(sender.restore_count, sender.archive_count),
   senderArchiveRate: safeDivide(sender.archive_count, sender.message_count),
   senderSearchRate: safeDivide(sender.search_count, sender.message_count),
   senderMessageFrequency: sender.message_count,
   recentEngagementBoost: computeRecentEngagementBoost(sender),
   isNewSender: sender.message_count < 3,
   fromImportantDomain: isImportantDomain(msg.senderDomain),
   fromSchoolOrWorkDomain: looksLikeSchoolOrWorkDomain(msg.senderDomain),
 }
}

3.4 deterministic classification
function classifyDeterministically(
 msg: NormalizedMessage,
 f: MessageFeatures
): DeterministicResult {
 if (f.securityTerms > 0) {
   return {
     category: "critical_transactional",
     importanceScore: 95,
     clutterScore: 5,
     riskScore: 95,
     action: "keep_inbox",
     confidence: 0.97,
     reasons: ["security_terms_detected"]
   }
 }

 if (f.transactionalTerms > 1) {
   return {
     category: "critical_transactional",
     importanceScore: 88,
     clutterScore: 10,
     riskScore: 85,
     action: "keep_inbox",
     confidence: 0.93,
     reasons: ["transactional_terms_detected"]
   }
 }

 if (f.fromSchoolOrWorkDomain && f.workSchoolTerms > 0) {
   return {
     category: "work_school",
     importanceScore: 85,
     clutterScore: 15,
     riskScore: 80,
     action: "keep_inbox",
     confidence: 0.9,
     reasons: ["school_or_work_sender"]
   }
 }

 if (f.hasUnsubscribeHeader && f.promoTerms >= 2) {
   return {
     category: "promotion",
     importanceScore: 15,
     clutterScore: 85,
     riskScore: 20,
     action: "archive",
     confidence: 0.88,
     reasons: ["promo_language", "unsubscribe_header_present"]
   }
 }

 if (f.hasUnsubscribeHeader && f.newsletterTerms >= 1) {
   return {
     category: "newsletter",
     importanceScore: 25,
     clutterScore: 70,
     riskScore: 25,
     action: "archive",
     confidence: 0.84,
     reasons: ["newsletter_structure_detected"]
   }
 }

 return {
   category: "uncertain",
   importanceScore: 50,
   clutterScore: 50,
   riskScore: 50,
   action: "review",
   confidence: 0.3,
   reasons: ["no_deterministic_rule"]
 }
}

3.5 scoring model
You do not need a fancy ML model for V1. Start with a weighted heuristic model.
function scoreMessage(
 msg: NormalizedMessage,
 sender: SenderRecord,
 f: MessageFeatures,
 deterministic: DeterministicResult
): ScoredResult {
 let importance = deterministic.importanceScore
 let clutter = deterministic.clutterScore
 let risk = deterministic.riskScore

 importance += f.senderReplyRate * 40
 importance += f.senderOpenRate * 25
 importance += f.senderSearchRate * 20
 importance += f.recentEngagementBoost
 importance += msg.isStarred ? 20 : 0
 importance += msg.isImportantLabel ? 12 : 0

 clutter += f.senderArchiveRate * 30
 clutter += f.hasUnsubscribeHeader ? 10 : 0
 clutter += f.promoTerms * 8
 clutter += f.newsletterTerms * 7
 clutter += f.noreplyLike ? 8 : 0
 clutter += sender.learned_state === "always_archive" ? 25 : 0

 risk += f.senderRestoreRate * 35
 risk += f.isNewSender ? 15 : 0
 risk += f.fromImportantDomain ? 20 : 0
 risk += f.transactionalTerms > 0 ? 20 : 0
 risk += f.securityTerms > 0 ? 30 : 0
 risk += sender.learned_state === "always_keep" ? 30 : 0

 importance = clamp(importance, 0, 100)
 clutter = clamp(clutter, 0, 100)
 risk = clamp(risk, 0, 100)

 const confidence = computeConfidence(deterministic, f, sender)

 return {
   importanceScore: importance,
   clutterScore: clutter,
   riskScore: risk,
   confidence
 }
}

3.6 LLM gate
Only use the LLM when needed.
function shouldUseLLM(
 scored: ScoredResult,
 deterministic: DeterministicResult,
 sender: SenderRecord
): boolean {
 if (deterministic.category !== "uncertain" && scored.confidence > 0.85) return false
 if (sender.learned_state === "always_keep" || sender.learned_state === "always_archive") return false
 if (scored.riskScore > 80) return false
 if (Math.abs(scored.importanceScore - scored.clutterScore) < 15) return true
 if (scored.confidence < 0.7) return true
 return false
}

3.7 LLM classification prompt behavior
The LLM should return strict JSON.
type LLMDecision = {
 category:
   | "critical_transactional"
   | "personal_human"
   | "work_school"
   | "recurring_useful"
   | "recurring_low_value"
   | "promotion"
   | "newsletter"
   | "spam_like"
   | "uncertain"
 recommendedAction:
   | "keep_inbox"
   | "archive"
   | "review"
   | "digest_only"
 confidence: number
 explanationTags: string[]
}
It should not be allowed to say “delete.”

3.8 final classification resolution
function resolveFinalClassification(input: {
 parsed: NormalizedMessage
 sender: SenderRecord
 deterministic: DeterministicResult
 scored: ScoredResult
 llmDecision: LLMDecision | null
}): FinalDecision {
 const { sender, deterministic, scored, llmDecision } = input

 if (sender.learned_state === "always_keep") {
   return {
     finalCategory: "recurring_useful",
     recommendedAction: "keep_inbox",
     confidenceScore: 0.99,
     reason: "user_or_system_sender_keep_rule"
   }
 }

 if (sender.learned_state === "always_archive") {
   return {
     finalCategory: "recurring_low_value",
     recommendedAction: "archive",
     confidenceScore: 0.98,
     reason: "user_or_system_sender_archive_rule"
   }
 }

 if (scored.riskScore >= 85) {
   return {
     finalCategory: deterministic.category === "uncertain"
       ? "critical_transactional"
       : deterministic.category,
     recommendedAction: "keep_inbox",
     confidenceScore: Math.max(scored.confidence, 0.9),
     reason: "high_risk_protected"
   }
 }

 if (llmDecision) {
   if (llmDecision.recommendedAction === "archive" && scored.riskScore > 60) {
     return {
       finalCategory: llmDecision.category,
       recommendedAction: "review",
       confidenceScore: 0.7,
       reason: "llm_archive_blocked_by_risk"
     }
   }

   return {
     finalCategory: llmDecision.category,
     recommendedAction: llmDecision.recommendedAction,
     confidenceScore: llmDecision.confidence,
     reason: llmDecision.explanationTags.join(",")
   }
 }

 if (
   scored.clutterScore >= 75 &&
   scored.importanceScore <= 30 &&
   scored.riskScore <= 35 &&
   scored.confidence >= 0.8
 ) {
   return {
     finalCategory: deterministic.category === "uncertain"
       ? "recurring_low_value"
       : deterministic.category,
     recommendedAction: "archive",
     confidenceScore: scored.confidence,
     reason: "high_clutter_low_importance"
   }
 }

 if (
   scored.importanceScore >= 70 ||
   scored.riskScore >= 65
 ) {
   return {
     finalCategory: deterministic.category === "uncertain"
       ? "recurring_useful"
       : deterministic.category,
     recommendedAction: "keep_inbox",
     confidenceScore: scored.confidence,
     reason: "importance_or_risk_above_threshold"
   }
 }

 return {
   finalCategory: "uncertain",
   recommendedAction: "review",
   confidenceScore: scored.confidence,
   reason: "fell_between_thresholds"
 }
}

3.9 onboarding diagnosis logic
async function computeInboxDiagnosis(userId: string) {
 const stats = await db.query(`
   select
     count(*) filter (where recommended_action = 'archive') as archive_candidates,
     count(*) filter (where final_category = 'promotion') as promotions,
     count(*) filter (where final_category = 'newsletter') as newsletters,
     count(*) filter (where recommended_action = 'review') as review_items,
     count(*) filter (where recommended_action = 'keep_inbox') as important_kept
   from messages
   where user_id = $1
 `, [userId])

 const topClutterSenders = await getTopClutterSenders(userId)
 const protectedSenders = await getProtectedSenders(userId)

 return {
   stats,
   topClutterSenders,
   protectedSenders
 }
}

3.10 initial cleanup recommendations
This is not per-message only. It should bundle by sender for a better UX.
async function buildCleanupRecommendations(userId: string) {
 const senders = await getSenderStats(userId)

 return senders
   .filter(sender => (
     sender.message_count >= 3 &&
     sender.clutter_score >= 70 &&
     sender.importance_score <= 35 &&
     sender.restore_count === 0
   ))
   .map(sender => ({
     senderId: sender.id,
     senderEmail: sender.sender_email,
     senderName: sender.sender_name,
     messageCount: sender.message_count,
     suggestedAction: sender.has_unsubscribe_option ? "unsubscribe_and_archive" : "archive",
     confidence: computeSenderCleanupConfidence(sender),
     reason: buildSenderReason(sender)
   }))
}

3.11 applying cleanup
async function applyCleanup(userId: string, selections: CleanupSelection[]) {
 for (const selection of selections) {
   const sender = await getSender(selection.senderId)

   if (!sender) continue

   if (selection.action === "archive") {
     const messageIds = await getRecentArchivableMessagesForSender(userId, sender.id)
     await gmailArchiveMessages(userId, messageIds)
     await logBulkAction(userId, sender.id, "archive", "initial_cleanup", messageIds)
     await createOrUpdateSenderRule(userId, sender.id, "always_archive", "onboarding_cleanup")
   }

   if (selection.action === "unsubscribe_and_archive") {
     const unsubscribed = await attemptUnsubscribe(sender)
     const messageIds = await getRecentArchivableMessagesForSender(userId, sender.id)
     await gmailArchiveMessages(userId, messageIds)
     await logBulkAction(userId, sender.id, "unsubscribe", "initial_cleanup", messageIds, { unsubscribed })
     await createOrUpdateSenderRule(userId, sender.id, "always_archive", "onboarding_cleanup")
   }

   if (selection.action === "keep") {
     await createOrUpdateSenderRule(userId, sender.id, "always_keep", "onboarding_cleanup")
   }
 }
}

3.12 autopilot run
This runs on new mail after onboarding.
async function runAutopilot(userId: string) {
 const newMessages = await syncIncrementalGmailMessages(userId)

 for (const msg of newMessages) {
   const sender = await getOrCreateSender(userId, msg.senderEmail)
   const features = extractFeatures(msg, sender)
   const deterministic = classifyDeterministically(msg, features)
   const scored = scoreMessage(msg, sender, features, deterministic)

   let llmDecision = null
   if (shouldUseLLM(scored, deterministic, sender)) {
     llmDecision = await classifyWithLLM(msg, sender, features)
   }

   const final = resolveFinalClassification({
     parsed: msg,
     sender,
     deterministic,
     scored,
     llmDecision
   })

   const autopilotMode = await getUserAutopilotMode(userId)
   const execution = decideAutopilotExecution(final, sender, autopilotMode)

   await saveMessageAndDecision(userId, sender.id, msg, final, execution)

   if (execution.type === "auto_archive") {
     await gmailArchiveMessage(userId, msg.gmailMessageId)
     await logAction(userId, sender.id, msg.gmailMessageId, "archive", "system_autopilot", final.reason)
   } else if (execution.type === "queue_review") {
     await addToReviewQueue(userId, msg, sender, execution.reason)
   } else if (execution.type === "keep_inbox") {
     // no-op except analytics
   }
 }
}

3.13 autopilot execution policy
function decideAutopilotExecution(
 final: FinalDecision,
 sender: SenderRecord,
 mode: "suggest_only" | "safe" | "aggressive"
): {
 type: "keep_inbox" | "auto_archive" | "queue_review"
 reason: string
} {
 if (final.recommendedAction === "keep_inbox") {
   return { type: "keep_inbox", reason: "important_or_protected" }
 }

 if (final.recommendedAction === "review") {
   return { type: "queue_review", reason: "uncertain_classification" }
 }

 if (final.recommendedAction === "archive") {
   if (mode === "suggest_only") {
     return { type: "queue_review", reason: "suggest_mode_no_auto_actions" }
   }

   if (mode === "safe") {
     if (final.confidenceScore >= 0.9 && sender.restore_count === 0) {
       return { type: "auto_archive", reason: "safe_mode_high_confidence" }
     }
     return { type: "queue_review", reason: "safe_mode_not_confident_enough" }
   }

   if (mode === "aggressive") {
     if (final.confidenceScore >= 0.8) {
       return { type: "auto_archive", reason: "aggressive_mode_threshold_met" }
     }
     return { type: "queue_review", reason: "aggressive_mode_still_uncertain" }
   }
 }

 return { type: "queue_review", reason: "default_fallback" }
}

3.14 learning loop
This is crucial.
async function recordFeedbackAndRetrain(input: {
 userId: string
 senderId?: string
 messageId?: string
 eventType: string
 eventValue?: string
}) {
 await insertFeedbackEvent(input)

 if (input.senderId) {
   const sender = await getSenderById(input.senderId)
   const updated = recomputeSenderState(sender, input.eventType)
   await updateSender(input.senderId, updated)
 }
}
Sender state update logic
function recomputeSenderState(sender: SenderRecord, eventType: string): Partial<SenderRecord> {
 let importance = Number(sender.importance_score)
 let clutter = Number(sender.clutter_score)
 let reviewRequired = sender.review_required

 switch (eventType) {
   case "email_opened":
     importance += 5
     clutter -= 3
     break
   case "email_replied":
     importance += 15
     clutter -= 8
     break
   case "email_restored":
     importance += 20
     clutter -= 10
     reviewRequired = true
     break
   case "email_archived_manual":
     clutter += 5
     importance -= 2
     break
   case "unsubscribe_confirmed":
     clutter += 20
     importance -= 10
     break
   case "sender_keep_forever":
     return {
       learned_state: "always_keep",
       importance_score: 100,
       clutter_score: 0,
       review_required: false
     }
   case "sender_archive_forever":
     return {
       learned_state: "always_archive",
       importance_score: 0,
       clutter_score: 100,
       review_required: false
     }
 }

 importance = clamp(importance, 0, 100)
 clutter = clamp(clutter, 0, 100)

 let learnedState: SenderRecord["learned_state"] = "unknown"
 if (importance >= 80) learnedState = "prefer_keep"
 if (clutter >= 80 && importance < 30) learnedState = "prefer_archive"

 return {
   importance_score: importance,
   clutter_score: clutter,
   learned_state: learnedState,
   review_required: reviewRequired
 }
}

3.15 recovery / undo
async function undoAction(actionId: string, userId: string) {
 const action = await getActionLog(actionId, userId)
 if (!action || action.undone || !action.reversible) {
   throw new Error("Action cannot be undone")
 }

 if (action.action_type === "archive") {
   await gmailRestoreMessage(userId, action.gmail_message_id)
 }

 if (action.action_type === "unsubscribe") {
   // Usually cannot truly reverse at sender level externally.
   // But we can remove future archive rules and flag sender as always_keep.
   if (action.sender_id) {
     await createOrUpdateSenderRule(userId, action.sender_id, "always_keep", "user_manual")
   }
 }

 await markActionUndone(actionId)
}

4. V1 component-by-component detailed UI spec
Now the actual interface design.
You asked for page-by-page detailed UI design. I’m going even more concrete: section by section, component by component.
The design direction should be:
very clean
high trust
not playful startup nonsense
no fake AI sparkle aesthetic
strong hierarchy
black/white/neutral with one accent color
dense enough to feel useful, not overwhelming

4.1 Marketing landing page
Route: /
A. Header
Component: MarketingHeader
Contents:
left: wordmark Inbox Autopilot
right nav: How it works, Security, Sign in
primary CTA button: Connect Gmail
B. Hero section
Component: Hero
Layout:
two-column on desktop
stacked on mobile
Left column:
headline: Your inbox, on autopilot.
subheadline: Clean up clutter, protect important email, and keep your inbox under control automatically.
CTA row:
primary: Connect Gmail
secondary: See how it works
trust microcopy under CTA:
Gmail only
No permanent deletion by default
Everything is reversible
Right column:
product mockup showing:
before inbox with clutter
after inbox with clean state
small tag labels: Archived, Protected, Needs review
C. Problem/value strip
Component: ProblemValueStrip
3 cards:
Find important email faster
Archive obvious clutter automatically
Learn what matters to you over time
D. How it works
Component: HowItWorks
Three-step row:
Connect Gmail
Review cleanup plan
Turn on autopilot
Each step should have a simple icon and one sentence.
E. Safety section
Component: SafetySection
This matters a lot.
Content blocks:
Never permanently deletes by default
You can undo every action
Important categories stay protected
F. FAQ teaser
Questions:
What email accounts do you support?
Do you read my email?
Can I undo mistakes?
Will it unsubscribe me automatically?
G. Footer
Standard links.

4.2 Connect Gmail page
Route: /connect-gmail
Layout
Centered, medium-width card.
Components
A. Title block
headline: Connect your Gmail
subtext: We need access to read and organize your inbox on your behalf.
B. Permission explainer card
Bullet list:
read email metadata and content for classification
archive and label messages for you
never send messages without your permission
C. Connect button
Big Google button:
Continue with Gmail
D. Trust footer
Small text:
Your emails are never permanently deleted by default.
You can disconnect at any time.

4.3 Initial scan page
Route: /onboarding/scan
Purpose
Make progress feel real.
Components
A. Progress ring + title
headline: Scanning your inbox
subtext: Looking for recurring clutter, important senders, and safe cleanup opportunities.
B. Live stats grid
Component: ScanProgress
4 cards:
emails scanned
recurring senders found
likely clutter detected
protected senders identified
C. Activity feed
Scrolling text feed:
Analyzing messages from 42 recurring senders
Detected 8 financial and security senders
Found 126 promotional emails with low engagement
This is important. No dead spinner.

4.4 Diagnosis page
Route: /onboarding/diagnosis
Components
A. Page header
title: Your inbox diagnosis
subtitle: Here’s what we found.
B. Top stats row
Component: DiagnosisSummaryCards
Cards:
Potential emails to archive
Suggested unsubscribes
Important senders protected
Estimated inbox reduction
C. Category breakdown
Component: CategoryBreakdown
Use horizontal bars, not pie charts.
Rows:
Promotions
Newsletters
Transactional
Personal
Work/school
Uncertain
Each row:
count
percentage
short explanation tooltip
D. Repeat clutter table
Component: RepeatClutterTable
Columns:
sender
emails in last 30 days
your engagement
suggested action
confidence
Each row should have:
sender avatar/initial
sender name + email
badge like Promo, Newsletter, Low-value recurring
quick view button
E. Protected sender module
Component: ProtectedSendersList
Shows examples:
bank/security emails
school/work domains
frequent human contacts
receipts/order confirmations
F. CTA
primary button: Review cleanup plan

4.5 Cleanup review page
Route: /onboarding/cleanup
This is the magic page. It needs to feel extremely clear.
Layout
Three modules stacked vertically.

Module A: Safe bulk archive recommendations
Component: CleanupRecommendationList
Each recommendation card includes:
sender name + email
count of emails affected
suggested action
confidence badge
reason text
checkbox toggle
sample messages preview
Example card:
Old Navy
18 emails in last 30 days
action: Archive future emails
confidence: High
reason: You received 18 emails, opened 0, and this sender includes unsubscribe headers.
Actions:
keep toggle on/off
preview button

Module B: Unsubscribe suggestions
Same card format, but more cautious.
Fields:
sender
emails/month
engagement rate
unsubscribe confidence
preview of what will happen:
Try to unsubscribe
Archive similar future emails
This module should visually look slightly more serious than archive-only.

Module C: Protected senders
This gives trust.
Cards showing:
sender name
reason protected
category badge
Example:
Delta Air Lines
Protected: travel / time-sensitive
You usually open these

Sticky footer action bar
Always visible on desktop.
Shows:
8 archive actions selected
3 unsubscribe actions selected
Buttons:
secondary: Back
primary: Apply cleanup

4.6 Autopilot mode page
Route: /onboarding/autopilot
Components
A. Header
title: Choose your autopilot level
subtitle: You can change this anytime.
B. Mode cards
Component: AutopilotModeSelector
Three side-by-side cards.
Card 1: Suggest only
description: Nothing happens automatically. You review every recommendation.
best for: cautious users
Card 2: Safe Autopilot
description: Automatically archives only high-confidence clutter. Borderline cases go to review.
tag: Recommended
Card 3: Aggressive Autopilot
description: Handles more low-value email automatically, while still protecting important categories.
Each card contains:
action summary bullets
risk level label
radio selector
C. CTA
button: Turn on autopilot

4.7 Onboarding complete page
Route: /onboarding/complete
Components
A. Success summary
title: Your inbox is cleaner.
summary chips:
318 emails archived
6 senders unsubscribed
14 important senders protected
B. What happens next
Small checklist:
new incoming clutter will be handled automatically
uncertain emails go to your review queue
you can undo anything from Recovery
C. CTA
Go to dashboard

4.8 Dashboard overview
Route: /dashboard
This is the main operational view.
Layout
Desktop:
left sidebar fixed
main content area
right rail optional later, not needed V1
Mobile:
top nav + tabbed sections

Sidebar
Component: DashboardSidebar
Items:
Overview
Review queue
Important
Handled
Senders
Recovery
Digest
Settings
Top:
product logo
connected email
autopilot mode badge
Bottom:
settings
disconnect

Main overview content
A. Page header
Component: PageHeader
title: Overview
subtitle: Here’s what your autopilot handled today.
Right side:
autopilot status badge
Run sync button

B. Top summary stats
Component: TopSummaryStats
4 stat cards:
Handled today
Archived automatically
Needs review
Important surfaced
Each card:
large number
change vs yesterday
tooltip

C. Review queue preview
Component: ReviewQueuePreview
Shows top 3–5 items needing decisions.
Each item row:
sender
subject
reason
action buttons: Keep, Archive
Bottom link:
View all review items

D. Important inbox section
Component: ImportantInboxList
Not your entire inbox. Just surfaced important items.
Each card:
sender
subject
short snippet
why it’s surfaced
open in Gmail button

E. Recent actions feed
Component: RecentActionsFeed
Rows:
action icon
sender
what happened
reason
undo button if available
Example:
Archived 4 emails from Zara
reason: High-confidence low engagement recurring sender

4.9 Review queue page
Route: /dashboard/review
This page trains the system.
Header
title: Review queue
subtitle: These emails need a decision before autopilot acts.
Filters row
Component: FilterTabs
Tabs:
All
New senders
Borderline promo
Possible important
Expiring soon
Review list
Component: ReviewItemCard
Each card includes:
Top row
sender avatar
sender name + email
confidence badge
reason pill cluster
Middle
subject
snippet preview
metadata row:
received time
sender history
similar emails count
Why this is here
Text block:
You have not seen this sender before, but the message includes event language and an unsubscribe header.
Action bar
Buttons:
Keep in inbox
Archive
Always keep sender
Always archive sender
Unsubscribe
The always actions should be secondary/dropdown, not primary.

4.10 Important page
Route: /dashboard/important
Purpose
Single place for surfaced important items.
Components
A. Header
title: Important
subtitle: Messages your autopilot thinks matter most.
B. Important list
Cards with:
sender
subject
snippet
reason surfaced
category
open in Gmail
Possible reason examples:
You usually reply to this sender
Detected payment or security language
Time-sensitive logistics content

4.11 Handled page
Route: /dashboard/handled
This is for transparency.
Header
title: Handled
subtitle: Everything autopilot acted on.
Filters
Today
7 days
30 days
Archives
Unsubscribes
Muted
Main table
Component: HandledActionsTable
Columns:
time
sender
subject or sender batch summary
action
reason
status
undo
This should feel like a control panel.

4.12 Senders page
Route: /dashboard/senders
This is one of the most important pages in the whole product.
Header
title: Senders
subtitle: Manage inbox behavior by sender instead of one email at a time.
Top controls
search input
filter dropdown:
all
protected
archived
review-required
unsubscribed
sort dropdown:
most frequent
highest clutter
highest importance
newest
Sender table
Component: SenderTable
Columns:
sender
category
emails/month
engagement
current rule
confidence
actions
Engagement should show a small stacked metric:
opens
replies
restores
Clicking a row opens sender detail.

4.13 Sender detail page
Route: /dashboard/senders/[senderId]
Header
sender name
sender email
sender category badge
Sections
A. Summary cards
emails received in 30 days
open rate
archive rate
restore rate
B. Current rule
Simple panel:
current state: Always archive, Always keep, Review, etc.
source: Learned, Manual, Onboarding
C. Why the system thinks this
Reason list:
You archived 12 of the last 13 emails from this sender
You have never replied
This sender includes unsubscribe headers
D. Recent messages list
Shows last 10 emails from sender.
E. Control panel
Buttons:
Always keep
Always archive
Digest only
Always review
Try unsubscribe
Reset learned behavior
This page is where the product becomes sticky.

4.14 Recovery page
Route: /dashboard/recovery
This page is mandatory for trust.
Header
title: Recovery
subtitle: Undo anything autopilot handled.
Search
Big search bar:
placeholder: Find a sender or message
Tabs
Archived
Unsubscribed
Rule changes
All actions
Recovery table
Component: RecoveryTable
Columns:
when
sender
action
reason
undo
Each row also has a small status chip:
Reversible
Partially reversible
Final
For unsubscribe rows, the undo area should explain:
We can't always reverse sender-side unsubscribes, but we can stop future handling and mark this sender as protected.
That honesty matters.

4.15 Digest page
Route: /dashboard/digest
Purpose
Show what happened in summary form.
Header
title: Digest
subtitle: A summary of what your inbox autopilot handled.
Digest cards
Component: DigestCard
Sections:
handled today
review needed
new patterns detected
senders worth unsubscribing from
important items surfaced
This can later become email/push digest content.

4.16 Settings page
Route: /dashboard/settings
Sections
A. Autopilot settings
mode selector
confidence explanation
toggle:
auto-archive enabled
auto-unsubscribe enabled
review queue enabled
B. Protected categories
Checkboxes:
finance
travel
security
school/work
personal contacts
receipts/orders
These should default to on.
C. Notifications
none
daily digest
immediate for important only
weekly summary
D. Account
connected Gmail account
disconnect button
E. Privacy/data
export your data
delete account
delete synced email data

5. What to build first, in real order
Do not try to build all of this at once. That would be dumb.
Build in this order:
Phase 1
Gmail OAuth
fetch recent emails
normalize into DB
senders table + aggregation
diagnosis page
cleanup recommendation page
Phase 2
archive action
unsubscribe attempt
action logs
onboarding flow complete
Phase 3
dashboard overview
review queue
sender rules
recovery page
Phase 4
autopilot recurring job
learning loop
digest
That is the real path.

6. My blunt product judgment
This is a real product. It is not fake AI fluff.
But it only works if you stay disciplined on three things:
Trust
reversible
transparent
conservative with risk
Sender-level intelligence
not just per-email classification
Fast first win
user must see obvious cleanup value immediately
If you miss any of those three, the product weakens fast.

