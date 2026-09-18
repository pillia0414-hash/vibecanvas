drop policy if exists conversations_owner_all on public.conversations;
create policy conversations_owner_all on public.conversations for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = conversations.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = conversations.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
);

drop policy if exists assets_owner_all on public.assets;
create policy assets_owner_all on public.assets for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = assets.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = assets.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
);

drop policy if exists canvas_documents_owner_all on public.canvas_documents;
create policy canvas_documents_owner_all on public.canvas_documents for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = canvas_documents.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = canvas_documents.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
);

drop policy if exists messages_owner_all on public.messages;
create policy messages_owner_all on public.messages for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = messages.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = messages.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
  and exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.project_id = messages.project_id
      and conversations.user_id = auth.uid()
  )
);

drop policy if exists generation_jobs_owner_all on public.generation_jobs;
create policy generation_jobs_owner_all on public.generation_jobs for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = generation_jobs.project_id
      and projects.user_id = auth.uid()
      and projects.deleted_at is null
  )
) with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.conversations
    where conversations.id = generation_jobs.conversation_id
      and conversations.project_id = generation_jobs.project_id
      and conversations.user_id = auth.uid()
  )
  and exists (
    select 1 from public.messages
    where messages.id = generation_jobs.user_message_id
      and messages.project_id = generation_jobs.project_id
      and messages.conversation_id = generation_jobs.conversation_id
      and messages.user_id = auth.uid()
  )
);
