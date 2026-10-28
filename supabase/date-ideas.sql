-- Shared date ideas and favorites; access follows the existing two-member agenda.
begin;
create table public.date_ideas (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('alphabet','date','location')),
  letter text,
  title text not null check (char_length(trim(title)) between 1 and 100),
  location text not null default '' check (char_length(location) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  completed boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'alphabet' and letter ~ '^[A-Z]$' and letter is not null) or (kind <> 'alphabet' and letter is null)),
  check (kind = 'alphabet' or not completed)
);
alter table public.date_ideas enable row level security;
revoke all on public.date_ideas from public, anon, authenticated;
grant select, insert, update on public.date_ideas to authenticated;
create policy ideas_read on public.date_ideas for select to authenticated using ((select duo_private.is_member()));
create policy ideas_insert on public.date_ideas for insert to authenticated with check ((select duo_private.is_member()));
create policy ideas_update on public.date_ideas for update to authenticated using ((select duo_private.is_member())) with check ((select duo_private.is_member()));
commit;
