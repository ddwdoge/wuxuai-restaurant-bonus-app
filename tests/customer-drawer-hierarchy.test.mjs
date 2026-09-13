import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { customerPresentationText, customerRewardDescription } from "../src/modules/customer/customerRewardPresentation.mjs";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";
import { UI_LOCALE_TAGS, normalizeUiLanguage } from "../src/shared/i18n/language.mjs";
import * as offerRules from "../src/modules/offers/restaurantOffers.mjs";

const require = createRequire(import.meta.url);
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const portal = read("src/modules/customer/CustomerPortal.tsx");
const locales = ["de", "en", "fr", "it", "es", "zh", "ko"];
const title = "  Individuelles Hausmenü & Spezial  ";
const description = "  Unser Originaltext: Zahlung im Restaurant.\nNicht automatisch übersetzen.  ";
const offer = { id:"unit-only", title, description, short_description:description, restaurant_name:"Unit restaurant", offer_type:"WEEKLY_OFFER", valid_from:"2026-09-01T00:00:00Z", valid_to:"2026-09-30T22:00:00Z", weekdays:[], time_from:null, time_to:null, current_price:9.9, previous_price:14.4, image_url:null };

function compile(source, load) {
 const exports = {};
 const js = ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function("require","exports",js)(load,exports);
 return exports;
}
function components(language) {
 const modules = {};
 const load = id => {
  if(id.endsWith(".css")) return {};
  if(id.endsWith("/I18nProvider")) return {useI18n:()=>({language})};
  if(id.endsWith("/customerRewardPresentation.mjs")) return {customerPresentationText};
  if(id.endsWith("/language.mjs")) return {UI_LOCALE_TAGS,normalizeUiLanguage};
  if(id.endsWith("/restaurantOffers.mjs")) return offerRules;
  if(id.endsWith("/supabase")) return {supabase:null};
  if(id.endsWith("/SmartMediaFrame")) return {SmartMediaFrame:p=>React.createElement("img",{alt:p.alt,src:p.imageUrl})};
  if(id.endsWith("/mediaPresentation")) return {mediaPresentationFromRecord:()=>({})};
  if(id.endsWith("/restaurantOfferService")) return modules.service ??= compile(read("src/modules/offers/restaurantOfferService.ts"),load);
  if(id.endsWith("/customerOfferPresentation")) return modules.presentation ??= compile(read("src/modules/customer/customerOfferPresentation.ts"),load);
  return require(id);
 };
 return { ...compile(read("src/modules/customer/components/RestaurantOfferCard.tsx"),load), presentation:load("/customerOfferPresentation"), service:load("/restaurantOfferService") };
}
const htmlText = html => html.replace(/<[^>]*>/g, "").replaceAll("&amp;","&");

for(const language of locales) {
 test(`${language}: customer paid-offer drawer localizes only system text including image alt`,()=>{
  const {RestaurantOfferDetail}=components(language);
  const html=renderToStaticMarkup(React.createElement(RestaurantOfferDetail,{offer:{...offer,image_url:"https://example.invalid/unit.jpg"},preserveTitle:true}));
  const text=htmlText(html);
  assert.ok(text.includes(title)); assert.ok(text.includes(description));
  assert.match(html,/<p data-i18n-skip="true">/);
  assert.match(html,/<h2 data-i18n-skip="true">/);
  for(const key of ["offerType.WEEKLY_OFFER","offerValidity","offerResponsibility"]) assert.ok(text.includes(customerPresentationText(key,language)));
  assert.ok(html.includes(customerPresentationText("offerImage",language,{title}).replaceAll("&","&amp;")));
  assert.match(text,/-31%/); assert.match(text,/9,90/); assert.match(text,/14,40/);
  if(language!=="de") assert.doesNotMatch(text,/Wochenangebot|Gültigkeit:|Angaben zu Preis|Jetzt gültig/);
 });
 test(`${language}: every offer state, type and weekday is localized without changing validity`,()=>{
  const {presentation,service}=components(language);
  for(const [state,now,extra] of [
   ["CURRENT","2026-09-14T10:00:00Z",{}],
   ["UPCOMING","2026-08-01T10:00:00Z",{}],
   ["EXPIRED","2026-10-01T10:00:00Z",{}],
   ["LATER_TODAY","2026-09-14T07:00:00Z",{time_from:"12:00",time_to:"14:00",weekdays:[1,2,3,4,5]}],
   ["NOT_CURRENT","2026-09-14T16:00:00Z",{time_from:"12:00",time_to:"14:00",weekdays:[1,2,3,4,5]}]
  ]) {
   const input=Object.freeze({...offer,...extra});
   const validity=service.restaurantOfferValidityPresentation(input,new Date(now));
   assert.equal(validity.state,state);
   const text=presentation.customerOfferPresentation(input,language,validity);
   assert.ok(text.status); assert.ok(text.period); assert.ok(text.schedule);
   if(language!=="de") assert.doesNotMatch(text.status+text.schedule,/Heute|Gültig ab|gültig|Abgelaufen|Während|Uhr|Täglich|Mo–Fr/);
  }
  for(const kind of Object.keys(offerRules.OFFER_TYPE_PRIORITY)) assert.ok(CUSTOMER_PRESENTATION_MESSAGES[language][`customer.presentation.offerType.${kind}`]);
  for(const key of ["offerTitle","offerDescription","offerImage","offerValidity","offerResponsibility","balanceLabel","giftContents","noPointsNeeded"]) assert.ok(CUSTOMER_PRESENTATION_MESSAGES[language][`customer.presentation.${key}`]);
  const page=read("src/modules/customer/CustomerOffersPage.tsx");
  assert.match(page,/closeLabel=\{ct\("close"\)\}/);
  assert.match(page,/title=\{ct\("offerTitle"\)\}/);
  assert.match(page,/description=\{ct\("offerDescription"\)\}/);
  if(language!=="en") assert.notEqual(customerPresentationText("close",language),"Close view");
 });
 test(`${language}: system economic description is hidden only in points-reward presentation`,()=>{
  const description="Produktwert: € 18. Einlösequote: 7 %. Geschätzte Konsumation: € 257,14.";
  const reward=Object.freeze({source:"reward",reward_type:"reward",is_starter_reward:false,description});
  assert.equal(customerRewardDescription(reward,language),"");
  assert.equal(reward.description,description);
  for(const original of ["Meine Beschreibung",description+" Individueller Zusatz.","  Persönlicher Text mit 10 % Rabatt.  "])
   assert.equal(customerRewardDescription({...reward,description:original},language),original);
  assert.equal(customerRewardDescription({...reward,is_starter_reward:true},language),description);
  assert.equal(customerRewardDescription({...reward,source:"coupon",reward_type:"coupon"},language),description);
 });
}

test("Customer gift summaries never derive euro values; individual products stay byte-identical",()=>{
 const source=portal.slice(portal.indexOf("function welcomeGiftDetail("),portal.indexOf("const rewardAssets:"));
 const {summary}=compile(source+"\nexport const summary=welcomeGiftDetail;",require);
 assert.doesNotMatch(source,/formatEuro|reward.product_price/);
 assert.equal(summary({product_price:50,welcome_gift_mode:"value_limit"}),null);
 assert.equal(summary({product_price:50,welcome_gift_mode:"fixed_product",fixed_product_name:"  Hausdessert  "}),"  Hausdessert  ");
 assert.equal(summary({product_price:50,available_products:["Tee","Saft"]}),"Tee, Saft");
});
test("actual Customer reward facts show required and owned points, not economic values",()=>{
 const jsx=portal.match(/<dl className="premium-reward-facts">[\s\S]*?<\/dl>/)?.[0];
 assert.ok(jsx); assert.doesNotMatch(jsx,/valueLabel|product_price|redemption_rate|estimatedConsumption|formatEuro/);
 const {Facts}=compile(`export function Facts({ct,redeemOffer,present,customer,language,welcomeGiftDetail}) {return (${jsx});}`,require);
 for(const language of locales){
  const ct=(k,p)=>customerPresentationText(k,language,p);
  const html=renderToStaticMarkup(React.createElement(Facts,{ct,language,redeemOffer:{is_starter_reward:false,required_points:257,product_price:18},customer:{points_balance:12},present:()=>({}),welcomeGiftDetail:()=>null}));
  assert.ok(html.includes(ct("points",{count:257}))); assert.ok(html.includes(ct("points",{count:12})));
  assert.doesNotMatch(html,/€|18|%/);
 }
});
test("Owner economic inputs, persistence, paid offer price calculations and protected UI remain unchanged",()=>{
 const owner=read("src/modules/admin/pages/RewardsPage.tsx");
 for(const expected of ['product_price: productPrice','Einlösequote','calculation.estimatedConsumption','Produktwert: ${formatEuro(productPrice)}']) assert.ok(owner.includes(expected));
 assert.doesNotMatch(owner,/customerRewardDescription|customerOfferPresentation/);
 const home=portal.slice(portal.indexOf('{activeView === "home" ? ('),portal.indexOf('{activeView === "redemptions" ? ('));
 assert.equal(createHash("sha256").update(home).digest("hex"),"05cef343b021cda498cb373d3e8b3d15c597098f09158d6f60f2c5ebf3047c98");
 assert.match(portal,/footer=\{redemptionDrawerFooter\}/);
 assert.match(portal,/onClose=\{closeRedemptionDrawer\}/);
 assert.match(portal,/onOpen=\{\(\) => openRewardRedemption\(reward\)\}/);
});
test("Block A selection and keyboard rings live inside the card, with semantic active position",()=>{
 const css=read("src/modules/customer/customer-block-a.css");
 const carousel=read("src/modules/customer/components/PremiumHorizontalCarousel.tsx");
 assert.match(css,/box-shadow: inset 0 0 0 2px/);
 assert.match(css,/inset: 0;[\s\S]*pointer-events: none/);
 assert.match(css,/focus-within::after/);
 assert.match(css,/border-radius: inherit/);
 assert.doesNotMatch(css,/outline-offset: 2px/);
 assert.match(carousel,/aria-current=\{index === activeIndex \? "true" : undefined\}/);
 assert.match(carousel,/data-carousel-active=\{index === activeIndex \? "true" : undefined\}/);
});
