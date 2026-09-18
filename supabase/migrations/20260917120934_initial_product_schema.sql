create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) between 1 and 120),
  cover_asset_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '新对话' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('upload', 'generated')),
  bucket text not null default 'project-assets',
  object_path text not null,
  mime_type text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (bucket, object_path)
);

alter table public.projects
  add constraint projects_cover_asset_id_fkey
  foreign key (cover_asset_id) references public.assets(id) on delete set null;

create table public.canvas_documents (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  model text,
  config jsonb not null default '{}'::jsonb,
  reference_asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_message_id uuid not null references public.messages(id) on delete cascade,
  provider text not null default 'kie',
  provider_task_id text,
  model text not null,
  request jsonb not null default '{}'::jsonb,
  status text not null default 'submitting' check (status in ('submitting', 'waiting', 'queuing', 'generating', 'processing_result', 'success', 'fail', 'timeout')),
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table public.message_assets (
  message_id uuid not null references public.messages(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  primary key (message_id, asset_id)
);

create index projects_user_updated_idx on public.projects(user_id, updated_at desc) where deleted_at is null;
create index conversations_project_updated_idx on public.conversations(project_id, updated_at desc);
create index assets_project_created_idx on public.assets(project_id, created_at) where deleted_at is null;
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index generation_jobs_user_status_idx on public.generation_jobs(user_id, status, updated_at desc);
create unique index generation_jobs_provider_task_idx on public.generation_jobs(provider_task_id) where provider_task_id is not null;

create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();
create trigger canvas_documents_set_updated_at before update on public.canvas_documents
for each row execute function public.set_updated_at();
create trigger generation_jobs_set_updated_at before update on public.generation_jobs
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.assets enable row level security;
alter table public.canvas_documents enable row level security;
alter table public.messages enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.message_assets enable row level security;

create policy projects_owner_all on public.projects for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy conversations_owner_all on public.conversations for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy assets_owner_all on public.assets for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy canvas_documents_owner_all on public.canvas_documents for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy messages_owner_all on public.messages for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy generation_jobs_owner_all on public.generation_jobs for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy message_assets_owner_all on public.message_assets for all
using (
  exists (
    select 1 from public.messages
    where messages.id = message_assets.message_id
      and messages.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.messages
    where messages.id = message_assets.message_id
      and messages.user_id = auth.uid()
  )
  and exists (
    select 1 from public.assets
    where assets.id = message_assets.asset_id
      and assets.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-assets',
  'project-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy project_assets_select on storage.objects for select
using (
  bucket_id = 'project-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy project_assets_insert on storage.objects for insert
with check (
  bucket_id = 'project-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy project_assets_update on storage.objects for update
using (
  bucket_id = 'project-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'project-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy project_assets_delete on storage.objects for delete
using (
  bucket_id = 'project-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
