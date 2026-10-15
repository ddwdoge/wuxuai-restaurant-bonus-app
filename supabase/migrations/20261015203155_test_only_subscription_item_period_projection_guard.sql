-- Keep the isolated lifecycle's paid period anchored to invoice.paid.
-- Subscription updates may record status/cancellation evidence, but they
-- cannot manufacture a paid renewal interval.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261015203155',0));

create or replace function public.record_test_only_stripe_subscription_event(input_event_id text,input_event_type text,
  input_payload_sha256 text,input_event_created_at timestamptz,input_provider_account_id text,input_provider_object_id text,
  input_provider_customer_id text,input_provider_subscription_id text,input_checkout_request_id uuid,
  input_restaurant_id uuid,input_request_id uuid,input_price_id text,input_amount_minor integer,input_currency text,
  input_provider_status text,input_period_start timestamptz,input_period_end timestamptz,
  input_cancel_at_period_end boolean,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare prior test_only_checkout.subscription_events%rowtype; anchor_row test_only_checkout.subscription_anchors%rowtype;
  state_row test_only_checkout.subscription_state%rowtype; next_state text; fresh_event boolean;
  apply_projection boolean; paid_period_applied boolean; evidence text;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' or input_event_id!~'^evt_[A-Za-z0-9_]{8,160}$'
    or input_event_type not in ('invoice.paid','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted')
    or input_payload_sha256!~'^[0-9a-f]{64}$' or input_event_created_at is null
    or input_provider_account_id!~'^acct_[A-Za-z0-9_]{8,160}$'
    or input_provider_customer_id!~'^cus_[A-Za-z0-9_]{8,160}$'
    or input_provider_subscription_id!~'^sub_[A-Za-z0-9_]{8,160}$'
    or input_price_id!~'^price_[A-Za-z0-9]+$' or input_amount_minor<>5900
    or upper(input_currency)<>'EUR' or input_livemode is distinct from false
    or input_period_start is null or input_period_end is null or input_period_end<=input_period_start
    or input_provider_status is null or length(input_provider_status) not between 1 and 80 then
    raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_INVALID' using errcode='22023';
  end if;
  if (input_event_type like 'invoice.%' and input_provider_object_id!~'^in_[A-Za-z0-9_]{8,160}$')
    or (input_event_type like 'customer.subscription.%' and input_provider_object_id<>input_provider_subscription_id)
    or (input_event_type='invoice.paid' and input_provider_status<>'paid')
    or (input_event_type='invoice.payment_failed' and input_provider_status not in ('open','uncollectible'))
    or (input_event_type='customer.subscription.updated' and input_provider_status not in ('active','past_due'))
    or (input_event_type='customer.subscription.deleted' and input_provider_status<>'canceled') then
    raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_SEMANTICS_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-subscription-event:'||input_event_id,0));
  select * into prior from test_only_checkout.subscription_events where event_id=input_event_id;
  if prior.event_id is not null then
    if prior.payload_sha256<>input_payload_sha256 then
      raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_REPLAY_CONFLICT' using errcode='23505';
    end if;
    select * into state_row from test_only_checkout.subscription_state where request_ref=prior.request_ref;
    return jsonb_build_object('status',prior.result_code,'idempotent',true,'event_id',prior.event_id,
      'projection_applied',prior.projection_applied,
      'paid_period_applied',(prior.event_type='invoice.paid' and prior.projection_applied),
      'synthetic_state',state_row.synthetic_state,
      'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-subscription:'||input_provider_subscription_id,0));
  select * into anchor_row from test_only_checkout.subscription_anchors where request_ref=input_checkout_request_id for share;
  if anchor_row.request_ref is null or anchor_row.restaurant_id<>input_restaurant_id
    or anchor_row.request_id<>input_request_id or anchor_row.provider_account_id<>input_provider_account_id
    or anchor_row.provider_customer_id<>input_provider_customer_id
    or anchor_row.provider_subscription_id<>input_provider_subscription_id or anchor_row.price_id<>input_price_id then
    raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_BINDING_MISMATCH' using errcode='42501';
  end if;
  select * into state_row from test_only_checkout.subscription_state where request_ref=anchor_row.request_ref for update;
  if input_event_type='invoice.paid' then
    if state_row.cancel_at_period_end then next_state:='CANCEL_AT_PERIOD_END_TEST'; else next_state:='ACTIVE_TEST'; end if;
  elsif input_event_type='invoice.payment_failed' then next_state:='PAST_DUE_TEST';
  elsif input_event_type='customer.subscription.deleted' then next_state:='CANCELLED_TEST';
  elsif input_cancel_at_period_end then next_state:='CANCEL_AT_PERIOD_END_TEST';
  elsif input_provider_status='past_due' then next_state:='PAST_DUE_TEST';
  else next_state:=state_row.synthetic_state; end if;
  fresh_event:=state_row.synthetic_state<>'CANCELLED_TEST' and
    (state_row.last_event_created_at is null or (input_event_created_at,input_event_id)>(state_row.last_event_created_at,state_row.last_event_id));
  apply_projection:=fresh_event and (input_event_type in ('invoice.paid','invoice.payment_failed','customer.subscription.deleted')
    or (input_event_type='customer.subscription.updated' and (input_cancel_at_period_end or input_provider_status='past_due')));
  paid_period_applied:=apply_projection and input_event_type='invoice.paid';
  insert into test_only_checkout.subscription_events(event_id,request_ref,restaurant_id,provider_account_id,
    provider_customer_id,provider_subscription_id,provider_object_id,event_type,livemode,price_id,amount_minor,currency,
    provider_status,period_start,period_end,cancel_at_period_end,payload_sha256,event_created_at,projection_applied,result_code)
  values(input_event_id,anchor_row.request_ref,anchor_row.restaurant_id,input_provider_account_id,input_provider_customer_id,
    input_provider_subscription_id,input_provider_object_id,input_event_type,false,input_price_id,5900,'EUR',
    input_provider_status,input_period_start,input_period_end,input_cancel_at_period_end,input_payload_sha256,
    input_event_created_at,apply_projection,'TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED');
  if apply_projection then
    perform set_config('wuxuai.test_only_subscription_write','on',true);
    update test_only_checkout.subscription_state set synthetic_state=next_state,last_event_id=input_event_id,
      last_event_created_at=input_event_created_at,
      current_period_start=case when paid_period_applied then input_period_start else current_period_start end,
      current_period_end=case when paid_period_applied then input_period_end else current_period_end end,
      cancel_at_period_end=case when input_event_type like 'customer.subscription.%' then input_cancel_at_period_end else cancel_at_period_end end,
      updated_at=clock_timestamp() where request_ref=anchor_row.request_ref;
    state_row.synthetic_state:=next_state;
  end if;
  evidence:=encode(extensions.digest(convert_to(input_event_id||':'||input_payload_sha256||':'||apply_projection::text,'UTF8'),'sha256'),'hex');
  insert into test_only_checkout.subscription_audit(request_ref,event_id,restaurant_id,action,projection_applied,evidence_sha256)
  values(anchor_row.request_ref,input_event_id,anchor_row.restaurant_id,'LIFECYCLE_EVENT_RECORDED',apply_projection,evidence);
  return jsonb_build_object('status','TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED','idempotent',false,
    'event_id',input_event_id,'projection_applied',apply_projection,'paid_period_applied',paid_period_applied,
    'synthetic_state',state_row.synthetic_state,
    'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
end $function$;
revoke all on function public.record_test_only_stripe_subscription_event(text,text,text,timestamptz,text,text,text,text,uuid,uuid,uuid,text,integer,text,text,timestamptz,timestamptz,boolean,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.record_test_only_stripe_subscription_event(text,text,text,timestamptz,text,text,text,text,uuid,uuid,uuid,text,integer,text,text,timestamptz,timestamptz,boolean,boolean)
to service_role;

notify pgrst,'reload schema';
commit;
