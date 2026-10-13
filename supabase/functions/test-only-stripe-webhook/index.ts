import {createClient} from "npm:@supabase/supabase-js@2.50.3";
import {requireProjectBinding} from "../_shared/projectBinding.mjs";
import {sha256Hex,verifyRawWebhook} from "../_shared/billingArchitecture.mjs";
import {parseTestOnlyCheckoutCompleted,verifyStripeTestAccount} from "../_shared/testOnlyStripeCheckout.mjs";
const reply=(status:number,code:string,details?:unknown)=>new Response(JSON.stringify({code,details}),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async request=>{
  if(request.method!=="POST")return reply(405,"METHOD_NOT_ALLOWED");
  const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"",secret=Deno.env.get("TEST_ONLY_STRIPE_SECRET_KEY")??"",hook=Deno.env.get("TEST_ONLY_STRIPE_WEBHOOK_SECRET")??"",account=Deno.env.get("TEST_ONLY_STRIPE_ACCOUNT_ID")??"";
  if(Deno.env.get("TEST_ONLY_STRIPE_CHECKOUT_ENABLED")!=="true"||!secret.startsWith("sk_test_")||secret.includes("live")||!hook.startsWith("whsec_")||!account.startsWith("acct_"))return reply(503,"TEST_ONLY_CHECKOUT_DISABLED");
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try{await requireProjectBinding(service,{backendUrl:url,projectRef:Deno.env.get("TEST_ONLY_STRIPE_PROJECT_REF"),issuer:Deno.env.get("WUXUAI_AUTH_ISSUER"),appOrigin:Deno.env.get("WUXUAI_APP_ORIGIN"),deploymentId:Deno.env.get("DENO_DEPLOYMENT_ID")});}catch{return reply(503,"PROJECT_BINDING_REQUIRED");}
  const raw=new Uint8Array(await request.arrayBuffer());if(raw.length>262144||!await verifyRawWebhook(raw,request.headers.get("stripe-signature"),hook,Math.floor(Date.now()/1000)))return reply(400,"WEBHOOK_SIGNATURE_INVALID");
  try{
    const event=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
    if(event.type!=="checkout.session.completed")return reply(422,"TEST_ONLY_CHECKOUT_EVENT_TYPE_DENIED");
    const accountReadback=await fetch("https://api.stripe.com/v1/account",{headers:{authorization:`Bearer ${secret}`}});
    if(!accountReadback.ok)throw Error("TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED");
    verifyStripeTestAccount(await accountReadback.json(),account);
    const object=event.data?.object;const readback=await fetch(`https://api.stripe.com/v1/checkout/sessions/${object?.id}?expand[]=line_items.data.price`,{headers:{authorization:`Bearer ${secret}`}});
    if(!readback.ok)throw Error("TEST_ONLY_CHECKOUT_PROVIDER_READBACK_FAILED");
    const parsed=parseTestOnlyCheckoutCompleted(event,await readback.json(),account);
    const {data,error}=await service.rpc("record_test_only_stripe_checkout_completed",{input_event_id:parsed.event_id,input_payload_sha256:await sha256Hex(raw),input_event_created_at:parsed.event_created_at,input_provider_account_id:parsed.provider_account_id,input_provider_session_id:parsed.provider_session_id,input_restaurant_id:parsed.restaurant_id,input_request_id:parsed.request_id,input_price_id:parsed.price_id,input_amount_total:parsed.amount_total,input_currency:parsed.currency,input_livemode:false});
    if(error)throw Error(error.message??"TEST_ONLY_CHECKOUT_EVENT_FAILED");return reply(200,data?.status??"TEST_ONLY_CHECKOUT_COMPLETED",data);
  }catch(error){return reply(409,error instanceof Error?error.message:"TEST_ONLY_CHECKOUT_EVENT_FAILED");}
});
