-- Operational compliance only. This is not a POS, RKSV, tax or receipt system.
create table public.kassa_compliance_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  text_version text not null check (text_version = 'kassa-separation-de-v1'),
  ui_language text not null check (ui_language in ('de','en','fr','it','es','zh','ko')),
  legal_country text check (legal_country is null or legal_country ~ '^[A-Z]{2}$'),
  accepted_at timestamptz not null default clock_timestamp(),
  audit_id uuid references public.audit_log(id) on delete set null,
  unique (restaurant_id, user_id, text_version)
);
alter table public.kassa_compliance_acknowledgements enable row level security;
revoke all on public.kassa_compliance_acknowledgements from public, anon, authenticated;

create function public.block_kassa_acknowledgement_mutation() returns trigger
language plpgsql security definer set search_path=public as $$
begin raise exception using errcode='42501', message='KASSA_ACKNOWLEDGEMENT_IMMUTABLE'; end $$;
create trigger block_kassa_acknowledgement_mutation_trigger before update or delete
on public.kassa_compliance_acknowledgements for each row execute function public.block_kassa_acknowledgement_mutation();

create table public.kassa_redemption_workflows (
  id uuid primary key default gen_random_uuid(),
  redemption_activity_id uuid not null unique references public.redemption_activity_journal(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  status text not null default 'OPEN' check (status in ('OPEN','RECORDED','OWNER_REVIEWED')),
  opened_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz, recorded_by_user_id uuid references auth.users(id) on delete restrict,
  owner_reviewed_at timestamptz, owner_reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  last_request_id uuid, updated_at timestamptz not null default clock_timestamp(),
  check ((status='OPEN' and recorded_at is null and recorded_by_user_id is null and owner_reviewed_at is null and owner_reviewed_by_user_id is null)
    or (status='RECORDED' and recorded_at is not null and recorded_by_user_id is not null and owner_reviewed_at is null and owner_reviewed_by_user_id is null)
    or (status='OWNER_REVIEWED' and recorded_at is not null and recorded_by_user_id is not null and owner_reviewed_at is not null and owner_reviewed_by_user_id is not null))
);
create index kassa_redemption_workflows_scope_idx on public.kassa_redemption_workflows(restaurant_id,status,opened_at desc);
alter table public.kassa_redemption_workflows enable row level security;
revoke all on public.kassa_redemption_workflows from public, anon, authenticated;

create function public.create_kassa_workflow_for_redemption() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='ACTIVE' then insert into public.kassa_redemption_workflows(redemption_activity_id,restaurant_id,opened_at)
    values(new.id,new.restaurant_id,new.redeemed_at) on conflict(redemption_activity_id) do nothing; end if;
  return new;
end $$;
create trigger create_kassa_workflow_for_redemption_trigger after insert on public.redemption_activity_journal
for each row execute function public.create_kassa_workflow_for_redemption();
insert into public.kassa_redemption_workflows(redemption_activity_id,restaurant_id,opened_at)
select id,restaurant_id,redeemed_at from public.redemption_activity_journal where status='ACTIVE'
on conflict(redemption_activity_id) do nothing;

create function public.accept_kassa_separation_acknowledgement(input_restaurant_id uuid,input_text_version text,input_ui_language text,input_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare row_value public.kassa_compliance_acknowledgements%rowtype; jurisdiction jsonb; row_id uuid; audit_value uuid;
begin
  if auth.uid() is null or input_request_id is null or not exists(select 1 from public.restaurant_members m where m.restaurant_id=input_restaurant_id and m.user_id=auth.uid() and m.role in('owner','admin')) then
    raise exception using errcode='42501',message='KASSA_ACKNOWLEDGEMENT_ACCESS_DENIED'; end if;
  if input_text_version<>'kassa-separation-de-v1' or input_ui_language not in('de','en','fr','it','es','zh','ko') then raise exception using errcode='22023',message='KASSA_ACKNOWLEDGEMENT_INVALID'; end if;
  select * into row_value from public.kassa_compliance_acknowledgements where restaurant_id=input_restaurant_id and user_id=auth.uid() and text_version=input_text_version;
  if row_value.id is null then
    jurisdiction:=public.resolve_restaurant_legal_jurisdiction(input_restaurant_id); row_id:=extensions.gen_random_uuid();
    audit_value:=public.write_audit_event(input_restaurant_id,null,'admin',auth.uid(),'KASSA_DISCLAIMER_ACCEPTED','success','restaurant_portal','kassa_compliance_acknowledgements',row_id,input_request_id,jsonb_build_object('text_version',input_text_version,'ui_language',input_ui_language,'legal_country',nullif(jurisdiction->>'country','')));
    insert into public.kassa_compliance_acknowledgements(id,restaurant_id,user_id,text_version,ui_language,legal_country,audit_id)
    values(row_id,input_restaurant_id,auth.uid(),input_text_version,input_ui_language,nullif(jurisdiction->>'country',''),audit_value) returning * into row_value;
  end if;
  return jsonb_build_object('accepted',true,'text_version',row_value.text_version,'accepted_at',row_value.accepted_at,'legal_country',row_value.legal_country);
end $$;

create function public.require_kassa_acknowledgement_for_activation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if (new.onboarding_status='completed' or new.operational_ready=true)
    and (old.onboarding_status is distinct from 'completed' or old.operational_ready is distinct from true)
    and not exists(select 1 from public.kassa_compliance_acknowledgements a where a.restaurant_id=new.id and a.user_id=auth.uid() and a.text_version='kassa-separation-de-v1')
  then raise exception using errcode='42501',message='KASSA_ACKNOWLEDGEMENT_REQUIRED'; end if; return new;
end $$;
create trigger require_kassa_acknowledgement_for_activation_trigger before update of onboarding_status,operational_ready on public.restaurants
for each row execute function public.require_kassa_acknowledgement_for_activation();

create function public.get_restaurant_kassa_compliance_status(input_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from public.restaurant_members m where m.restaurant_id=input_restaurant_id and m.user_id=auth.uid() and m.role in('owner','admin')) then raise exception using errcode='42501',message='KASSA_STATUS_ACCESS_DENIED'; end if;
 return jsonb_build_object('contract_version','kassa-compliance-v3','required_text_version','kassa-separation-de-v1','accepted',exists(select 1 from public.kassa_compliance_acknowledgements a where a.restaurant_id=input_restaurant_id and a.user_id=auth.uid() and a.text_version='kassa-separation-de-v1'));
end $$;

create function public.get_restaurant_kassa_reconciliation(input_restaurant_id uuid,input_date date default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare day_value date:=coalesce(input_date,(clock_timestamp() at time zone 'Europe/Vienna')::date);
begin
 if auth.uid() is null or not exists(select 1 from public.restaurant_members m where m.restaurant_id=input_restaurant_id and m.user_id=auth.uid() and m.role in('owner','admin')) then raise exception using errcode='42501',message='KASSA_RECONCILIATION_ACCESS_DENIED'; end if;
 return jsonb_build_object('date',day_value,'timezone','Europe/Vienna','rows',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'activity_number',j.activity_number,'redeemed_at',j.redeemed_at,'reward_type',j.reward_type,'reward_name',j.reward_name_snapshot,'status',w.status,'recorded_at',w.recorded_at,'owner_reviewed_at',w.owner_reviewed_at) order by j.redeemed_at desc) from public.kassa_redemption_workflows w join public.redemption_activity_journal j on j.id=w.redemption_activity_id and j.restaurant_id=w.restaurant_id where w.restaurant_id=input_restaurant_id and (j.redeemed_at at time zone 'Europe/Vienna')::date=day_value and j.status='ACTIVE'),'[]'::jsonb));
end $$;

create function public.record_kassa_redemption(input_restaurant_id uuid,input_workflow_id uuid,input_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare w public.kassa_redemption_workflows%rowtype; role_value text; staff_ok boolean:=false;
begin
 if auth.uid() is null or input_request_id is null then raise exception using errcode='42501',message='KASSA_RECORD_ACCESS_DENIED'; end if;
 select role into role_value from public.restaurant_members where restaurant_id=input_restaurant_id and user_id=auth.uid() and role in('owner','admin','manager','staff','supervisor') limit 1;
 if role_value in('staff','supervisor') then select exists(select 1 from public.staff_members s where s.restaurant_id=input_restaurant_id and s.auth_user_id=auth.uid() and s.active and s.account_status='active' and s.archived_at is null) into staff_ok; end if;
 if role_value is null or (role_value in('staff','supervisor') and not staff_ok) then raise exception using errcode='42501',message='KASSA_RECORD_ACCESS_DENIED'; end if;
 select * into w from public.kassa_redemption_workflows where id=input_workflow_id and restaurant_id=input_restaurant_id for update;
 if w.id is null then raise exception using errcode='42501',message='KASSA_RECORD_ACCESS_DENIED'; end if;
 if w.status in('RECORDED','OWNER_REVIEWED') then return jsonb_build_object('status',w.status,'already_completed',true); end if;
 update public.kassa_redemption_workflows set status='RECORDED',recorded_at=clock_timestamp(),recorded_by_user_id=auth.uid(),last_request_id=input_request_id,updated_at=clock_timestamp() where id=w.id;
 perform public.write_audit_event(input_restaurant_id,null,case when role_value in('staff','supervisor') then 'staff' else 'admin' end,auth.uid(),'KASSA_RECORDING_CONFIRMED','success',case when role_value in('staff','supervisor') then 'staff_portal' else 'restaurant_portal' end,'kassa_redemption_workflows',w.id,input_request_id,jsonb_build_object('from','OPEN','to','RECORDED','redemption_activity_id',w.redemption_activity_id));
 return jsonb_build_object('status','RECORDED','already_completed',false);
end $$;

create function public.owner_review_kassa_redemption(input_restaurant_id uuid,input_workflow_id uuid,input_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare w public.kassa_redemption_workflows%rowtype;
begin
 if auth.uid() is null or input_request_id is null or not exists(select 1 from public.restaurant_members m where m.restaurant_id=input_restaurant_id and m.user_id=auth.uid() and m.role='owner') then raise exception using errcode='42501',message='KASSA_OWNER_REVIEW_ACCESS_DENIED'; end if;
 select * into w from public.kassa_redemption_workflows where id=input_workflow_id and restaurant_id=input_restaurant_id for update;
 if w.id is null then raise exception using errcode='42501',message='KASSA_OWNER_REVIEW_ACCESS_DENIED'; end if;
 if w.status='OWNER_REVIEWED' then return jsonb_build_object('status','OWNER_REVIEWED','already_completed',true); end if;
 if w.status<>'RECORDED' then raise exception using errcode='22023',message='KASSA_OWNER_REVIEW_REQUIRES_RECORDED'; end if;
 update public.kassa_redemption_workflows set status='OWNER_REVIEWED',owner_reviewed_at=clock_timestamp(),owner_reviewed_by_user_id=auth.uid(),last_request_id=input_request_id,updated_at=clock_timestamp() where id=w.id;
 perform public.write_audit_event(input_restaurant_id,null,'admin',auth.uid(),'KASSA_OWNER_REVIEWED','success','restaurant_portal','kassa_redemption_workflows',w.id,input_request_id,jsonb_build_object('from','RECORDED','to','OWNER_REVIEWED','redemption_activity_id',w.redemption_activity_id));
 return jsonb_build_object('status','OWNER_REVIEWED','already_completed',false);
end $$;

create function public.get_platform_kassa_compliance_status(input_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception using errcode='42501',message='PLATFORM_KASSA_DIAGNOSIS_ACCESS_DENIED'; end if;
 return jsonb_build_object('contract_version','platform-kassa-diagnosis-v1','required_text_version','kassa-separation-de-v1','acknowledgement_count',(select count(*) from public.kassa_compliance_acknowledgements a where a.restaurant_id=input_restaurant_id),'open_count',(select count(*) from public.kassa_redemption_workflows w where w.restaurant_id=input_restaurant_id and w.status='OPEN'),'recorded_count',(select count(*) from public.kassa_redemption_workflows w where w.restaurant_id=input_restaurant_id and w.status='RECORDED'),'owner_reviewed_count',(select count(*) from public.kassa_redemption_workflows w where w.restaurant_id=input_restaurant_id and w.status='OWNER_REVIEWED'),'last_transition_at',(select max(updated_at) from public.kassa_redemption_workflows w where w.restaurant_id=input_restaurant_id));
end $$;

revoke all on function public.accept_kassa_separation_acknowledgement(uuid,text,text,uuid),public.get_restaurant_kassa_compliance_status(uuid),public.get_restaurant_kassa_reconciliation(uuid,date),public.record_kassa_redemption(uuid,uuid,uuid),public.owner_review_kassa_redemption(uuid,uuid,uuid),public.get_platform_kassa_compliance_status(uuid) from public,anon,authenticated;
grant execute on function public.accept_kassa_separation_acknowledgement(uuid,text,text,uuid),public.get_restaurant_kassa_compliance_status(uuid),public.get_restaurant_kassa_reconciliation(uuid,date),public.record_kassa_redemption(uuid,uuid,uuid),public.owner_review_kassa_redemption(uuid,uuid,uuid),public.get_platform_kassa_compliance_status(uuid) to authenticated;
