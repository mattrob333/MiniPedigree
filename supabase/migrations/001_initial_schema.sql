-- Pedigree Discover Lite — initial schema
-- Run against a Supabase/Postgres database. The app also works without this
-- (it falls back to browser localStorage) — this enables real persistence.

create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id text primary key,
  name text not null default 'Untitled Workspace',
  -- lite persistence: full {people, pedigree} snapshot for the MVP
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,

  name text not null,
  email text not null,
  title text not null,
  manager_email text,
  department text,
  team text,
  location text,
  known_tools text,
  notes text,

  responsibilities jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  delegatable_tasks jsonb not null default '[]'::jsonb,
  human_approval_tasks jsonb not null default '[]'::jsonb,
  non_delegatable_tasks jsonb not null default '[]'::jsonb,
  agent_candidates jsonb not null default '[]'::jsonb,
  recommended_mcp_servers jsonb not null default '[]'::jsonb,

  status text not null default 'needs_discovery',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, email)
);

create table if not exists discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,

  input_type text not null,
  raw_input text,
  transcript text,
  transcription_provider text,
  audio_file_url text,

  parse_status text not null default 'pending',
  parsed_output jsonb,
  unmatched_mentions jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_manifests (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,

  agent_name text not null,
  agent_slug text not null,
  agent_purpose text not null,

  manifest_json jsonb not null,
  system_prompt text not null,

  status text not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, agent_slug)
);

-- Demo-friendly: allow anon access. Tighten with real auth before production.
alter table workspaces enable row level security;
alter table people enable row level security;
alter table discovery_sessions enable row level security;
alter table agent_manifests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'workspaces' and policyname = 'anon_all') then
    create policy anon_all on workspaces for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'people' and policyname = 'anon_all') then
    create policy anon_all on people for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'discovery_sessions' and policyname = 'anon_all') then
    create policy anon_all on discovery_sessions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'agent_manifests' and policyname = 'anon_all') then
    create policy anon_all on agent_manifests for all using (true) with check (true);
  end if;
end $$;
