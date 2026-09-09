-- Hero Shield Insurance — schema
-- Replaces the DynamoDB `messages` / `claims` tables from the CDK backend.
-- Apply with the Neon MCP server (`run_sql_transaction`, one statement per entry)
-- or: psql "$DATABASE_URL" -f db/schema.sql. Idempotent either way. See SETUP.md.

create table if not exists claims (
  id                   uuid primary key default gen_random_uuid(),
  user_id              text        not null,
  policy_id            text        not null,
  incident_description text,
  incident_location    text,
  damage_extent        text,
  status               text        not null default 'pending'
                         check (status in ('pending','awaiting_approval','approved','denied')),
  fraud_flagged        boolean     not null default false,
  fraud_reason         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Mirrors the DynamoDB `byPolicyId` GSI.
create index if not exists claims_policy_id_created_at_idx on claims (policy_id, created_at desc);
create index if not exists claims_user_id_created_at_idx   on claims (user_id, created_at desc);
-- Latest submitted claim for the host projector.
create index if not exists claims_status_created_at_idx    on claims (status, created_at desc);

create table if not exists messages (
  id         bigserial   primary key,
  claim_id   uuid        not null references claims (id) on delete cascade,
  role       text        not null check (role in ('user','assistant')),
  content    text        not null,
  created_at timestamptz not null default now()
);

-- Mirrors the DynamoDB `claimIdIndex` GSI.
create index if not exists messages_claim_id_created_at_idx on messages (claim_id, created_at);

-- Leftover audience-likes table. Unused; rows cascade when a claim is deleted.
create table if not exists claim_approvals (
  id          bigserial   primary key,
  claim_id    uuid        not null references claims (id) on delete cascade,
  approver_id text        not null,
  created_at  timestamptz not null default now(),
  unique (claim_id, approver_id)
);

create index if not exists claim_approvals_claim_id_idx on claim_approvals (claim_id);

-- Audience who scanned the room QR and logged in. CIBA needs a verified
-- email + Auth0 sub; unverified joiners stay in the room but cannot sit
-- on the board. `pinned` is how the operator includes planted friends.
create table if not exists demo_joiners (
  sub            text        primary key,
  email          text        not null,
  name           text        not null,
  email_verified boolean     not null default false,
  pinned         boolean     not null default false,
  joined_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create index if not exists demo_joiners_joined_at_idx on demo_joiners (joined_at desc);

-- Host-set board size and CIBA yes threshold. Singleton row.
-- Code default is 1 / 1; Focus raises to 6 / 3 on /host for the talk.
-- defaults_version rewrites an existing row to 1/1 once so a live DB
-- does not keep the old 6/3 seed on first load.
create table if not exists demo_settings (
  singleton     boolean     primary key default true check (singleton),
  board_size    integer     not null default 1
                  check (board_size >= 1 and board_size <= 24),
  yes_threshold integer     not null default 1
                  check (yes_threshold >= 1 and yes_threshold <= board_size),
  defaults_version integer  not null default 2,
  demo_host_email text,
  demo_host_sub   text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

alter table demo_settings add column if not exists defaults_version integer not null default 1;
alter table demo_settings add column if not exists demo_host_email text;
alter table demo_settings add column if not exists demo_host_sub text;
alter table demo_settings alter column board_size set default 1;
alter table demo_settings alter column yes_threshold set default 1;

insert into demo_settings (singleton, board_size, yes_threshold, defaults_version)
values (true, 1, 1, 2)
on conflict (singleton) do nothing;

update demo_settings
set board_size = 1, yes_threshold = 1, defaults_version = 2, updated_at = now()
where singleton = true and defaults_version < 2;

-- One row per "Pick board" tap. The latest pick is the live board.
create table if not exists board_picks (
  id         uuid        primary key default gen_random_uuid(),
  picked_by  text        not null,
  picked_at  timestamptz not null default now()
);

create index if not exists board_picks_picked_at_idx on board_picks (picked_at desc);

create table if not exists board_members (
  pick_id uuid not null references board_picks (id) on delete cascade,
  sub     text not null,
  email   text not null,
  name    text not null,
  primary key (pick_id, sub)
);

-- One CIBA email per board member per claim. We mint auth_req_id, so the
-- projector knows who is who without decoding the token.
create table if not exists ciba_authorizations (
  id              uuid        primary key default gen_random_uuid(),
  claim_id        uuid        not null references claims (id) on delete cascade,
  auth_req_id     text        not null unique,
  sub             text        not null,
  email           text        not null,
  name            text        not null,
  status          text        not null default 'pending'
                    check (status in ('pending','approved','denied','error')),
  binding_message text        not null,
  interval_sec    int         not null default 5,
  expires_at      timestamptz,
  error           text,
  last_polled_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (claim_id, sub)
);

create index if not exists ciba_authorizations_claim_id_idx on ciba_authorizations (claim_id);
create index if not exists ciba_authorizations_status_idx on ciba_authorizations (status);

alter table ciba_authorizations add column if not exists last_polled_at timestamptz;

-- Token Vault calendar event written on the host's Google account after
-- 3 CIBA yeses. Block reason is set when we refuse to send CIBA (no
-- Google connect, or no board of 6).
alter table claims add column if not exists calendar_event_id text;
alter table claims add column if not exists ciba_block_reason text;
-- Frozen at CIBA start so a later /host save cannot change the grant.
alter table claims add column if not exists ciba_board_size integer;
alter table claims add column if not exists ciba_yes_threshold integer;
