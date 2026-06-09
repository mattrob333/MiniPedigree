-- Agent Registry: the company's Agent Stack state. Versioned and append-only;
-- the versions jsonb array only ever grows. The app also stores these records
-- in workspaces.snapshot.registry so localStorage/demo mode remains functional.

create table if not exists agent_registry (
  agent_id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,

  owner_person_id text not null default '',
  task_id text not null default '',
  resp_id text not null default '',
  runtime text not null default 'pedigree',
  status text not null default 'draft' check (status in ('draft', 'approved', 'deployed', 'retired')),
  stale boolean not null default false,
  ingredient_hashes jsonb not null default '{}'::jsonb,
  versions jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (agent_id, workspace_id)
);

create index if not exists agent_registry_workspace_idx
  on agent_registry (workspace_id);

alter table agent_registry enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'agent_registry' and policyname = 'anon_all') then
    create policy anon_all on agent_registry for all using (true) with check (true);
  end if;
end $$;
