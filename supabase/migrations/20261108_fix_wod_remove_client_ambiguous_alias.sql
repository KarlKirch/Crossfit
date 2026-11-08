-- Repairs the ambiguous trainings table alias in the client removal RPC.
-- Preserves safeguards, refunds, cancellation behavior and audit trail.
CREATE OR REPLACE FUNCTION public.wod_remove_client(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  reg record;
  t public.wod_trainings%rowtype;
  reason_text text;
begin
  if caller is null or coalesce((select (auth.jwt()->>'is_anonymous')::boolean),true) then
    raise exception 'CrossFit nõuab e-posti kontoga sisselogimist';
  end if;
  if not private.wod_is_active_user() or not private.wod_is_trainer() then
    raise exception 'Ainult aktiivne treener saab klienti eemaldada';
  end if;
  if p_user_id is null or p_user_id=caller then
    raise exception 'Seda kasutajat ei saa eemaldada';
  end if;
  if not exists(select 1 from public.wod_profiles where user_id=p_user_id and role='client') then
    raise exception 'Klienti ei leitud';
  end if;
  if exists(select 1 from public.wod_removed_clients where user_id=p_user_id) then
    return true;
  end if;

  for reg in
    select r.id,r.training_id,r.status,r.credit_charged
    from public.wod_registrations r
    join public.wod_trainings wt on wt.id=r.training_id
    where r.user_id=p_user_id
      and r.status in ('confirmed','waitlist')
      and wt.starts_at>now()
    order by wt.starts_at
    for update of r
  loop
    if reg.status='confirmed' and reg.credit_charged then
      select * into t from public.wod_trainings where id=reg.training_id;

      update public.wod_wallets
      set credits=credits+1,updated_at=now()
      where user_id=p_user_id;

      reason_text := left(
        'Tagastus, klient eemaldatud: '||coalesce(t.title,'Treening')||' '||
        coalesce(to_char(t.starts_at at time zone 'Europe/Tallinn','DD.MM.YYYY HH24:MI'),''),
        120
      );

      insert into public.wod_credit_transactions(user_id,trainer_id,delta,reason,amount_cents)
      values(p_user_id,caller,1,reason_text,null);
    end if;

    update public.wod_registrations
    set status='cancelled',
        cancelled_late=false,
        cancelled_at=now(),
        credit_charged=false,
        payment_status='unpaid',
        package_instance_id=null,
        use_package_requested=false,
        updated_at=now()
    where id=reg.id;

    if reg.status='confirmed' then
      perform private.wod_promote_waitlist_for_training(reg.training_id);
    end if;
  end loop;

  delete from public.wod_push_subscriptions where user_id=p_user_id;
  delete from public.wod_notifications where user_id=p_user_id and sent_at is null;

  insert into public.wod_removed_clients(user_id,removed_at,removed_by,reason)
  values(p_user_id,now(),caller,nullif(trim(p_reason),''))
  on conflict(user_id) do update
  set removed_at=excluded.removed_at,removed_by=excluded.removed_by,reason=excluded.reason;

  return true;
end;
$function$
;
