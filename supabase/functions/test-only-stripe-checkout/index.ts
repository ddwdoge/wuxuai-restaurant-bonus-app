import {createClient} from "npm:@supabase/supabase-js@2.50.3";
import {requireProjectBinding,requireProjectSession} from "../_shared/projectBinding.mjs";
import {buildTestOnlyCheckoutForm,parseTestOnlyCheckoutRequest,verifyStripeTestAccount,verifyTestOnlyCheckoutSession} from "../_shared/testOnlyStripeCheckout.mjs";

const reply=(status:number,code:string,details?:unknown,origin?:string)=>new Response(JSON.stringify({code,details}),{status,headers:{"content-type":"application/json","cache-control":"no-store",...(origin?{"access-control-allow-origin":origin,vary:"Origin"}:{})}});
Deno.serve(async request=>{
  const url=Deno.env.get("SUPABASE_URL")??"",anon=Deno.env.get("SUPABASE_ANON_KEY")??"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  const secret=Deno.env.get("TEST_ONLY_STRIPE_SECRET_KEY")??"",account=Deno.env.get("TEST_ONLY_STRIPE_ACCOUNT_ID")??"";
  if(Deno.env.get("TEST_ONLY_STRIPE_CHECKOUT_ENABLED")!=="true"||!secret.startsWith("sk_test_")||secret.includes("live")||!account.startsWith("acct_"))return reply(503,"TEST_ONLY_CHECKOUT_DISABLED");
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});let binding;
  try{binding=await requireProjectBinding(service,{backendUrl:url,projectRef:Deno.env.get("TEST_ONLY_STRIPE_PROJECT_REF"),issuer:Deno.env.get("WUXUAI_AUTH_ISSUER"),appOrigin:Deno.env.get("WUXUAI_APP_ORIGIN"),deploymentId:Deno.env.get("DENO_DEPLOYMENT_ID")});}
  catch{return reply(503,"PROJECT_BINDING_REQUIRED");}
  if(request.method!=="POST"||request.headers.get("origin")!==binding.app_origin)return reply(403,"TEST_ONLY_CHECKOUT_ORIGIN_DENIED");
  const authorization=request.headers.get("authorization")??"";if(!authorization.startsWith("Bearer "))return reply(401,"AUTH_REQUIRED",undefined,binding.app_origin);
  const user=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  try{await requireProjectSession(user);}catch{return reply(403,"PROJECT_SESSION_REQUIRED",undefined,binding.app_origin);}
  try{
    const input=parseTestOnlyCheckoutRequest(await request.json());
    const {data:prepared,error}=await user.rpc("prepare_test_only_stripe_checkout",{input_restaurant_id:input.restaurant_id,input_request_id:input.request_id,input_return_route:input.return_route});
    if(error||!prepared)throw Error(error?.message??"TEST_ONLY_CHECKOUT_PREPARE_FAILED");
    const accountReadback=await fetch("https://api.stripe.com/v1/account",{headers:{authorization:`Bearer ${secret}`}});
    if(!accountReadback.ok)throw Error("TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED");
    verifyStripeTestAccount(await accountReadback.json(),account);
    const provider=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/x-www-form-urlencoded","idempotency-key":`wuxuai-test-only-${prepared.id}`},body:buildTestOnlyCheckoutForm(prepared,binding.app_origin)});
    if(!provider.ok)throw Error("TEST_ONLY_CHECKOUT_PROVIDER_FAILED");
    const verified=verifyTestOnlyCheckoutSession(await provider.json(),prepared,account);
    const {error:bindError}=await service.rpc("bind_test_only_stripe_checkout_session",{input_checkout_request_id:prepared.id,input_provider_account_id:account,input_provider_session_id:verified.session_id,input_price_id:prepared.price_id,input_livemode:false});
    if(bindError)throw Error("TEST_ONLY_CHECKOUT_BIND_FAILED");
    return reply(200,"TEST_ONLY_CHECKOUT_SESSION_CREATED",{url:verified.url,request_id:input.request_id},binding.app_origin);
  }catch(error){return reply(409,error instanceof Error?error.message:"TEST_ONLY_CHECKOUT_FAILED",undefined,binding.app_origin);}
});
