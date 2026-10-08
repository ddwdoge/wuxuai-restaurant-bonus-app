-- Local-only authoritative TEST webhook binding. No readiness guards changed.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261007145233',0));

create or replace function public.record_basic_stripe_test_event(
  input_event_id text,input_payload_sha256 text,input_event_type text,input_event_created_at timestamptz,
  input_provider_session_id text,input_provider_customer_id text,input_provider_subscription_id text,
  input_restaurant_id uuid,input_acceptance_id uuid,input_provider_status text,
  input_period_start timestamptz,input_period_end timestamptz,input_request_id uuid,input_correlation_id uuid,
  input_livemode boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.basic_stripe_test_event_inbox%rowtype; c public.basic_test_checkout_requests%rowtype;
  a public.basic_paid_offer_acceptances%rowtype; s public.branch_subscriptions%rowtype;
  d public.manual_basic_trial_decisions%rowtype; readiness jsonb;
  result text:='UNMATCHED'; action_value text; result_code text:='CHECKOUT_NOT_FOUND';
  state_valid boolean:=false;
  local_binding_valid boolean:=false; provider_bound boolean:=false; metadata_valid boolean:=false;
begin
  if auth.role() is distinct from 'service_role' or input_livemode is distinct from false
    or input_event_id is null or input_payload_sha256 is null or input_event_type is null
    or input_event_id!~'^evt_[A-Za-z0-9_]{8,160}$' or input_payload_sha256!~'^[0-9a-f]{64}$'
    or input_event_type not in ('checkout.session.completed','customer.subscription.created',
      'customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed')
    or input_event_created_at is null then
    raise exception 'BASIC_TEST_WEBHOOK_INVALID' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('basic-stripe-event:'||input_event_id,0));
  select * into prior from public.basic_stripe_test_event_inbox where event_id=input_event_id;
  if prior.event_id is not null then
    if prior.payload_sha256<>input_payload_sha256 then
      raise exception 'BASIC_TEST_WEBHOOK_HASH_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('event_id',input_event_id,'status',prior.processing_status,'replay',true);
  end if;
  if input_provider_session_id is not null then
    select * into c from public.basic_test_checkout_requests where provider_session_id=input_provider_session_id for update;
  elsif input_provider_subscription_id is not null then
    select * into c from public.basic_test_checkout_requests where provider_subscription_id=input_provider_subscription_id for update;
  end if;
  if c.id is null and input_acceptance_id is not null then
    select * into c from public.basic_test_checkout_requests
      where acceptance_id=input_acceptance_id and status in ('PREPARED','SESSION_CREATED','COMPLETED')
      order by created_at desc,id desc limit 1 for update;
  end if;
  if c.id is not null then
    select * into a from public.basic_paid_offer_acceptances where id=c.acceptance_id;
    select * into s from public.branch_subscriptions where id=c.subscription_id for update;
    select * into d from public.manual_basic_trial_decisions where id=a.trial_decision_id;
    -- Local relational authority; signed metadata can confirm, never replace it.
    select exists(
      select 1 from public.restaurants r
      join public.branches b on b.id=a.branch_id and b.restaurant_id=r.id
        and b.organization_id=r.organization_id
      join public.restaurant_members m on m.restaurant_id=r.id
        and m.organization_id=r.organization_id and m.user_id=a.actor_id and m.role='owner'
      where r.id=c.restaurant_id and r.id=a.restaurant_id and r.owner_id=a.actor_id
        and c.actor_id=a.actor_id and c.subscription_id=a.subscription_id
        and s.id=a.subscription_id and s.branch_id=b.id
        and s.organization_id=a.organization_id and a.organization_id=r.organization_id
        and s.plan_key='BASIC' and s.selected_plan='BASIC'
        and c.provider='STRIPE' and c.environment='TEST' and c.livemode=false
    ) into local_binding_valid;
    metadata_valid:=(input_restaurant_id is null or input_restaurant_id=a.restaurant_id)
      and (input_acceptance_id is null or input_acceptance_id=a.id)
      and (input_request_id is null or input_request_id=c.request_id)
      and (input_correlation_id is null or input_correlation_id=a.correlation_id);
    provider_bound:=coalesce(
      input_provider_subscription_id=c.provider_subscription_id
      and input_provider_subscription_id=s.stripe_subscription_id
      and input_provider_customer_id=c.provider_customer_id
      and input_provider_customer_id=s.stripe_customer_id
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
      and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$',false);
    readiness:=public.basic_paid_activation_readiness_internal(a.id,'TEST',c.price_id,false);
    state_valid:=(a.acceptance_kind='INITIAL' and d.ends_at<=statement_timestamp()
        and ((s.subscription_status='trialing' and s.payment_status in ('not_required','pending'))
          or (s.subscription_status='past_due' and s.payment_status='failed')))
      or (a.acceptance_kind='REACTIVATION'
        and ((s.subscription_status='cancelled' and s.status='cancelled')
          or (s.subscription_status='past_due' and s.payment_status='failed')));
  end if;
  -- Invoice-before-session delivery must be retryable, not permanently acknowledged.
  if c.id is not null and local_binding_valid and metadata_valid
    and input_event_type in ('invoice.paid','invoice.payment_failed','customer.subscription.deleted')
    and c.status in ('PREPARED','SESSION_CREATED')
    and c.provider_subscription_id is null and c.provider_customer_id is null
    and input_acceptance_id=a.id and input_restaurant_id=a.restaurant_id
    and input_request_id=c.request_id and input_correlation_id=a.correlation_id
    and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
    and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$' then
    return jsonb_build_object('event_id',input_event_id,'status','UNMATCHED',
      'result_code','BASIC_TEST_PROVIDER_BINDING_PENDING','replay',false);
  end if;
  if c.id is not null and local_binding_valid and metadata_valid
    and (input_provider_session_id is null or input_provider_session_id=c.provider_session_id)
    and (
      (input_event_type='checkout.session.completed'
        and c.status in ('SESSION_CREATED','COMPLETED')
        and input_provider_session_id=c.provider_session_id
        and input_acceptance_id=a.id and input_restaurant_id=a.restaurant_id
        and input_request_id=c.request_id and input_correlation_id=a.correlation_id
        and ((s.stripe_subscription_id is null and s.stripe_customer_id is null)
          or provider_bound
          or (a.acceptance_kind='REACTIVATION' and s.status='cancelled'
            and s.stripe_subscription_id=a.prior_provider_subscription_id
            and s.stripe_customer_id=input_provider_customer_id)))
      or (input_event_type<>'checkout.session.completed'
        and provider_bound and c.status='COMPLETED')
    ) then
    if exists(select 1 from public.basic_stripe_test_event_inbox event
      where event.provider_subscription_id=input_provider_subscription_id
        and event.event_created_at>input_event_created_at and event.processing_status='PROCESSED'
        and event.result_code<>'CHECKOUT_BOUND') then
      result:='STALE'; result_code:='OLDER_THAN_PROCESSED_EVENT';
    elsif input_event_type in ('checkout.session.completed','invoice.paid')
      and coalesce((readiness->>'ready')::boolean,false) is not true then
      result:='REJECTED'; result_code:='BASIC_PAID_READINESS_BLOCKED';
    elsif input_event_type='checkout.session.completed' and state_valid
      and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
      and (c.provider_subscription_id is null or c.provider_subscription_id=input_provider_subscription_id)
      and (c.provider_customer_id is null or c.provider_customer_id=input_provider_customer_id) then
      action_value:='CHECKOUT_BOUND'; result:='PROCESSED'; result_code:='CHECKOUT_BOUND';
    elsif input_event_type='invoice.paid'
      and (state_valid or (s.subscription_status='active' and s.status='active' and s.payment_status='paid'))
      and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
      and (c.provider_subscription_id is null or c.provider_subscription_id=input_provider_subscription_id)
      and (c.provider_customer_id is null or c.provider_customer_id=input_provider_customer_id)
      and input_period_start is not null and isfinite(input_period_start) and isfinite(input_period_end)
      and input_period_end>input_period_start
      and (s.current_period_end is null or input_period_end>=s.current_period_end) then
      action_value:='PAYMENT_CONFIRMED'; result:='PROCESSED'; result_code:='BASIC_PAYMENT_CONFIRMED';
    elsif input_event_type='invoice.payment_failed'
      and s.subscription_status in ('trialing','active','past_due') and s.status<>'cancelled'
      and input_provider_subscription_id is not null
      and c.provider_subscription_id=input_provider_subscription_id then
      action_value:='PAYMENT_FAILED'; result:='PROCESSED'; result_code:='BASIC_PAYMENT_FAILED';
    elsif input_event_type='customer.subscription.deleted'
      and s.subscription_status in ('trialing','active','past_due') and s.status<>'cancelled'
      and input_provider_subscription_id is not null
      and c.provider_subscription_id=input_provider_subscription_id then
      action_value:='CANCELLED'; result:='PROCESSED'; result_code:='BASIC_SUBSCRIPTION_CANCELLED';
    else result:='REJECTED'; result_code:='EVENT_NOT_STATE_CHANGING';
    end if;
  end if;
  if action_value is not null then
    insert into public.basic_test_billing_write_context(transaction_id,subscription_id,event_id,action)
    values(txid_current(),s.id,input_event_id,action_value);
    if action_value='CHECKOUT_BOUND' then
      update public.basic_test_checkout_requests set provider_customer_id=input_provider_customer_id,
        provider_subscription_id=input_provider_subscription_id,status='COMPLETED',updated_at=clock_timestamp()
        where id=c.id;
      update public.branch_subscriptions set payment_status='pending',
        stripe_customer_id=input_provider_customer_id,stripe_subscription_id=input_provider_subscription_id where id=s.id;
    elsif action_value='PAYMENT_CONFIRMED' then
      update public.basic_test_checkout_requests set
        provider_customer_id=coalesce(provider_customer_id,input_provider_customer_id),
        provider_subscription_id=coalesce(provider_subscription_id,input_provider_subscription_id),
        status='COMPLETED',updated_at=clock_timestamp() where id=c.id;
      update public.branch_subscriptions set status='active',subscription_status='active',payment_status='paid',
        stripe_customer_id=input_provider_customer_id,stripe_subscription_id=input_provider_subscription_id,
        current_period_start=input_period_start,current_period_end=input_period_end,
        current_period_ends_at=input_period_end where id=s.id;
    elsif action_value='PAYMENT_FAILED' then
      update public.branch_subscriptions set status='past_due',subscription_status='past_due',payment_status='failed' where id=s.id;
    elsif action_value='CANCELLED' then
      update public.branch_subscriptions set status='cancelled',subscription_status='cancelled',
        payment_status=case when payment_status='paid' then 'paid' else 'failed' end where id=s.id;
      update public.basic_test_checkout_requests set status='CANCELLED',updated_at=clock_timestamp() where id=c.id;
    end if;
    delete from public.basic_test_billing_write_context where transaction_id=txid_current();
  end if;
  insert into public.basic_stripe_test_event_inbox(event_id,payload_sha256,event_type,event_created_at,
    provider_session_id,provider_customer_id,provider_subscription_id,restaurant_id,acceptance_id,
    provider_status,period_start,period_end,processing_status,result_code,request_id,correlation_id,
    livemode,environment)
  values(input_event_id,input_payload_sha256,input_event_type,input_event_created_at,
    input_provider_session_id,input_provider_customer_id,input_provider_subscription_id,
    input_restaurant_id,input_acceptance_id,input_provider_status,input_period_start,input_period_end,
    result,result_code,input_request_id,input_correlation_id,false,'TEST');
  if c.id is not null then
    insert into public.audit_log(restaurant_id,actor_type,action,target_table,target_id,metadata)
    values(c.restaurant_id,'system',result_code,'basic_stripe_test_event_inbox',null,
      jsonb_build_object('event_id',input_event_id,'event_type',input_event_type,
        'processing_status',result,'request_id',input_request_id,'correlation_id',input_correlation_id));
  end if;
  return jsonb_build_object('event_id',input_event_id,'status',result,'result_code',result_code,'replay',false);
end
$function$;


revoke all on function public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
