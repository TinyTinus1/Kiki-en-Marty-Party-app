begin;
create table public.date_memories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 100),
  memory_date date not null,
  location text not null default '' check (char_length(location) <= 200),
  letter text check (letter ~ '^[A-Z]$'),
  source_key text unique check (char_length(source_key) between 1 and 300),
  photo_path text,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.date_memories enable row level security;
revoke all on public.date_memories from public,anon,authenticated;
grant select on public.date_memories to authenticated;
create policy memories_read on public.date_memories for select to authenticated using ((select duo_private.is_member()));

-- Stories are never exposed through the Data API, even before filtering in the UI.
create table duo_private.memory_stories (
  memory_id uuid not null references public.date_memories(id) on delete cascade,
  user_id uuid not null references public.members(user_id),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  saved_at timestamptz not null default now(),
  primary key(memory_id,user_id)
);
alter table duo_private.memory_stories enable row level security;
revoke all on duo_private.memory_stories from public,anon,authenticated;
create index memory_stories_user on duo_private.memory_stories(user_id);

create function duo_private.memory_book() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not duo_private.is_member() then raise exception 'Geen toegang' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(entry order by entry.memory_date,entry.created_at,entry.id) from (
    select m.*, (select jsonb_agg(jsonb_build_object(
      'user_id',p.user_id,'display_name',p.display_name,'persona',p.persona,
      'submitted',s.user_id is not null,
      'body',case when p.user_id=auth.uid() or m.revealed_at is not null then s.body else null end
    ) order by p.persona) from public.members p left join duo_private.memory_stories s on s.memory_id=m.id and s.user_id=p.user_id) as stories
    from public.date_memories m
  ) entry),'[]'::jsonb);
end $$;

create function duo_private.save_memory(p_id uuid,p_title text,p_date date,p_location text,p_letter text,p_source_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not duo_private.is_member() then raise exception 'Geen toegang' using errcode='42501'; end if;
  update public.date_memories set title=trim(p_title),memory_date=p_date,location=trim(p_location),letter=p_letter where id=p_id returning id into result;
  if found then return result; end if;
  insert into public.date_memories(id,title,memory_date,location,letter,source_key)
    values(p_id,trim(p_title),p_date,trim(p_location),p_letter,p_source_key)
    on conflict(source_key) do nothing returning id into result;
  if result is null then select id into strict result from public.date_memories where source_key=p_source_key; end if;
  return result;
end $$;

create function duo_private.save_memory_story(p_memory_id uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not duo_private.is_member() then raise exception 'Geen toegang' using errcode='42501'; end if;
  perform 1 from public.date_memories where id=p_memory_id for update;
  if not found then raise exception 'Herinnering niet gevonden'; end if;
  insert into duo_private.memory_stories(memory_id,user_id,body) values(p_memory_id,auth.uid(),trim(p_body))
    on conflict(memory_id,user_id) do update set body=excluded.body,saved_at=now();
  update public.date_memories m set revealed_at=now() where m.id=p_memory_id and m.revealed_at is null
    and (select count(*) from public.members)=2
    and not exists(select 1 from public.members p where not exists(select 1 from duo_private.memory_stories s where s.memory_id=m.id and s.user_id=p.user_id));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('date-memories','date-memories',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy memory_photo_read on storage.objects for select to authenticated
using (bucket_id='date-memories' and (select duo_private.is_member()));
create policy memory_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='date-memories' and (select duo_private.is_member()) and exists(
  select 1 from public.date_memories m where m.id::text=(storage.foldername(name))[1]
));
-- Files are immutable. Replacing the displayed photo retains the previous upload;
-- clients cannot destroy the original or overwrite a photo used by another page.
create function duo_private.set_memory_photo(p_memory_id uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not duo_private.is_member() then raise exception 'Geen toegang' using errcode='42501'; end if;
  if split_part(p_path,'/',1)<>p_memory_id::text or not exists(select 1 from storage.objects where bucket_id='date-memories' and name=p_path) then raise exception 'Foto niet gevonden'; end if;
  update public.date_memories set photo_path=p_path where id=p_memory_id;
  if not found then raise exception 'Herinnering niet gevonden'; end if;
end $$;

revoke all on function duo_private.memory_book(),duo_private.save_memory(uuid,text,date,text,text,text),duo_private.save_memory_story(uuid,text),duo_private.set_memory_photo(uuid,text) from public,anon,authenticated;
grant execute on function duo_private.memory_book(),duo_private.save_memory(uuid,text,date,text,text,text),duo_private.save_memory_story(uuid,text),duo_private.set_memory_photo(uuid,text) to authenticated;
create function public.memory_book() returns jsonb language sql security invoker set search_path='' as $$ select duo_private.memory_book() $$;
create function public.save_memory(p_id uuid,p_title text,p_date date,p_location text,p_letter text,p_source_key text) returns uuid language sql security invoker set search_path='' as $$ select duo_private.save_memory(p_id,p_title,p_date,p_location,p_letter,p_source_key) $$;
create function public.save_memory_story(p_memory_id uuid,p_body text) returns void language sql security invoker set search_path='' as $$ select duo_private.save_memory_story(p_memory_id,p_body) $$;
create function public.set_memory_photo(p_memory_id uuid,p_path text) returns void language sql security invoker set search_path='' as $$ select duo_private.set_memory_photo(p_memory_id,p_path) $$;
revoke all on function public.memory_book(),public.save_memory(uuid,text,date,text,text,text),public.save_memory_story(uuid,text),public.set_memory_photo(uuid,text) from public,anon,authenticated;
grant execute on function public.memory_book(),public.save_memory(uuid,text,date,text,text,text),public.save_memory_story(uuid,text),public.set_memory_photo(uuid,text) to authenticated;
commit;
