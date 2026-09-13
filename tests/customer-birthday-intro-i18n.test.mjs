import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {customerRewardDescription} from "../src/modules/customer/customerRewardPresentation.mjs";
import {CUSTOMER_PRESENTATION_MESSAGES} from "../src/shared/i18n/customerPresentationMessages.mjs";

const expected={
  "de": "Dein Geburtstagsgeschenk von diesem Restaurant.",
  "en": "Your birthday gift from this restaurant.",
  "fr": "Ton cadeau d’anniversaire offert par ce restaurant.",
  "it": "Il tuo regalo di compleanno da questo ristorante.",
  "es": "Tu regalo de cumpleaños de este restaurante.",
  "zh": "这家餐厅为你准备的生日礼物。",
  "ko": "이 매장에서 준비한 당신의 생일 선물입니다."
};
const reserved="Willkommensgeschenk für neue Gäste.";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const source=read("src/modules/customer/CustomerPortal.tsx");
const jsx=source.match(/\{redeemOffer.description \? <p data-i18n-skip="true">\{customerRewardDescription\(redeemOffer, language\)\}<\/p> : null\}/)?.[0];
assert.ok(jsx,"actual drawer must render the approved resolver");
const exports={};
const js=ts.transpileModule(`export function Intro({redeemOffer,language,customerRewardDescription}){return <>${jsx}</>;}`,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function("require","exports",js)(createRequire(import.meta.url),exports);
const render=(reward,language)=>renderToStaticMarkup(React.createElement(exports.Intro,{redeemOffer:reward,language,customerRewardDescription}));

for(const [language,text] of Object.entries(expected)){
 test(`${language}: reserved birthday description, including manual equal text and trim, is localized`,()=>{
  assert.equal(CUSTOMER_PRESENTATION_MESSAGES[language]["customer.presentation.birthdayIntro"],text);
  for(const description of [reserved,"  "+reserved+"\n", "\t"+reserved+" "]){
   const reward=Object.freeze({gift_type:"birthday",description});
   assert.equal(customerRewardDescription(reward,language),text);
   assert.equal(reward.description,description);
   assert.equal(render(reward,language),`<p data-i18n-skip="true">${text}</p>`);
  }
  assert.doesNotMatch(render({gift_type:"birthday",description:reserved},language),/Willkommensgeschenk für neue Gäste/);
 });
 test(`${language}: individual descriptions remain byte-identical, no substring/case/fuzzy substitution`,()=>{
  for(const description of ["  Hausdessert – nur für dich!\n",reserved+" Unabhängig von Punkteeinlösungen.","Mein "+reserved,reserved.toLowerCase(),reserved.slice(0,-1),"Willkommensgeschenk  für neue Gäste.","Bienvenue, unser Geburtstagsmenü!"]){
   assert.equal(customerRewardDescription({gift_type:"birthday",description},language),description);
   const html=render({gift_type:"birthday",description},language);
   assert.ok(html.includes(description));
   assert.match(html,/data-i18n-skip="true"/);
  }
 });
 test(`${language}: same text outside canonical birthday stays unchanged`,()=>{
  for(const gift_type of ["welcome","legacy","birthday gift","Birthday"," birthday",null,undefined]){
   const description="  "+reserved+"\n";
   assert.equal(customerRewardDescription({gift_type,category:"birthday gift",title:"Geburtstagsgeschenk",description},language),description);
  }
 });
}
test("empty descriptions stay empty; content is text rather than HTML",()=>{
 for(const description of [null,undefined,""]) assert.equal(render({gift_type:"birthday",description},"en"),"");
 assert.match(render({gift_type:"birthday",description:"<img src=x>"},"en"),/&lt;img src=x&gt;/);
});
test("presentation has no eligibility, deadline, RPC or mutation dependency",()=>{
 const s=read("src/modules/customer/customerRewardPresentation.mjs");
 const helper=s.slice(s.indexOf("export function customerRewardDescription"),s.indexOf("// Founder 2026-09-13:"));
 assert.doesNotMatch(helper,/supabase|fetch|Date|status|valid_from|valid_until|\.replace\(|\.toLowerCase\(/);
 for(const status of ["locked","unlocked","redemption_started","redeemed","expired"])
  assert.equal(customerRewardDescription({gift_type:"birthday",description:reserved,status},"en"),expected.en);
});
test("Owner/Admin never call the Customer description resolver; stored defaults remain",()=>{
 for(const folder of ["src/modules/admin","src/modules/platform","src/modules/onboarding"]){
  const root=new URL("../"+folder+"/",import.meta.url);
  for(const p of readdirSync(root,{recursive:true}).filter(p=>/\.(tsx?|mjs)$/.test(p)))
   assert.doesNotMatch(readFileSync(new URL(p,root),"utf8"),/customerRewardDescription|customer\.presentation\.birthdayIntro/);
 }
 assert.ok(read("src/modules/onboarding/pilotOnboardingService.ts").includes('description: "'+reserved+'"'));
 assert.ok(read("src/modules/admin/pages/WelcomeGiftsPage.tsx").includes('description: "'+reserved+' Unabhängig von Punkteeinlösungen."'));
});
