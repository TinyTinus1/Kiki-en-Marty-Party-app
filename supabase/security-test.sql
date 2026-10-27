-- Transactional integration tests: all fixtures, mail jobs and changes roll back.
begin;
delete from duo_private.invitations;
insert into duo_private.invitations(email,persona,bootstrap) values('duo-marty-test@example.com','marty',true),('duo-kiki-test@example.com','kiki',false);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
('00000000-0000-4000-8000-000000000011','duo-marty-test@example.com',now(),'{}','{}','authenticated','authenticated'),
('00000000-0000-4000-8000-000000000012','duo-kiki-test@example.com',now(),'{}','{}','authenticated','authenticated'),
('00000000-0000-4000-8000-000000000013','duo-outsider-test@example.com',now(),'{}','{}','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
do $$begin
  assert (select count(*) from public.events)=0,'Outsider can read events';
  begin perform public.request_access('Outsider',date '2000-01-01');raise exception 'Outsider was admitted';exception when raise_exception then if sqlerrm='Outsider was admitted' then raise;end if;end;
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select public.request_access('Marty test',date '1999-08-12');
do $$begin assert (select count(*) from public.members)=1,'Bootstrap failed';assert (select count(*) from public.events where birthday_user_id=auth.uid())=1,'Birthday missing';end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
select public.request_access('Kiki test',date '2000-02-29');
do $$begin
  assert (select count(*) from public.events)=0,'Pending member can read events';
  begin perform public.review_request(auth.uid(),true);raise exception 'Self approval allowed';exception when raise_exception then if sqlerrm='Self approval allowed' then raise;end if;end;
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select public.review_request('00000000-0000-4000-8000-000000000012',true);
insert into public.events(id,title,starts_at,ends_at,recurrence) values('00000000-0000-4000-8000-000000000021','Weekly fixture','2026-10-18 08:00Z','2026-10-18 10:00Z','weekly');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
update public.events set title='Both admins can edit',owner_id=auth.uid() where id='00000000-0000-4000-8000-000000000021';
do $$begin assert (select owner_id from public.events where id='00000000-0000-4000-8000-000000000021')='00000000-0000-4000-8000-000000000011'::uuid,'Owner changed';end$$;
select public.set_attendance('00000000-0000-4000-8000-000000000021','2026-10-18 08:00Z',true,true);
select public.set_attendance('00000000-0000-4000-8000-000000000021','2026-10-25 09:00Z',false,false);
do $$begin
  assert (select count(*) from public.attendance)=2,'Series and exception not saved';
  begin perform public.set_attendance('00000000-0000-4000-8000-000000000021','2026-10-24 09:00Z',false,true);raise exception 'Invalid occurrence admitted';exception when raise_exception then if sqlerrm='Invalid occurrence admitted' then raise;end if;end;
  begin insert into public.members values('00000000-0000-4000-8000-000000000013','Intruder','marty');raise exception 'Member write admitted';exception when insufficient_privilege then null;end;
  assert public.import_events('[{"title":"Import fixture","starts_at":"2026-11-01T12:00:00Z","ends_at":"2026-11-01T13:00:00Z","location":"","description":"","all_day":false,"import_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb)=1,'Import failed';
  assert public.import_events('[{"title":"Import fixture","starts_at":"2026-11-01T12:00:00Z","ends_at":"2026-11-01T13:00:00Z","import_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb)=0,'Import duplicated';
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
do $$begin assert (select count(*) from public.events)=0,'Outsider sees existing plans';assert (select count(*) from public.members)=0,'Outsider sees members';assert (select count(*) from public.attendance)=0,'Outsider sees attendance';end$$;
do $$begin begin perform public.claim_mail();raise exception 'Client could claim mail';exception when insufficient_privilege then null;end;end$$;
reset role;
do $$begin assert (select count(*) from duo_private.mail_jobs where kind='activity')=2,'Activity mail queue missing';end$$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$begin assert jsonb_array_length(public.claim_mail())=4,'Wrong mail claim count';assert jsonb_array_length(public.claim_mail())=0,'Concurrent duplicate claim';end$$;
reset role;
do $$declare j duo_private.mail_jobs;begin
  for j in select * from duo_private.mail_jobs where status='sending' loop perform public.finish_mail(j.id,'00000000-0000-4000-8000-000000000099',true);end loop;
  assert (select count(*) from duo_private.mail_jobs where status='sent')=0,'Wrong lease accepted';
  for j in select * from duo_private.mail_jobs where status='sending' loop perform public.finish_mail(j.id,j.lease,true);end loop;
  assert (select count(*) from duo_private.mail_jobs where status='sent')=4,'Valid leases not finalized';
end$$;
rollback;
select 'PASS: onboarding, approval, equal admins, immutable ownership, birthday, RLS, series attendance, DST, import deduplication and notification queue; all fixtures rolled back' as result;
