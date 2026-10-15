const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION=/^cs_test_[A-Za-z0-9_]{8,160}$/;
const EVENT=/^evt_[A-Za-z0-9_]{8,160}$/;
const ACCOUNT=/^acct_[A-Za-z0-9_]{8,160}$/;
const CUSTOMER=/^cus_[A-Za-z0-9_]{8,160}$/;
const TEST_CLOCK=/^clock_[A-Za-z0-9_]{8,160}$/;

function assertPreparedCheckout(prepared){
  if(!prepared||!UUID.test(prepared.id)||!UUID.test(prepared.restaurant_id)||!UUID.test(prepared.request_id)
    ||prepared.environment!=="TEST"||prepared.livemode!==false||prepared.product_code!=="BASIC"
    ||prepared.amount_minor!==5900||prepared.currency!=="EUR"||prepared.billing_interval!=="MONTH"
    ||!/^price_[A-Za-z0-9]+$/.test(prepared.price_id))throw Error("TEST_ONLY_CHECKOUT_PREPARATION_INVALID");
}

export function parseTestOnlyCheckoutRequest(value){
  if(!value||typeof value!=="object"||Array.isArray(value)
    ||Object.keys(value).sort().join(",")!=="request_id,restaurant_id,return_route"
    ||!UUID.test(value.restaurant_id)||!UUID.test(value.request_id)
    ||value.return_route!=="/admin/settings/konto-testphase")throw Error("TEST_ONLY_CHECKOUT_REQUEST_INVALID");
  return {restaurant_id:value.restaurant_id.toLowerCase(),request_id:value.request_id.toLowerCase(),return_route:value.return_route};
}

export function buildTestOnlyTestClockForm(prepared,frozenTime){
  assertPreparedCheckout(prepared);
  if(!Number.isSafeInteger(frozenTime)||frozenTime<=0)throw Error("TEST_ONLY_TEST_CLOCK_PREPARATION_INVALID");
  return new URLSearchParams({frozen_time:String(frozenTime),name:`WUXUAI TEST ${prepared.id}`});
}

export function buildTestOnlyCustomerForm(prepared,testClockId){
  assertPreparedCheckout(prepared);
  if(!TEST_CLOCK.test(testClockId))throw Error("TEST_ONLY_TEST_CUSTOMER_PREPARATION_INVALID");
  return new URLSearchParams({test_clock:testClockId,description:"WUXUAI TEST_ONLY Stripe lifecycle customer",
    "metadata[test_only]":"true","metadata[checkout_request_id]":prepared.id,
    "metadata[restaurant_id]":prepared.restaurant_id,"metadata[request_id]":prepared.request_id,
    "metadata[price_id]":prepared.price_id});
}

export function verifyTestOnlyTestClock(clock,prepared,frozenTime){
  assertPreparedCheckout(prepared);
  if(!clock||!TEST_CLOCK.test(clock.id)||clock.object!=="test_helpers.test_clock"||clock.livemode!==false
    ||clock.frozen_time!==frozenTime||clock.name!==`WUXUAI TEST ${prepared.id}`||clock.status!=="ready")
    throw Error("TEST_ONLY_TEST_CLOCK_READBACK_INVALID");
  return {test_clock_id:clock.id,frozen_time:new Date(frozenTime*1000).toISOString()};
}

export function verifyTestOnlyCustomer(customer,prepared,testClockId){
  assertPreparedCheckout(prepared);
  if(!customer||!CUSTOMER.test(customer.id)||customer.object!=="customer"||customer.livemode!==false
    ||customer.test_clock!==testClockId||customer.metadata?.test_only!=="true"
    ||customer.metadata?.checkout_request_id!==prepared.id||customer.metadata?.restaurant_id!==prepared.restaurant_id
    ||customer.metadata?.request_id!==prepared.request_id||customer.metadata?.price_id!==prepared.price_id)
    throw Error("TEST_ONLY_TEST_CUSTOMER_READBACK_INVALID");
  return {provider_customer_id:customer.id,test_clock_id:testClockId};
}

export function buildTestOnlyCheckoutForm(prepared,origin,customerId){
  assertPreparedCheckout(prepared);
  if(!/^https:\/\/[^/]+$/.test(origin)||!CUSTOMER.test(customerId))throw Error("TEST_ONLY_CHECKOUT_PREPARATION_INVALID");
  return new URLSearchParams({mode:"subscription",customer:customerId,
    success_url:`${origin}${prepared.return_route}?test_checkout=success`,
    cancel_url:`${origin}${prepared.return_route}?test_checkout=cancelled`,client_reference_id:prepared.id,
    "line_items[0][price]":prepared.price_id,"line_items[0][quantity]":"1","automatic_tax[enabled]":"false",
    "expand[]":"line_items",
    "metadata[test_only]":"true","metadata[checkout_request_id]":prepared.id,"metadata[price_id]":prepared.price_id,
    "metadata[restaurant_id]":prepared.restaurant_id,"metadata[request_id]":prepared.request_id,
    "subscription_data[metadata][test_only]":"true","subscription_data[metadata][checkout_request_id]":prepared.id,
    "subscription_data[metadata][price_id]":prepared.price_id,
    "subscription_data[metadata][restaurant_id]":prepared.restaurant_id,
    "subscription_data[metadata][request_id]":prepared.request_id});
}

export function isRestrictedStripeTestCheckoutKey(value){
  return typeof value==="string"&&/^rk_test_[A-Za-z0-9_]+$/.test(value);
}

export function verifyTestOnlyCheckoutSession(session,prepared,accountId,customerId){
  const line=session?.line_items?.data;
  if(!ACCOUNT.test(accountId)||!CUSTOMER.test(customerId)||!session||!SESSION.test(session.id)||session.livemode!==false
    ||session.mode!=="subscription"||session.status!=="open"||session.payment_status!=="unpaid"
    ||session.customer!==customerId||session.client_reference_id!==prepared.id||session.metadata?.test_only!=="true"
    ||session.metadata?.checkout_request_id!==prepared.id||session.metadata?.restaurant_id!==prepared.restaurant_id
    ||session.metadata?.request_id!==prepared.request_id||session.metadata?.price_id!==prepared.price_id||session.amount_total!==prepared.amount_minor
    ||String(session.currency).toUpperCase()!==prepared.currency||!Array.isArray(line)||line.length!==1
    ||line[0]?.price?.id!==prepared.price_id||line[0]?.quantity!==1
    ||typeof session.url!=="string"||!session.url.startsWith("https://checkout.stripe.com/"))
    throw Error("TEST_ONLY_CHECKOUT_PROVIDER_READBACK_INVALID");
  return {session_id:session.id,account_id:accountId,url:session.url};
}

export function verifyStripeTestAccount(value,expectedAccount){
  if(!ACCOUNT.test(expectedAccount)||!value||value.id!==expectedAccount||value.object!=="account")
    throw Error("TEST_ONLY_STRIPE_ACCOUNT_BINDING_INVALID");
  return expectedAccount;
}

export function parseTestOnlyCheckoutCompleted(event,session,expectedAccount){
  if(!event||!EVENT.test(event.id)||event.type!=="checkout.session.completed"||event.livemode!==false
    ||!Number.isSafeInteger(event.created)||event.created<=0||!ACCOUNT.test(expectedAccount)
    ||(event.account!==undefined&&event.account!==expectedAccount))
    throw Error("TEST_ONLY_CHECKOUT_EVENT_INVALID");
  const object=event.data?.object;
  const line=session?.line_items?.data;
  if(!object||object.id!==session?.id||!SESSION.test(object.id)||object.livemode!==false||session.livemode!==false
    ||object.mode!=="subscription"||session.mode!=="subscription"||object.status!=="complete"||session.status!=="complete"
    ||object.payment_status!=="paid"||session.payment_status!=="paid"||object.client_reference_id!==session.client_reference_id
    ||object.metadata?.test_only!=="true"||object.metadata?.checkout_request_id!==session.metadata?.checkout_request_id
    ||object.metadata?.restaurant_id!==session.metadata?.restaurant_id||object.metadata?.request_id!==session.metadata?.request_id
    ||object.metadata?.price_id!==session.metadata?.price_id
    ||object.amount_total!==session.amount_total||String(object.currency).toUpperCase()!==String(session.currency).toUpperCase()
    ||typeof object.customer!=="string"||!/^cus_[A-Za-z0-9_]{8,160}$/.test(object.customer)
    ||typeof session.customer!=="string"||session.customer!==object.customer
    ||typeof object.subscription!=="string"||!/^sub_[A-Za-z0-9_]{8,160}$/.test(object.subscription)
    ||typeof session.subscription!=="string"||session.subscription!==object.subscription
    ||!Array.isArray(line)||line.length!==1||line[0]?.quantity!==1||!/^price_[A-Za-z0-9]+$/.test(line[0]?.price?.id??"")
    ||line[0].price.id!==object.metadata?.price_id)
    throw Error("TEST_ONLY_CHECKOUT_EVENT_BINDING_INVALID");
  return {event_id:event.id,event_created_at:new Date(event.created*1000).toISOString(),provider_account_id:expectedAccount,
    provider_session_id:object.id,provider_customer_id:object.customer,provider_subscription_id:object.subscription,
    restaurant_id:object.metadata.restaurant_id,request_id:object.metadata.request_id,
    price_id:line[0].price.id,amount_total:object.amount_total,currency:String(object.currency).toUpperCase(),livemode:false};
}

const LIFECYCLE_EVENTS=new Set(["invoice.paid","invoice.payment_failed","customer.subscription.updated","customer.subscription.deleted"]);
const PRICE=/^price_[A-Za-z0-9]+$/;
const SUBSCRIPTION=/^sub_[A-Za-z0-9_]{8,160}$/;
const SUBSCRIPTION_ITEM=/^si_[A-Za-z0-9_]{8,160}$/;
const INVOICE=/^in_[A-Za-z0-9_]{8,160}$/;

function exactLifecycleMetadata(source){
  if(!source||typeof source!=="object"||Array.isArray(source))throw Error("TEST_ONLY_SUBSCRIPTION_METADATA_INVALID");
  const keys=Object.keys(source).sort();
  if(keys.join(",")!=="checkout_request_id,price_id,request_id,restaurant_id,test_only"
    ||source.test_only!=="true"||!UUID.test(source.checkout_request_id)||!UUID.test(source.restaurant_id)
    ||!UUID.test(source.request_id)||!PRICE.test(source.price_id))throw Error("TEST_ONLY_SUBSCRIPTION_METADATA_INVALID");
  return {checkout_request_id:source.checkout_request_id.toLowerCase(),restaurant_id:source.restaurant_id.toLowerCase(),
    request_id:source.request_id.toLowerCase(),price_id:source.price_id};
}

function timestamp(seconds,code){
  if(!Number.isSafeInteger(seconds)||seconds<=0)throw Error(code);
  return new Date(seconds*1000).toISOString();
}

function invoiceSubscriptionPosition(lines,subscription,priceId){
  if(!Array.isArray(lines)||lines.length===0)throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
  const positions=lines.filter(line=>line?.parent?.type==="subscription_item_details"
    ||line?.parent?.subscription_item_details!==undefined);
  if(positions.length!==1)throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
  const position=positions[0];
  const details=position?.parent?.subscription_item_details;
  const legacyPrice=position?.price?.id;
  const currentPrice=position?.pricing?.price_details?.price;
  if(!details||details.proration===true||!SUBSCRIPTION.test(details.subscription??"")
    ||details.subscription!==subscription||!SUBSCRIPTION_ITEM.test(details.subscription_item??"")
    ||position.quantity!==1||(position?.pricing?.type!==undefined&&position.pricing.type!=="price_details")
    ||(legacyPrice!==undefined&&currentPrice!==undefined&&legacyPrice!==currentPrice))
    throw Error("TEST_ONLY_SUBSCRIPTION_BINDING_INVALID");
  const positionPrice=currentPrice??legacyPrice;
  if(!PRICE.test(positionPrice??"")||positionPrice!==priceId)
    throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
  const start=position?.period?.start;
  const end=position?.period?.end;
  const periodStart=timestamp(start,"TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  const periodEnd=timestamp(end,"TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  if(end<=start)throw Error("TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  return {priceId:positionPrice,periodStart,periodEnd,start,end};
}

function subscriptionItemPosition(items,subscription,priceId){
  const data=items?.data;
  if(!Array.isArray(data)||items?.has_more===true||data.length!==1)
    throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
  const item=data[0];
  const price=item?.price;
  const plan=item?.plan;
  if(!SUBSCRIPTION_ITEM.test(item?.id??"")||item?.object!=="subscription_item"
    ||item?.subscription!==subscription||item?.quantity!==1)
    throw Error("TEST_ONLY_SUBSCRIPTION_BINDING_INVALID");
  if(!PRICE.test(price?.id??"")||price.id!==priceId
    ||(plan?.id!==undefined&&plan.id!==price.id)
    ||(price?.product!==undefined&&plan?.product!==undefined&&plan.product!==price.product))
    throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
  const start=item.current_period_start;
  const end=item.current_period_end;
  const periodStart=timestamp(start,"TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  const periodEnd=timestamp(end,"TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  if(end<=start)throw Error("TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  return {itemId:item.id,priceId:price.id,amountMinor:price.unit_amount,
    currency:String(price.currency??"").toUpperCase(),periodStart,periodEnd,start,end};
}

function assertSubscriptionHeaderPeriodDoesNotConflict(object,position){
  const start=object?.current_period_start;
  const end=object?.current_period_end;
  if(start===undefined&&end===undefined)return;
  if(!Number.isSafeInteger(start)||start<=0||!Number.isSafeInteger(end)||end<=start)
    throw Error("TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID");
  if(start!==position.start||end!==position.end)
    throw Error("TEST_ONLY_SUBSCRIPTION_PERIOD_CONFLICT");
}

export function parseTestOnlySubscriptionEvent(event,expectedAccount){
  if(!event||!EVENT.test(event.id)||!LIFECYCLE_EVENTS.has(event.type)||event.livemode!==false
    ||!Number.isSafeInteger(event.created)||event.created<=0||!ACCOUNT.test(expectedAccount)
    ||(event.account!==undefined&&event.account!==expectedAccount))throw Error("TEST_ONLY_SUBSCRIPTION_EVENT_INVALID");
  const object=event.data?.object;
  if(!object||typeof object!=="object"||Array.isArray(object)||object.livemode===true)throw Error("TEST_ONLY_SUBSCRIPTION_OBJECT_INVALID");
  const invoice=event.type.startsWith("invoice.");
  const parent=invoice?object.parent?.subscription_details:null;
  const metadata=exactLifecycleMetadata(invoice?(parent?.metadata??object.subscription_details?.metadata):object.metadata);
  const customer=typeof object.customer==="string"?object.customer:object.customer?.id;
  const subscriptions=invoice?[object.subscription,parent?.subscription].filter(Boolean):[object.id];
  if(!CUSTOMER.test(customer??"")||subscriptions.length===0||subscriptions.some(value=>!SUBSCRIPTION.test(value))
    ||new Set(subscriptions).size!==1)throw Error("TEST_ONLY_SUBSCRIPTION_BINDING_INVALID");
  const subscription=subscriptions[0];
  let providerObjectId,providerStatus,priceId,amountMinor,currency,periodStart,periodEnd,cancelAtPeriodEnd=false;
  if(invoice){
    if(!INVOICE.test(object.id??""))throw Error("TEST_ONLY_SUBSCRIPTION_OBJECT_INVALID");
    const lines=object.lines?.data;
    if(object.lines?.has_more===true)throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
    const position=invoiceSubscriptionPosition(lines,subscription,metadata.price_id);
    priceId=position.priceId;
    amountMinor=event.type==="invoice.paid"?object.amount_paid:object.amount_due;
    currency=String(object.currency??"").toUpperCase();
    periodStart=position.periodStart;
    periodEnd=position.periodEnd;
    providerObjectId=object.id;providerStatus=object.status;
  }else{
    const position=subscriptionItemPosition(object.items,subscription,metadata.price_id);
    assertSubscriptionHeaderPeriodDoesNotConflict(object,position);
    priceId=position.priceId;amountMinor=position.amountMinor;currency=position.currency;
    periodStart=position.periodStart;periodEnd=position.periodEnd;
    providerObjectId=object.id;providerStatus=object.status;cancelAtPeriodEnd=object.cancel_at_period_end===true;
  }
  if(priceId!==metadata.price_id||amountMinor!==5900||currency!=="EUR"
    ||typeof providerStatus!=="string"||providerStatus.length<1||providerStatus.length>80)
    throw Error("TEST_ONLY_SUBSCRIPTION_PRICE_INVALID");
  if(event.type==="invoice.paid"&&providerStatus!=="paid")throw Error("TEST_ONLY_SUBSCRIPTION_STATUS_INVALID");
  if(event.type==="invoice.payment_failed"&&!new Set(["open","uncollectible"]).has(providerStatus))throw Error("TEST_ONLY_SUBSCRIPTION_STATUS_INVALID");
  if(event.type==="customer.subscription.deleted"&&providerStatus!=="canceled")throw Error("TEST_ONLY_SUBSCRIPTION_STATUS_INVALID");
  if(event.type==="customer.subscription.updated"&&!new Set(["active","past_due"]).has(providerStatus))throw Error("TEST_ONLY_SUBSCRIPTION_STATUS_INVALID");
  return {event_id:event.id,event_type:event.type,event_created_at:new Date(event.created*1000).toISOString(),
    provider_account_id:expectedAccount,provider_object_id:providerObjectId,provider_customer_id:customer,
    provider_subscription_id:subscription,checkout_request_id:metadata.checkout_request_id,
    restaurant_id:metadata.restaurant_id,request_id:metadata.request_id,price_id:priceId,amount_minor:amountMinor,
    currency,provider_status:providerStatus,period_start:periodStart,period_end:periodEnd,
    cancel_at_period_end:cancelAtPeriodEnd,livemode:false};
}

export function assertStripeTestSecrets(secret,webhookSecret,account){
  if(!/^sk_test_[A-Za-z0-9_]+$/.test(secret??"")||String(secret).includes("live")
    ||!/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret??"")||!ACCOUNT.test(account??""))
    throw Error("TEST_ONLY_STRIPE_CONFIGURATION_INVALID");
}
