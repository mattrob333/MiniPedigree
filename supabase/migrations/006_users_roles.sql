-- Living Stack Part B Phase B1: users ↔ person records, workspace roles, and
-- RLS scaffolding. RLS is the enforcement layer — client-side role checks are
-- UX only. This is the shared pre-rollout auth work: the app currently runs a
-- local-first role model and labels it as such; when Supabase Auth is wired,
-- these tables and policies become the source of truth without a redesign.

-- Workspace membership: maps an authenticated user (by email, later by
-- auth.uid()) to a person record in a workspace, with a role.
create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  email text not null,
  person_id text,                                   -- matched person record (P-001 ...); required for member/manager roles
  role text not null default 'member' check (role in ('operator', 'editor', 'reviewer', 'governance_reviewer', 'manager', 'member')),
  invited_by text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,

  primary key (workspace_id, email)
);

create index if not exists workspace_members_email_idx on workspace_members (email);

alter table workspace_members enable row level security;

-- Helper: the requesting user's role in a workspace. With Supabase Auth the
-- email comes from the JWT; until then the permissive anon policy below keeps
-- demo mode working.
create or replace function member_role(ws_id text)
returns text language sql stable security definer as $$
  select role from workspace_members
  where workspace_id = ws_id
    and email = coalesce(auth.jwt() ->> 'email', '')
  limit 1
$$;

do $$
begin
  -- Operators manage membership; everyone can read their own row.
  if not exists (select 1 from pg_policies where tablename = 'workspace_members' and policyname = 'members_read_own') then
    create policy members_read_own on workspace_members for select
      using (email = coalesce(auth.jwt() ->> 'email', '') or member_role(workspace_id) in ('operator', 'governance_reviewer'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'workspace_members' and policyname = 'operators_manage') then
    create policy operators_manage on workspace_members for all
      using (member_role(workspace_id) = 'operator')
      with check (member_role(workspace_id) = 'operator');
  end if;
  -- Demo-mode escape hatch (anon key, no JWT). Remove when auth goes live.
  if not exists (select 1 from pg_policies where tablename = 'workspace_members' and policyname = 'anon_all') then
    create policy anon_all on workspace_members for all
      using (coalesce(auth.jwt() ->> 'email', '') = '')
      with check (coalesce(auth.jwt() ->> 'email', '') = '');
  end if;
end $$;

-- Member signal write path: members may insert signals about themselves only
-- (their own person_id); operators/reviewers see everything in the workspace.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'stack_signals' and policyname = 'members_insert_own') then
    create policy members_insert_own on stack_signals for insert
      with check (
        member_role(workspace_id) in ('operator', 'editor', 'reviewer', 'governance_reviewer')
        or (source ->> 'kind' = 'member'
            and source ->> 'person_id' = (select person_id from workspace_members
                                          where workspace_id = stack_signals.workspace_id
                                            and email = coalesce(auth.jwt() ->> 'email', '')))
      );
  end if;
end $$;
