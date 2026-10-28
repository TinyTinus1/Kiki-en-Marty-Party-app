-- Existing two-member project. Every fixture and story is rolled back; no mail.
begin;
select set_config('test.memory_id',gen_random_uuid()::text,true);
select set_config('test.member_one',(select user_id::text from public.members order by persona limit 1),true);
select set_config('test.member_two',(select user_id::text from public.members order by persona offset 1 limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.member_one'),true);
select public.save_memory(current_setting('test.memory_id')::uuid,'QA herinnering',date '2026-10-24','Teststrand','U','qa:'||current_setting('test.memory_id'));
select public.save_memory_story(current_setting('test.memory_id')::uuid,'ONE_PRIVATE_STORY');
do $$ declare book jsonb; item jsonb; duplicate_id uuid; begin
  select value into item from jsonb_array_elements(public.memory_book()) where value->>'id'=current_setting('test.memory_id');
  if item->>'revealed_at' is not null then raise exception 'Premature reveal'; end if;
  if position('ONE_PRIVATE_STORY' in item::text)=0 then raise exception 'Own story missing'; end if;
  if has_table_privilege('authenticated','duo_private.memory_stories','SELECT') then raise exception 'Direct private story access'; end if;
  begin perform body from duo_private.memory_stories; raise exception 'Private story exposed'; exception when insufficient_privilege then null; end;
  begin update public.date_memories set revealed_at=now() where id=current_setting('test.memory_id')::uuid; raise exception 'Reveal can be forged'; exception when insufficient_privilege then null; end;
  duplicate_id:=public.save_memory(gen_random_uuid(),'Duplicate',date '2026-10-24','','U','qa:'||current_setting('test.memory_id'));
  if duplicate_id::text<>current_setting('test.memory_id') then raise exception 'Duplicate source created another page'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.member_two'),true);
do $$ declare item jsonb; begin
  select value into item from jsonb_array_elements(public.memory_book()) where value->>'id'=current_setting('test.memory_id');
  if position('ONE_PRIVATE_STORY' in item::text)>0 then raise exception 'Other story leaked before reveal'; end if;
  if not exists(select 1 from jsonb_array_elements(item->'stories') s where (s->>'submitted')::boolean and s->>'body' is null) then raise exception 'Submission status missing'; end if;
  begin perform public.save_memory_story(current_setting('test.memory_id')::uuid,'   '); raise exception 'Empty story accepted'; exception when check_violation then null; end;
  begin perform public.set_memory_photo(current_setting('test.memory_id')::uuid,'different-memory/missing.jpg'); raise exception 'Invalid photo accepted'; exception when raise_exception then if sqlerrm='Invalid photo accepted' then raise; end if; end;
end $$;
select public.save_memory_story(current_setting('test.memory_id')::uuid,'TWO_PRIVATE_STORY');
do $$ declare item jsonb; begin
  select value into item from jsonb_array_elements(public.memory_book()) where value->>'id'=current_setting('test.memory_id');
  if item->>'revealed_at' is null then raise exception 'Both stories did not reveal'; end if;
  if position('ONE_PRIVATE_STORY' in item::text)=0 or position('TWO_PRIVATE_STORY' in item::text)=0 then raise exception 'Revealed story missing'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.member_one'),true);
select public.save_memory_story(current_setting('test.memory_id')::uuid,'ONE_EDITED_STORY');
do $$ declare item jsonb; begin
  select value into item from jsonb_array_elements(public.memory_book()) where value->>'id'=current_setting('test.memory_id');
  if item->>'revealed_at' is null or position('TWO_PRIVATE_STORY' in item::text)=0 then raise exception 'Editing changed another story or hid reveal'; end if;
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$ begin
  if exists(select 1 from public.date_memories) then raise exception 'Non-member can read memories'; end if;
  begin perform public.memory_book(); raise exception 'Non-member can read book'; exception when insufficient_privilege then null; end;
  begin perform public.save_memory_story(current_setting('test.memory_id')::uuid,'Unauthorized'); raise exception 'Non-member can write story'; exception when insufficient_privilege then null; end;
  begin perform public.save_memory(gen_random_uuid(),'Unauthorized',date '2026-10-24','',null,null); raise exception 'Non-member can create memory'; exception when insufficient_privilege then null; end;
  if exists(select 1 from storage.objects where bucket_id='date-memories') then raise exception 'Non-member can read photos'; end if;
end $$;
set local role anon;
do $$ begin
  if has_function_privilege('anon','public.memory_book()','EXECUTE') then raise exception 'Anonymous RPC access'; end if;
  if has_table_privilege('anon','public.date_memories','SELECT') then raise exception 'Anonymous metadata access'; end if;
  begin perform public.memory_book(); raise exception 'Anonymous can read book'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from storage.buckets where id='date-memories' and public) then raise exception 'Photo bucket is public'; end if;
end $$;
rollback;
