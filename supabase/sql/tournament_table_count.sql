alter table public.tournaments add column table_count integer
 check (table_count is null or table_count > 0);
comment on column public.tournaments.table_count is 'Tables allocated to this tournament/category; null keeps legacy grouping.';
create function public.guard_tournament_table_count() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.table_count is distinct from old.table_count and
   (exists(select 1 from public.groups where tournament_id=old.id)
    or exists(select 1 from public.matches where tournament_id=old.id)) then
   raise exception 'Numărul de mese nu mai poate fi schimbat după generarea grupelor sau meciurilor.';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_tournament_table_count() from public,anon,authenticated;
create trigger guard_tournament_table_count before update of table_count on public.tournaments
 for each row execute function public.guard_tournament_table_count();
