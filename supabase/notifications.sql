begin;
create table duo_private.mail_batches(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now());
alter table duo_private.mail_batches enable row level security;
revoke all on duo_private.mail_batches from public,anon,authenticated;
create policy deny_client on duo_private.mail_batches for all to anon,authenticated using(false) with check(false);
create function duo_private.claim_mail() returns jsonb language plpgsql security definer set search_path='' as $$
declare j duo_private.mail_jobs; batch record; token uuid; jobs jsonb:='[]'; recipient text; person_name text; item jsonb; remaining int;
begin
  if (current_setting('request.jwt.claims',true)::jsonb->>'role') is distinct from 'service_role' then raise exception 'Geen toegang';end if;
  perform pg_advisory_xact_lock(746292);
  update duo_private.mail_jobs set status='failed' where status='sending' and attempts>=5 and claimed_at<now()-interval '10 minutes';
  remaining:=greatest(0,100-(select count(*) from duo_private.mail_batches where created_at>now()-interval '1 day'));
  for batch in select recipient_id,kind from duo_private.mail_jobs where ((status='pending' and next_attempt_at<=now()) or (status='sending' and claimed_at<now()-interval '10 minutes')) and attempts<5 group by recipient_id,kind order by min(created_at) limit least(remaining,5) loop
  insert into duo_private.mail_batches default values;
  for j in select * from duo_private.mail_jobs where recipient_id=batch.recipient_id and kind=batch.kind and ((status='pending' and next_attempt_at<=now()) or (status='sending' and claimed_at<now()-interval '10 minutes')) and attempts<5 order by created_at for update skip locked limit 200 loop
    select u.email,m.display_name into recipient,person_name from public.members m join auth.users u on u.id=m.user_id where m.user_id=j.recipient_id and u.email_confirmed_at is not null;
    if recipient is null then update duo_private.mail_jobs set status='skipped' where id=j.id;continue;end if;
    item:=null;
    if j.kind='activity' then select jsonb_build_object('title',title,'starts_at',starts_at,'location',location) into item from public.events where id=j.event_id;
    elsif j.kind='request' then select jsonb_build_object('name',display_name) into item from public.access_requests where user_id=j.request_user_id and status='pending';
    else select jsonb_build_object('name',display_name) into item from public.access_requests where user_id=j.request_user_id and status='approved';end if;
    if item is null then update duo_private.mail_jobs set status='skipped' where id=j.id;continue;end if;
    token:=gen_random_uuid();
    update duo_private.mail_jobs set status='sending',attempts=attempts+1,claimed_at=now(),lease=token where id=j.id;
    jobs:=jobs||jsonb_build_array(jsonb_build_object('id',j.id,'lease',token,'recipient',recipient,'name',person_name,'kind',j.kind,'item',item));
  end loop;
  end loop;return jobs;
end;$$;
revoke all on function duo_private.claim_mail() from public,anon,authenticated;
grant execute on function duo_private.claim_mail() to service_role;
create function public.claim_mail() returns jsonb language sql security invoker set search_path='' as $$ select duo_private.claim_mail() $$;
revoke all on function public.claim_mail() from public,anon,authenticated;
grant execute on function public.claim_mail() to service_role;
create function duo_private.finish_mail(p_id uuid,p_lease uuid,p_sent boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if (current_setting('request.jwt.claims',true)::jsonb->>'role') is distinct from 'service_role' then raise exception 'Geen toegang';end if;
  update duo_private.mail_jobs set status=case when p_sent then 'sent' when attempts>=5 then 'failed' else 'pending' end,next_attempt_at=now()+make_interval(mins=>10*attempts),lease=null where id=p_id and lease=p_lease and status='sending';
end;$$;
revoke all on function duo_private.finish_mail(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function duo_private.finish_mail(uuid,uuid,boolean) to service_role;
create function public.finish_mail(p_id uuid,p_lease uuid,p_sent boolean) returns void language sql security invoker set search_path='' as $$select duo_private.finish_mail(p_id,p_lease,p_sent)$$;
revoke all on function public.finish_mail(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_mail(uuid,uuid,boolean) to service_role;
commit;
