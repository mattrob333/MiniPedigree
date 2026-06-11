-- Living Stack: meeting registry + signal ledger + a "suspended" registry
-- status for the joiner/mover/leaver lifecycle. The app also stores these in
-- workspaces.snapshot (meetings, signalLedger) so localStorage/demo mode
-- remains functional.

-- Recurring meetings are first-class objects: the maintenance parser
-- calibrates per meeting series and routes output correctly.
create table if not exists registered_meetings (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,

  name text not null,
  cadence text not null default 'weekly' check (cadence in ('daily', 'weekly', 'biweekly', 'monthly', 'ad_hoc')),
  usual_participant_ids jsonb not null default '[]'::jsonb,
  department text,
  source text not null default 'manual_paste' check (source in ('fireflies', 'meet', 'zoom', 'manual_paste')),
  source_ref text,
  signal_profile text check (signal_profile in ('standup', 'planning', 'review', 'leadership')),
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (id, workspace_id)
);

create index if not exists registered_meetings_workspace_idx
  on registered_meetings (workspace_id);

-- The signal ledger: maintenance-parse and member signals accumulate here and
-- promote to proposals only when durable. Confirmations are the sole silent
-- write (timestamps only).
create table if not exists stack_signals (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,

  type text not null check (type in ('confirmation', 'drift', 'new_candidate', 'retirement', 'rule_signal', 'agent_feedback', 'backlog_resolution')),
  source jsonb not null default '{}'::jsonb,        -- { kind: meeting|member, ... }
  evidence_quote text not null default '',
  confidence numeric not null default 0.5,
  refs jsonb not null default '{}'::jsonb,          -- person/task/agent/rule/backlog ids
  proposed_patch jsonb,
  authority_expanding boolean not null default false,
  status text not null default 'ledgered' check (status in ('ledgered', 'proposed', 'applied', 'rejected', 'expired')),
  decision jsonb,                                   -- { by, at }
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (id, workspace_id)
);

create index if not exists stack_signals_workspace_idx
  on stack_signals (workspace_id);
create index if not exists stack_signals_status_idx
  on stack_signals (workspace_id, status);

-- Agent registry gains the suspended status (offboarded owner ⇒ suspended
-- agents, checked continuously) and a stale reason + freshness timestamp.
alter table agent_registry drop constraint if exists agent_registry_status_check;
alter table agent_registry add constraint agent_registry_status_check
  check (status in ('draft', 'approved', 'deployed', 'suspended', 'retired'));
alter table agent_registry add column if not exists stale_reason text;
alter table agent_registry add column if not exists last_confirmed_at timestamptz;

alter table registered_meetings enable row level security;
alter table stack_signals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'registered_meetings' and policyname = 'anon_all') then
    create policy anon_all on registered_meetings for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'stack_signals' and policyname = 'anon_all') then
    create policy anon_all on stack_signals for all using (true) with check (true);
  end if;
end $$;
