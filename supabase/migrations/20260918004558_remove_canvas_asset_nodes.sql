create or replace function public.remove_canvas_asset_nodes(
  p_project_id uuid,
  p_asset_id uuid
)
returns table(revision bigint, nodes jsonb)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.assets a
    where a.id = p_asset_id
      and a.project_id = p_project_id
      and a.user_id = auth.uid()
  ) then
    raise exception 'asset_not_found' using errcode = 'P0002';
  end if;

  return query
    update public.canvas_documents d
    set nodes = coalesce((
          select jsonb_agg(n order by ord)
          from jsonb_array_elements(d.nodes) with ordinality existing(n, ord)
          where existing.n->'data'->>'assetId' is distinct from p_asset_id::text
        ), '[]'::jsonb),
        revision = d.revision + 1
    where d.project_id = p_project_id
      and d.user_id = auth.uid()
    returning d.revision, d.nodes;
end;
$$;

revoke execute on function public.remove_canvas_asset_nodes(uuid, uuid) from public, anon;
grant execute on function public.remove_canvas_asset_nodes(uuid, uuid) to authenticated;
