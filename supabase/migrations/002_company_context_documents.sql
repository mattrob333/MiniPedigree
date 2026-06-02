-- Uploaded company context documents for agent grounding.
-- The app also stores these records in workspaces.snapshot.companyContext.contextDocuments
-- so localStorage/demo mode remains fully functional.

create table if not exists company_context_documents (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,

  bucket text not null check (bucket in ('segregation_of_duties', 'policy', 'knowledge')),
  file_name text not null,
  title text,
  mime_type text,
  size_bytes integer,
  content_text text not null default '',
  source_id text,

  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_context_documents_workspace_bucket_idx
  on company_context_documents (workspace_id, bucket);

alter table company_context_documents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'company_context_documents' and policyname = 'anon_all') then
    create policy anon_all on company_context_documents for all using (true) with check (true);
  end if;
end $$;
