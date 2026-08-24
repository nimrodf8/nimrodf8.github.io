-- Family Points sync — the whole server side.
--
-- One row per family, holding the family document. The table lives in its own
-- schema, which is not exposed through the API, so the only way in is the three
-- functions below. Each of them demands the family's id (an unguessable uuid)
-- together with its secret, so possession of the public API key on its own
-- reveals nothing.
--
-- Apply this to any Postgres behind PostgREST (Supabase included), then point
-- the app at it with window.FP_SYNC_SERVER = {url, key}.

create schema if not exists family_points;

create table if not exists family_points.families (
  id           uuid primary key default gen_random_uuid(),
  secret_hash  text        not null,
  doc          jsonb       not null,
  rev          bigint      not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table family_points.families enable row level security;
revoke all on table family_points.families from anon, authenticated;

-- Guard rails shared by the three entry points.
create or replace function family_points.check_doc(p_doc jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'bad_document' using errcode = '22023';
  end if;
  if pg_column_size(p_doc) > 4 * 1024 * 1024 then
    raise exception 'document_too_large' using errcode = '22023';
  end if;
end;
$$;

create or replace function family_points.hash_secret(p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_secret, ''), 'utf8')), 'hex');
$$;

-- Start syncing: hand over the family as it stands and get an id back.
create or replace function public.fp_create(p_secret text, p_doc jsonb)
returns table (id uuid, rev bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or length(p_secret) < 12 then
    raise exception 'weak_secret' using errcode = '22023';
  end if;
  perform family_points.check_doc(p_doc);

  return query
    insert into family_points.families (secret_hash, doc)
    values (family_points.hash_secret(p_secret), p_doc)
    returning families.id, families.rev;
end;
$$;

-- Read the family. Wrong id or wrong secret are indistinguishable on purpose.
create or replace function public.fp_pull(p_id uuid, p_secret text)
returns table (doc jsonb, rev bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select f.doc, f.rev, f.updated_at
      from family_points.families f
     where f.id = p_id
       and f.secret_hash = family_points.hash_secret(p_secret);

  if not found then
    raise exception 'no_such_family' using errcode = '42501';
  end if;
end;
$$;

-- Write the family back, but only onto the revision the caller started from.
-- A caller that is behind gets the current document to merge and retry with,
-- so a device that was offline can never wipe out what happened meanwhile.
create or replace function public.fp_push(
  p_id uuid, p_secret text, p_doc jsonb, p_base_rev bigint
)
returns table (ok boolean, rev bigint, doc jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev bigint;
  v_doc jsonb;
begin
  perform family_points.check_doc(p_doc);

  select f.rev, f.doc into v_rev, v_doc
    from family_points.families f
   where f.id = p_id
     and f.secret_hash = family_points.hash_secret(p_secret)
   for update;

  if not found then
    raise exception 'no_such_family' using errcode = '42501';
  end if;

  if v_rev <> p_base_rev then
    return query select false, v_rev, v_doc;   -- caller merges and comes back
    return;
  end if;

  update family_points.families f
     set doc = p_doc, rev = f.rev + 1, updated_at = now()
   where f.id = p_id
   returning f.rev, f.doc into v_rev, v_doc;

  return query select true, v_rev, v_doc;
end;
$$;

revoke all on function public.fp_create(text, jsonb) from public;
revoke all on function public.fp_pull(uuid, text) from public;
revoke all on function public.fp_push(uuid, text, jsonb, bigint) from public;
grant execute on function public.fp_create(text, jsonb) to anon, authenticated;
grant execute on function public.fp_pull(uuid, text) to anon, authenticated;
grant execute on function public.fp_push(uuid, text, jsonb, bigint) to anon, authenticated;
