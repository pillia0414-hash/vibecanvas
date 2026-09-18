alter table public.messages
  add column if not exists mode text not null default 'image',
  add column if not exists status text not null default 'completed',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.messages
  drop constraint if exists messages_mode_check,
  add constraint messages_mode_check check (mode in ('image', 'agent')),
  drop constraint if exists messages_status_check,
  add constraint messages_status_check check (status in ('streaming', 'completed', 'failed'));

alter table public.message_assets
  add column if not exists relation_type text not null default 'output';

alter table public.message_assets
  drop constraint if exists message_assets_relation_type_check,
  add constraint message_assets_relation_type_check
    check (relation_type in ('attachment', 'reference', 'output'));

create unique index if not exists message_assets_relation_position_idx
  on public.message_assets(message_id, relation_type, position);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_message_id uuid not null references public.messages(id) on delete cascade,
  assistant_message_id uuid references public.messages(id) on delete set null,
  provider text not null default 'kimi-coding',
  model text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  transcript jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create unique index if not exists agent_runs_one_active_conversation_idx
  on public.agent_runs(conversation_id)
  where status in ('queued', 'running');
create index if not exists agent_runs_project_created_idx
  on public.agent_runs(project_id, created_at);
create index if not exists agent_runs_user_id_idx
  on public.agent_runs(user_id);
create index if not exists agent_runs_user_message_id_idx
  on public.agent_runs(user_message_id);
create index if not exists agent_runs_assistant_message_id_idx
  on public.agent_runs(assistant_message_id);

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at before update on public.agent_runs
for each row execute function public.set_updated_at();

create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  event_type text not null,
  tool_call_id text,
  tool_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (run_id, sequence)
);

create index if not exists agent_events_run_sequence_idx
  on public.agent_events(run_id, sequence);
create index if not exists agent_events_project_id_idx
  on public.agent_events(project_id);
create index if not exists agent_events_user_id_idx
  on public.agent_events(user_id);

alter table public.generation_jobs
  add column if not exists source text not null default 'direct',
  add column if not exists provider_model text,
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists agent_tool_call_id text;

alter table public.generation_jobs
  drop constraint if exists generation_jobs_source_check,
  add constraint generation_jobs_source_check check (source in ('direct', 'agent'));

update public.generation_jobs
set provider_model = request->>'providerModel'
where provider_model is null and request ? 'providerModel';

create index if not exists generation_jobs_agent_run_id_idx
  on public.generation_jobs(agent_run_id);

create table if not exists public.generation_job_assets (
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  position integer not null check (position >= 0),
  role text not null default 'reference' check (role in ('reference', 'output')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (job_id, asset_id, role),
  unique (job_id, role, position)
);

create index if not exists generation_job_assets_asset_id_idx
  on public.generation_job_assets(asset_id);

alter table public.canvas_documents
  add column if not exists revision bigint not null default 0 check (revision >= 0);

alter table public.agent_runs enable row level security;
alter table public.agent_events enable row level security;
alter table public.generation_job_assets enable row level security;

drop policy if exists agent_runs_owner_all on public.agent_runs;
create policy agent_runs_owner_all on public.agent_runs for all
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects p
    where p.id = agent_runs.project_id
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.conversations c
    where c.id = agent_runs.conversation_id
      and c.project_id = agent_runs.project_id
      and c.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.messages m
    where m.id = agent_runs.user_message_id
      and m.project_id = agent_runs.project_id
      and m.conversation_id = agent_runs.conversation_id
      and m.user_id = (select auth.uid())
      and m.mode = 'agent'
  )
  and (
    agent_runs.assistant_message_id is null
    or exists (
      select 1 from public.messages m
      where m.id = agent_runs.assistant_message_id
        and m.project_id = agent_runs.project_id
        and m.conversation_id = agent_runs.conversation_id
        and m.user_id = (select auth.uid())
        and m.mode = 'agent'
    )
  )
);

drop policy if exists agent_events_owner_all on public.agent_events;
create policy agent_events_owner_all on public.agent_events for all
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.agent_runs r
    where r.id = agent_events.run_id
      and r.project_id = agent_events.project_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.agent_runs r
    where r.id = agent_events.run_id
      and r.project_id = agent_events.project_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists generation_job_assets_owner_all on public.generation_job_assets;
create policy generation_job_assets_owner_all on public.generation_job_assets for all
using (
  exists (
    select 1
    from public.generation_jobs j
    join public.assets a on a.id = generation_job_assets.asset_id
    where j.id = generation_job_assets.job_id
      and j.user_id = (select auth.uid())
      and a.user_id = (select auth.uid())
      and a.project_id = j.project_id
  )
)
with check (
  exists (
    select 1
    from public.generation_jobs j
    join public.assets a on a.id = generation_job_assets.asset_id
    where j.id = generation_job_assets.job_id
      and j.user_id = (select auth.uid())
      and a.user_id = (select auth.uid())
      and a.project_id = j.project_id
      and a.deleted_at is null
  )
);

drop policy if exists message_assets_owner_all on public.message_assets;
create policy message_assets_owner_all on public.message_assets for all
using (
  exists (
    select 1
    from public.messages m
    join public.assets a on a.id = message_assets.asset_id
    where m.id = message_assets.message_id
      and m.user_id = (select auth.uid())
      and a.user_id = (select auth.uid())
      and a.project_id = m.project_id
  )
)
with check (
  exists (
    select 1
    from public.messages m
    join public.assets a on a.id = message_assets.asset_id
    where m.id = message_assets.message_id
      and m.user_id = (select auth.uid())
      and a.user_id = (select auth.uid())
      and a.project_id = m.project_id
      and a.deleted_at is null
  )
);

create or replace function public.validate_canvas_nodes(
  p_project_id uuid,
  p_nodes jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or jsonb_typeof(p_nodes) <> 'array' then
    return false;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_nodes) n
    where jsonb_typeof(n) <> 'object'
      or nullif(n->>'id', '') is null
  ) then
    return false;
  end if;

  if (
    select count(*) from jsonb_array_elements(p_nodes)
  ) <> (
    select count(distinct n->>'id') from jsonb_array_elements(p_nodes) n
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_nodes) n
    where nullif(n->'data'->>'assetId', '') is not null
      and not exists (
        select 1 from public.assets a
        where a.id::text = n->'data'->>'assetId'
          and a.project_id = p_project_id
          and a.user_id = v_user_id
          and a.deleted_at is null
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_nodes) n
    where nullif(n->'data'->>'jobId', '') is not null
      and not exists (
        select 1 from public.generation_jobs j
        where j.id::text = n->'data'->>'jobId'
          and j.project_id = p_project_id
          and j.user_id = v_user_id
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.append_canvas_node(
  p_project_id uuid,
  p_node jsonb
)
returns table(revision bigint, nodes jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nodes jsonb;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if not public.validate_canvas_nodes(p_project_id, jsonb_build_array(p_node)) then
    raise exception 'invalid_canvas_node' using errcode = '22023';
  end if;

  select d.nodes into v_nodes
  from public.canvas_documents d
  where d.project_id = p_project_id;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_nodes, '[]'::jsonb)) n
    where n->>'id' = p_node->>'id'
  ) then
    return query
      select d.revision, d.nodes
      from public.canvas_documents d
      where d.project_id = p_project_id;
    return;
  end if;

  return query
    update public.canvas_documents d
    set nodes = d.nodes || jsonb_build_array(p_node),
        revision = d.revision + 1
    where d.project_id = p_project_id
    returning d.revision, d.nodes;
end;
$$;

create or replace function public.replace_canvas_job_node(
  p_project_id uuid,
  p_job_id uuid,
  p_nodes jsonb
)
returns table(revision bigint, nodes jsonb)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.generation_jobs j
    where j.id = p_job_id
      and j.project_id = p_project_id
      and j.user_id = auth.uid()
  ) then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;

  if not public.validate_canvas_nodes(p_project_id, p_nodes) then
    raise exception 'invalid_canvas_nodes' using errcode = '22023';
  end if;

  return query
    update public.canvas_documents d
    set nodes = coalesce((
          select jsonb_agg(n order by ord)
          from jsonb_array_elements(d.nodes) with ordinality existing(n, ord)
          where existing.n->'data'->>'jobId' is distinct from p_job_id::text
        ), '[]'::jsonb) || p_nodes,
        revision = d.revision + 1
    where d.project_id = p_project_id
    returning d.revision, d.nodes;
end;
$$;

create or replace function public.save_canvas_document(
  p_project_id uuid,
  p_base_revision bigint,
  p_nodes jsonb,
  p_edges jsonb,
  p_viewport jsonb
)
returns table(saved boolean, revision bigint, nodes jsonb, edges jsonb, viewport jsonb)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_edges) <> 'array'
    or jsonb_typeof(p_viewport) <> 'object'
    or not public.validate_canvas_nodes(p_project_id, p_nodes) then
    raise exception 'invalid_canvas_document' using errcode = '22023';
  end if;

  return query
    update public.canvas_documents d
    set nodes = p_nodes,
        edges = p_edges,
        viewport = p_viewport,
        revision = d.revision + 1
    where d.project_id = p_project_id
      and d.user_id = auth.uid()
      and d.revision = p_base_revision
    returning true, d.revision, d.nodes, d.edges, d.viewport;

  if found then return; end if;

  return query
    select false, d.revision, d.nodes, d.edges, d.viewport
    from public.canvas_documents d
    where d.project_id = p_project_id
      and d.user_id = auth.uid();
end;
$$;

revoke execute on function public.validate_canvas_nodes(uuid, jsonb) from public, anon;
revoke execute on function public.append_canvas_node(uuid, jsonb) from public, anon;
revoke execute on function public.replace_canvas_job_node(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.save_canvas_document(uuid, bigint, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.validate_canvas_nodes(uuid, jsonb) to authenticated;
grant execute on function public.append_canvas_node(uuid, jsonb) to authenticated;
grant execute on function public.replace_canvas_job_node(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_canvas_document(uuid, bigint, jsonb, jsonb, jsonb) to authenticated;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/markdown',
  'text/plain'
]
where id = 'project-assets';
