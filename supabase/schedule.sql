-- Background delivery is installed but disabled until SMTP and site URL are set.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create table duo_private.delivery_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  project_url text not null,
  public_anon_key text not null
);
alter table duo_private.delivery_settings enable row level security;
revoke all on duo_private.delivery_settings from public,anon,authenticated;
create policy deny_client on duo_private.delivery_settings for all to anon,authenticated using(false) with check(false);
create policy deny_client on duo_private.invitations for all to anon,authenticated using(false) with check(false);
create policy deny_client on duo_private.mail_jobs for all to anon,authenticated using(false) with check(false);
create function duo_private.wake_mail() returns void language plpgsql security definer set search_path='' as $$
declare s duo_private.delivery_settings;
begin
  select * into s from duo_private.delivery_settings where singleton and enabled;
  if not found then return;end if;
  perform net.http_post(url:=s.project_url||'/functions/v1/notify',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s.public_anon_key),body:='{}'::jsonb,timeout_milliseconds:=60000);
end;$$;
revoke all on function duo_private.wake_mail() from public,anon,authenticated,service_role;
select cron.schedule('duo-deliver-notifications','* * * * *','select duo_private.wake_mail()');
commit;
