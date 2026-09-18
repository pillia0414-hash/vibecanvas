revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_cover_asset_id_idx on public.projects(cover_asset_id);
create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists assets_project_id_idx on public.assets(project_id);
create index if not exists assets_user_id_idx on public.assets(user_id);
create index if not exists canvas_documents_user_id_idx on public.canvas_documents(user_id);
create index if not exists messages_project_id_idx on public.messages(project_id);
create index if not exists messages_user_id_idx on public.messages(user_id);
create index if not exists messages_reference_asset_id_idx on public.messages(reference_asset_id);
create index if not exists generation_jobs_project_id_idx on public.generation_jobs(project_id);
create index if not exists generation_jobs_conversation_id_idx on public.generation_jobs(conversation_id);
create index if not exists generation_jobs_user_message_id_idx on public.generation_jobs(user_message_id);
create index if not exists message_assets_asset_id_idx on public.message_assets(asset_id);

alter policy projects_owner_all on public.projects
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy conversations_owner_all on public.conversations
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = conversations.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = conversations.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
);

alter policy assets_owner_all on public.assets
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = assets.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = assets.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
);

alter policy canvas_documents_owner_all on public.canvas_documents
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = canvas_documents.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = canvas_documents.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
);

alter policy messages_owner_all on public.messages
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = messages.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = messages.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
  and exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.project_id = messages.project_id
      and conversations.user_id = (select auth.uid())
  )
);

alter policy generation_jobs_owner_all on public.generation_jobs
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.projects
    where projects.id = generation_jobs.project_id
      and projects.user_id = (select auth.uid())
      and projects.deleted_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.conversations
    where conversations.id = generation_jobs.conversation_id
      and conversations.project_id = generation_jobs.project_id
      and conversations.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.messages
    where messages.id = generation_jobs.user_message_id
      and messages.project_id = generation_jobs.project_id
      and messages.conversation_id = generation_jobs.conversation_id
      and messages.user_id = (select auth.uid())
  )
);

alter policy message_assets_owner_all on public.message_assets
using (
  exists (
    select 1 from public.messages
    where messages.id = message_assets.message_id
      and messages.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.messages
    where messages.id = message_assets.message_id
      and messages.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.assets
    where assets.id = message_assets.asset_id
      and assets.user_id = (select auth.uid())
  )
);
