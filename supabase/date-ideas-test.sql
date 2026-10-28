-- Runs against the existing project; all test writes are rolled back.
begin;
select set_config('test.member_one', (select user_id::text from public.members order by persona limit 1), true);
select set_config('test.member_two', (select user_id::text from public.members order by persona offset 1 limit 1), true);
select set_config('test.idea_id', gen_random_uuid()::text, true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.member_one'), true);
insert into public.date_ideas(id,kind,letter,title,location,description)
values(current_setting('test.idea_id')::uuid,'alphabet','Q','QA rollback date','Testplek','Alleen binnen deze transactie');
do $$ begin
  if not exists(select 1 from public.date_ideas where id=current_setting('test.idea_id')::uuid) then raise exception 'Member cannot read own idea'; end if;
  begin
    insert into public.date_ideas(kind,letter,title) values('alphabet',null,'Invalid');
    raise exception 'Missing alphabet letter accepted';
  exception when check_violation then null; end;
  if has_table_privilege('authenticated','public.date_ideas','DELETE') then raise exception 'Unexpected permanent delete privilege'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.member_two'), true);
update public.date_ideas set completed=true where id=current_setting('test.idea_id')::uuid;
do $$ begin
  if not exists(select 1 from public.date_ideas where id=current_setting('test.idea_id')::uuid and completed) then raise exception 'Second member cannot update shared idea'; end if;
end $$;
update public.date_ideas set archived=true where id=current_setting('test.idea_id')::uuid;
update public.date_ideas set archived=false where id=current_setting('test.idea_id')::uuid;
insert into public.date_ideas(kind,title) values('date','QA favorite'),('location','QA location');
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$ begin
  if exists(select 1 from public.date_ideas) then raise exception 'Non-member can read ideas'; end if;
  update public.date_ideas set title='Unauthorized' where id=current_setting('test.idea_id')::uuid;
  if found then raise exception 'Non-member can update ideas'; end if;
  begin
    insert into public.date_ideas(kind,title) values('date','Unauthorized');
    raise exception 'Non-member can create ideas';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  if has_table_privilege('anon','public.date_ideas','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Anonymous role has access'; end if;
  begin
    perform 1 from public.date_ideas;
    raise exception 'Anonymous role can read ideas';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
