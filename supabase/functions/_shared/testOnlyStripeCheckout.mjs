const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION=/^cs_test_[A-Za-z0-9_]{8,160}$/;
const EVENT=/^evt_[A-Za-z0-9_]{8,160}$/;
const ACCOUNT=/^acct_[A-Za-z0-9_]{8,160}$/;

export function parseTestOnlyCheckoutRequest(value){
  if(!value||typeof value!=="object"||Array.isArray(value)
    ||Object.keys(value).sort().join(",")!=="request_id,restaurant_id,return_route"
    ||!UUID.test(value.restaurant_id)||!UUID.test(value.request_id)
    ||value.return_route!=="/admin/settings/konto-testphase")throw Error("TEST_ONLY_CHECKOUT_REQUEST_INVALID");
  return {restaurant_id:value.restaurant_id.toLowerCase(),request_id:value.request_id.toLowerCase(),return_route:value.return_route};
}

export function buildTestOnlyCheckoutForm(prepared,origin){
  if(!prepared||!UUID.test(prepared.id)||!UUID.test(prepared.restaurant_id)||!UUID.test(prepared.request_id)
    ||prepared.environment!=="TEST"||prepared.livemode!==false||prepared.product_code!=="BASIC"
    ||prepared.amount_minor!==5900||prepared.currency!=="EUR"||prepared.billing_interval!=="MONTH"
    ||!/^price_[A-Za-z0-9]+$/.test(prepared.price_id)||!/^https:\/\/[^/]+$/.test(origin))
    throw Error("TEST_ONLY_CHECKOUT_PREPARATION_INVALID");
  return new URLSearchParams({mode:"subscription",success_url:`${origin}${prepared.return_route}?test_checkout=success`,
    cancel_url:`${origin}${prepared.return_route}?test_checkout=cancelled`,client_reference_id:prepared.id,
    "line_items[0][price]":prepared.price_id,"line_items[0][quantity]":"1","automatic_tax[enabled]":"false",
    "expand[]":"line_items",
    "metadata[test_only]":"true","metadata[checkout_request_id]":prepared.id,"metadata[price_id]":prepared.price_id,
    "metadata[restaurant_id]":prepared.restaurant_id,"metadata[request_id]":prepared.request_id});
}

export function isRestrictedStripeTestCheckoutKey(value){
  return typeof value==="string"&&/^rk_test_[A-Za-z0-9_]+$/.test(value);
}

export function verifyTestOnlyCheckoutSession(session,prepared,accountId){
  const line=session?.line_items?.data;
  if(!ACCOUNT.test(accountId)||!session||!SESSION.test(session.id)||session.livemode!==false
    ||session.mode!=="subscription"||session.status!=="open"||session.payment_status!=="unpaid"
    ||session.client_reference_id!==prepared.id||session.metadata?.test_only!=="true"
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
    ||!Array.isArray(line)||line.length!==1||line[0]?.quantity!==1||!/^price_[A-Za-z0-9]+$/.test(line[0]?.price?.id??"")
    ||line[0].price.id!==object.metadata?.price_id)
    throw Error("TEST_ONLY_CHECKOUT_EVENT_BINDING_INVALID");
  return {event_id:event.id,event_created_at:new Date(event.created*1000).toISOString(),provider_account_id:expectedAccount,
    provider_session_id:object.id,restaurant_id:object.metadata.restaurant_id,request_id:object.metadata.request_id,
    price_id:line[0].price.id,amount_total:object.amount_total,currency:String(object.currency).toUpperCase(),livemode:false};
}

export function assertStripeTestSecrets(secret,webhookSecret,account){
  if(!/^sk_test_[A-Za-z0-9_]+$/.test(secret??"")||String(secret).includes("live")
    ||!/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret??"")||!ACCOUNT.test(account??""))
    throw Error("TEST_ONLY_STRIPE_CONFIGURATION_INVALID");
}
