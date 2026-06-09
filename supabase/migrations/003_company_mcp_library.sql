-- Company MCP Library: the approved MCP tool surface per workspace.
-- The app also stores these records in workspaces.snapshot.mcpLibrary so
-- localStorage/demo mode remains fully functional.

create table if not exists company_mcp_servers (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,

  name text not null,
  endpoint text,
  approved_scopes jsonb not null default '["read_only"]'::jsonb,
  default_scope text not null default 'read_only' check (default_scope in ('read_only', 'draft_only')),
  owner_email text not null default '',
  systems_matched jsonb not null default '[]'::jsonb,
  notes text,

  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_mcp_servers_workspace_idx
  on company_mcp_servers (workspace_id);

alter table company_mcp_servers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'company_mcp_servers' and policyname = 'anon_all') then
    create policy anon_all on company_mcp_servers for all using (true) with check (true);
  end if;
end $$;
