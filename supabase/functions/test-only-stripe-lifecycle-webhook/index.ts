import {createClient} from "npm:@supabase/supabase-js@2.50.3";
import {requireProjectBinding} from "../_shared/projectBinding.mjs";
import {sha256Hex,verifyRawWebhook} from "../_shared/billingArchitecture.mjs";
import {isRestrictedStripeTestCheckoutKey,parseTestOnlySubscriptionEvent,verifyStripeTestAccount} from "../_shared/testOnlyStripeCheckout.mjs";

const reply=(status:number,code:string,details?:unknown)=>new Response(JSON.stringify({code,details}),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});

Deno.serve(async request=>{
  if(request.method!=="POST")return reply(405,"METHOD_NOT_ALLOWED");
  const url=Deno.env.get("SUPABASE_URL")??"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  const readKey=Deno.env.get("TEST_ONLY_STRIPE_WEBHOOK_RESTRICTED_KEY")??"";
  const hook=Deno.env.get("TEST_ONLY_STRIPE_LIFECYCLE_WEBHOOK_SECRET")??"";
  const account=Deno.env.get("TEST_ONLY_STRIPE_ACCOUNT_ID")??"";
  if(Deno.env.get("TEST_ONLY_STRIPE_LIFECYCLE_ENABLED")!=="true"
    ||!isRestrictedStripeTestCheckoutKey(readKey)||!/^whsec_[A-Za-z0-9_]+$/.test(hook)
    ||!/^acct_[A-Za-z0-9_]+$/.test(account))return reply(503,"TEST_ONLY_SUBSCRIPTION_LIFECYCLE_DISABLED");
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    await requireProjectBinding(service,{backendUrl:url,projectRef:Deno.env.get("TEST_ONLY_STRIPE_PROJECT_REF"),
      issuer:Deno.env.get("WUXUAI_AUTH_ISSUER"),appOrigin:Deno.env.get("WUXUAI_APP_ORIGIN"),
      deploymentId:Deno.env.get("DENO_DEPLOYMENT_ID")});
  }catch{return reply(503,"PROJECT_BINDING_REQUIRED");}
  const raw=new Uint8Array(await request.arrayBuffer());
  if(raw.length>262144||!await verifyRawWebhook(raw,request.headers.get("stripe-signature"),hook,Math.floor(Date.now()/1000)))
    return reply(400,"WEBHOOK_SIGNATURE_INVALID");
  try{
    const accountReadback=await fetch("https://api.stripe.com/v1/account",{headers:{authorization:`Bearer ${readKey}`}});
    if(!accountReadback.ok)throw Error("TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED");
    verifyStripeTestAccount(await accountReadback.json(),account);
    const event=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
    const parsed=parseTestOnlySubscriptionEvent(event,account);
    const {data,error}=await service.rpc("record_test_only_stripe_subscription_event",{
      input_event_id:parsed.event_id,input_event_type:parsed.event_type,input_payload_sha256:await sha256Hex(raw),
      input_event_created_at:parsed.event_created_at,input_provider_account_id:parsed.provider_account_id,
      input_provider_object_id:parsed.provider_object_id,input_provider_customer_id:parsed.provider_customer_id,
      input_provider_subscription_id:parsed.provider_subscription_id,input_checkout_request_id:parsed.checkout_request_id,
      input_restaurant_id:parsed.restaurant_id,input_request_id:parsed.request_id,input_price_id:parsed.price_id,
      input_amount_minor:parsed.amount_minor,input_currency:parsed.currency,input_provider_status:parsed.provider_status,
      input_period_start:parsed.period_start,input_period_end:parsed.period_end,
      input_cancel_at_period_end:parsed.cancel_at_period_end,input_livemode:false,
    });
    if(error)throw Error(error.message??"TEST_ONLY_SUBSCRIPTION_EVENT_FAILED");
    return reply(200,data?.status??"TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED",data);
  }catch(error){
    const code=error instanceof Error&&/^TEST_ONLY_[A-Z0-9_]+$/.test(error.message)
      ?error.message:"TEST_ONLY_SUBSCRIPTION_EVENT_FAILED";
    return reply(409,code);
  }
});
