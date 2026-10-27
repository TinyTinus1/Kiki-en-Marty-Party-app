-- Initial schema for the separate Kiki & Marty project. No personal data or secrets.
begin;
create schema if not exists duo_private;
revoke all on schema duo_private from public, anon;
grant usage on schema duo_private to authenticated, service_role;

create table duo_private.invitations (
  email text primary key check (email=lower(trim(email))),
  persona text unique not null check (persona in ('kiki','marty')),
  bootstrap boolean not null default false
);
alter table duo_private.invitations enable row level security;
create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  persona text unique not null check (persona in ('kiki','marty'))
);
create table public.access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  birth_date date not null check (birth_date >= date '1900-01-01'),
  persona text not null check (persona in ('kiki','marty')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.members(user_id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  starts_at timestamptz not null, ends_at timestamptz not null,
  location text not null default '' check (char_length(location)<=200),
  description text not null default '' check (char_length(description)<=2000),
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','yearly')),
  all_day boolean not null default false,
  birthday_user_id uuid unique references public.members(user_id) on delete cascade,
  import_key text unique check (import_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (ends_at>starts_at), check (recurrence='none' or ends_at-starts_at <= interval '31 days')
);
create index events_owner on public.events(owner_id);
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.members(user_id) on delete cascade,
  occurrence_start timestamptz,
  attending boolean not null,
  unique nulls not distinct (event_id,user_id,occurrence_start)
);
create index attendance_user on public.attendance(user_id);
create table duo_private.mail_jobs (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.members(user_id) on delete cascade,
  kind text not null check (kind in ('activity','approval','request')),
  event_id uuid references public.events(id) on delete cascade,
  request_user_id uuid references public.access_requests(user_id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz, lease uuid, created_at timestamptz not null default now(),
  unique nulls not distinct(recipient_id,kind,event_id,request_user_id)
);
alter table duo_private.mail_jobs enable row level security;

create function duo_private.is_member() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.members m join auth.users u on u.id=m.user_id where m.user_id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function duo_private.is_member() from public,anon;
grant execute on function duo_private.is_member() to authenticated;

alter table public.members enable row level security;
alter table public.access_requests enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
revoke all on public.members, public.access_requests, public.events, public.attendance from anon,authenticated;
grant select on public.members, public.access_requests, public.events, public.attendance to authenticated;
grant insert,update,delete on public.events to authenticated;
create policy member_read on public.members for select to authenticated using ((select duo_private.is_member()));
create policy request_read on public.access_requests for select to authenticated using (user_id=(select auth.uid()) or (select duo_private.is_member()));
create policy event_read on public.events for select to authenticated using ((select duo_private.is_member()));
create policy event_insert on public.events for insert to authenticated with check ((select duo_private.is_member()) and owner_id=(select auth.uid()) and birthday_user_id is null);
create policy event_update on public.events for update to authenticated using ((select duo_private.is_member())) with check ((select duo_private.is_member()));
create policy event_delete on public.events for delete to authenticated using ((select duo_private.is_member()));
create policy attendance_read on public.attendance for select to authenticated using ((select duo_private.is_member()));

create function duo_private.approve(person uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.access_requests; anchor date;
begin
  perform pg_advisory_xact_lock(746291);
  select * into strict r from public.access_requests where user_id=person and status='pending' for update;
  if not exists(select 1 from duo_private.invitations i join auth.users u on lower(u.email)=i.email where u.id=person and u.email_confirmed_at is not null and i.persona=r.persona) then raise exception 'Dit account is niet uitgenodigd';end if;
  insert into public.members(user_id,display_name,persona) values(person,r.display_name,r.persona);
  update public.access_requests set status='approved' where user_id=person;
  anchor:=make_date(2000,extract(month from r.birth_date)::int,extract(day from r.birth_date)::int);
  insert into public.events(owner_id,title,starts_at,ends_at,recurrence,all_day,birthday_user_id)
    values(person,'Verjaardag van '||r.display_name,anchor::timestamp at time zone 'Europe/Amsterdam',(anchor+1)::timestamp at time zone 'Europe/Amsterdam','yearly',true,person);
  insert into duo_private.mail_jobs(recipient_id,kind,request_user_id) values(person,'approval',person) on conflict do nothing;
end;$$;
revoke all on function duo_private.approve(uuid) from public,anon,authenticated;

create function duo_private.submit_access(p_name text,p_birth_date date) returns void language plpgsql security definer set search_path='' as $$
declare person uuid:=auth.uid(); invite duo_private.invitations; verified_email text;
begin
  if person is null then raise exception 'Log eerst in';end if;
  select lower(email) into verified_email from auth.users where id=person and email_confirmed_at is not null;
  select * into invite from duo_private.invitations where email=verified_email;
  if invite.email is null then raise exception 'Dit e-mailadres is niet uitgenodigd';end if;
  if p_birth_date is null or p_birth_date<date '1900-01-01' or p_birth_date>current_date then raise exception 'Vul een geldige geboortedatum in';end if;
  if char_length(trim(p_name)) not between 1 and 80 then raise exception 'Vul een naam in';end if;
  insert into public.access_requests(user_id,email,display_name,birth_date,persona) values(person,verified_email,trim(p_name),p_birth_date,invite.persona);
  if invite.bootstrap then perform duo_private.approve(person);
  else
    insert into duo_private.mail_jobs(recipient_id,kind,request_user_id) select user_id,'request',person from public.members on conflict do nothing;
  end if;
end;$$;
revoke all on function duo_private.submit_access(text,date) from public,anon;
grant execute on function duo_private.submit_access(text,date) to authenticated;
create function public.request_access(p_name text,p_birth_date date) returns void language sql security invoker set search_path='' as $$select duo_private.submit_access(p_name,p_birth_date)$$;
revoke all on function public.request_access(text,date) from public,anon;
grant execute on function public.request_access(text,date) to authenticated;

create function duo_private.review_request(p_user_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not duo_private.is_member() then raise exception 'Geen beheerrechten';end if;
  if p_approve then perform duo_private.approve(p_user_id);
  else update public.access_requests set status='rejected' where user_id=p_user_id and status='pending';end if;
end;$$;
revoke all on function duo_private.review_request(uuid,boolean) from public,anon;
grant execute on function duo_private.review_request(uuid,boolean) to authenticated;
create function public.review_request(p_user_id uuid,p_approve boolean) returns void language sql security invoker set search_path='' as $$select duo_private.review_request(p_user_id,p_approve)$$;
revoke all on function public.review_request(uuid,boolean) from public,anon;
grant execute on function public.review_request(uuid,boolean) to authenticated;

create function duo_private.guard_event() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    new.owner_id:=old.owner_id;new.created_at:=old.created_at;new.birthday_user_id:=old.birthday_user_id;new.import_key:=old.import_key;
    if old.birthday_user_id is not null then new.starts_at:=old.starts_at;new.ends_at:=old.ends_at;new.recurrence:='yearly';new.all_day:=true;end if;
  elsif new.birthday_user_id is not null and current_user<>'postgres' then raise exception 'Verjaardagen worden automatisch aangemaakt';end if;
  return new;
end;$$;
revoke all on function duo_private.guard_event() from public,anon,authenticated;
create trigger guard_event before insert or update on public.events for each row execute function duo_private.guard_event();
create function duo_private.reset_attendance() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not duo_private.is_member() then raise exception 'Geen toegang';end if;
  if (new.starts_at,new.ends_at,new.recurrence) is distinct from (old.starts_at,old.ends_at,old.recurrence) then delete from public.attendance where event_id=new.id;end if;
  return new;
end;$$;
revoke all on function duo_private.reset_attendance() from public,anon,authenticated;
create trigger reset_attendance after update on public.events for each row execute function duo_private.reset_attendance();

create function duo_private.set_attendance(p_event_id uuid,p_occurrence timestamptz,p_series boolean,p_attending boolean) returns void language plpgsql security definer set search_path='' as $$
declare ev public.events; anchor timestamp; candidate timestamp; span interval; delta int;
begin
  if auth.uid() is null or not duo_private.is_member() then raise exception 'Geen toegang';end if;
  select * into strict ev from public.events where id=p_event_id for update;
  if p_series and ev.recurrence='none' then raise exception 'Deze activiteit is geen reeks';end if;
  if not p_series then
    if p_occurrence is null then raise exception 'Datum ontbreekt';end if;
    anchor:=ev.starts_at at time zone 'Europe/Amsterdam';candidate:=p_occurrence at time zone 'Europe/Amsterdam';
    delta:=candidate::date-anchor::date;
    if p_occurrence<ev.starts_at or
       (ev.recurrence='none' and p_occurrence<>ev.starts_at) or
       (ev.recurrence in ('daily','weekly') and (delta<0 or (ev.recurrence='weekly' and delta%7<>0) or ((anchor+make_interval(days=>delta)) at time zone 'Europe/Amsterdam')<>p_occurrence)) or
       (ev.recurrence='yearly' and ((anchor+make_interval(years=>extract(year from candidate)::int-extract(year from anchor)::int)) at time zone 'Europe/Amsterdam')<>p_occurrence)
    then raise exception 'Geen geldige datum in deze reeks';end if;
  end if;
  if p_series then delete from public.attendance where event_id=p_event_id and user_id=auth.uid();end if;
  insert into public.attendance(event_id,user_id,occurrence_start,attending) values(p_event_id,auth.uid(),case when p_series then null else p_occurrence end,p_attending)
  on conflict(event_id,user_id,occurrence_start) do update set attending=excluded.attending;
end;$$;
revoke all on function duo_private.set_attendance(uuid,timestamptz,boolean,boolean) from public,anon;
grant execute on function duo_private.set_attendance(uuid,timestamptz,boolean,boolean) to authenticated;
create function public.set_attendance(p_event_id uuid,p_occurrence timestamptz,p_series boolean,p_attending boolean) returns void language sql security invoker set search_path='' as $$select duo_private.set_attendance(p_event_id,p_occurrence,p_series,p_attending)$$;
revoke all on function public.set_attendance(uuid,timestamptz,boolean,boolean) from public,anon;
grant execute on function public.set_attendance(uuid,timestamptz,boolean,boolean) to authenticated;

create function public.import_events(p_rows jsonb) returns int language plpgsql security invoker set search_path='' as $$
declare count_added int;
begin
  if auth.uid() is null or not duo_private.is_member() then raise exception 'Geen toegang';end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Maximaal 200 activiteiten';end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where r->>'import_key' is null) then raise exception 'Importkenmerk ontbreekt';end if;
  insert into public.events(title,starts_at,ends_at,location,description,all_day,import_key)
  select r->>'title',(r->>'starts_at')::timestamptz,(r->>'ends_at')::timestamptz,coalesce(r->>'location',''),coalesce(r->>'description',''),coalesce((r->>'all_day')::boolean,false),r->>'import_key' from jsonb_array_elements(p_rows) r
  on conflict(import_key) do nothing;
  get diagnostics count_added=row_count;return count_added;
end;$$;
revoke all on function public.import_events(jsonb) from public,anon;
grant execute on function public.import_events(jsonb) to authenticated;

create function duo_private.queue_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.birthday_user_id is not null then return new;end if;
  if auth.uid() is null or not duo_private.is_member() then raise exception 'Geen toegang';end if;
  insert into duo_private.mail_jobs(recipient_id,kind,event_id) select user_id,'activity',new.id from public.members where user_id<>new.owner_id on conflict do nothing;
  return new;
end;$$;
revoke all on function duo_private.queue_activity() from public,anon,authenticated;
create trigger queue_activity after insert on public.events for each row execute function duo_private.queue_activity();

create function public.get_snapshot() returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object('members',coalesce((select jsonb_agg(m) from public.members m),'[]'::jsonb),'plans',coalesce((select jsonb_agg(e order by e.starts_at) from public.events e),'[]'::jsonb),'attendance',coalesce((select jsonb_agg(a) from public.attendance a),'[]'::jsonb),'requests',coalesce((select jsonb_agg(r) from public.access_requests r),'[]'::jsonb))
$$;
revoke all on function public.get_snapshot() from public,anon;
grant execute on function public.get_snapshot() to authenticated;
commit;
