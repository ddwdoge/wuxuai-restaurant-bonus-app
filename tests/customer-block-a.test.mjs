import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";
import { customerPresentationText } from "../src/modules/customer/customerRewardPresentation.mjs";
import { createImageCardPointerGuard } from "../src/modules/customer/components/imageCardPointerGuard.mjs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
function components(language) {
  function load(id) {
    if (id.endsWith(".css")) return {};
    if (id.endsWith("/I18nProvider")) return { useI18n: () => ({ language, translateKey: k => translateStructural(k, language) }) };
    if (id.endsWith("/catalog.mjs")) return { translateStructural };
    if (id.endsWith("/customerRewardPresentation.mjs")) return { customerPresentationText };
    if (id.endsWith("/ui")) return { UiCard: ({ children, variant: _v, ...p }) => React.createElement("article",p,children), UiButton: ({ children, variant: _v, ...p }) => React.createElement("button",p,children) };
    if (id.endsWith("/RewardImageFrame")) return { RewardImageFrame: p => React.createElement("img", { src:p.imageUrl, alt:p.alt, loading:p.loading }) };
    if (id.endsWith("/SmartMediaFrame")) return { SmartMediaFrame: p => React.createElement("img", { src:p.imageUrl, alt:p.alt, loading:p.loading }) };
    if (id.endsWith("/mediaPresentation")) return { mediaPresentationFromRecord: () => ({}) };
    if (id.endsWith("/restaurantOfferService")) return { restaurantOfferValidityPresentation: () => ({label:"Verfügbar",tone:"active"}), restaurantOfferPricePresentation: () => ({}), formatRestaurantOfferSchedule: () => "", formatRestaurantOfferPeriod: () => "", restaurantOfferTypeLabels:{NEWS:"Aktuelles"} };
    if (/\/(AppDrawer|LanguageSelector|RestaurantLogoStage|InfoTrigger)$/.test(id)) return {};
    return require(id);
  }
  function compile(path) { const exports={}; const js=ts.transpileModule(read(path),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; new Function("require","exports",js)(load,exports); return exports; }
  return {...compile("src/modules/customer/components/PremiumCustomerUi.tsx"),...compile("src/modules/customer/components/RestaurantOfferCard.tsx")};
}
for (const language of ["de","en","fr","it","es","zh","ko"]) {
  for (const state of ["available","locked"]) test(`${language}: ${state} reward has one detail target, original title, no-image state`,()=>{
    const {RewardCard}=components(language); const title="Individuelles Hausgeschenk – Edition 2026";
    const html=renderToStaticMarkup(React.createElement(RewardCard,{imageFirst:true,state,title,category:"Kategorie",meta:"250",status:"Status",onOpen(){}}));
    assert.equal((html.match(/<button\b/g)||[]).length,1);
    assert.match(html,/customer-image-first-action/);
    assert.ok(html.includes(title)); assert.ok(html.includes(customerPresentationText("details",language)));
    assert.match(html,/<h3 data-i18n-skip="true">/);
    assert.ok(html.includes(customerPresentationText("placeholder",language,{title})));
    assert.doesNotMatch(html,/Einlösen jetzt|startCustomer|<img/);
  });
  test(`${language}: offer card and detail preserve individual titles without changing the default`,()=>{
    const {RestaurantOfferCard,RestaurantOfferDetail}=components(language);
    const offer={id:"fixture-only",title:"Individuelles Menü",offer_type:"NEWS",button_label:"Ansehen",short_description:"Kurz",description:"Vollständige Beschreibung",image_url:null};
    const html=renderToStaticMarkup(React.createElement(RestaurantOfferCard,{offer,imageFirst:true,preserveTitle:true,onOpen(){}}));
    assert.equal((html.match(/<button\b/g)||[]).length,1); assert.match(html,/<h3 data-i18n-skip="true">Individuelles Menü/);
    assert.ok(html.includes(customerPresentationText("details",language)));
    const detail=renderToStaticMarkup(React.createElement(RestaurantOfferDetail,{offer,preserveTitle:true}));
    assert.match(detail,/<h2 data-i18n-skip="true">Individuelles Menü/); assert.match(detail,/Vollständige Beschreibung/); assert.doesNotMatch(detail,/<button/);
    const original=renderToStaticMarkup(React.createElement(RestaurantOfferCard,{offer,imageFirst:true,onOpen(){}}));
    assert.match(original,/<h3>Individuelles Menü/); assert.match(original,/Individuelles Menü: Ansehen/);
  });
}

test("Home including Boost remains byte-identical; overview alone opts in",()=>{
  const s=read("src/modules/customer/CustomerPortal.tsx");
  const home=s.slice(s.indexOf('{activeView === "home" ? ('),s.indexOf('{activeView === "redemptions" ? ('));
  assert.equal(createHash("sha256").update(home).digest("hex"),"05cef343b021cda498cb373d3e8b3d15c597098f09158d6f60f2c5ebf3047c98");
  assert.match(s,/premium-redemption-content customer-block-a/);
  const overview=s.slice(s.indexOf('{activeView === "redemptions" ? ('),s.indexOf('{activeView === "account" ? ('));
  assert.match(overview,/<RewardCard\s+imageFirst/); assert.match(overview,/onOpen=\{\(\) => openRewardRedemption\(reward\)\}/);
  assert.match(overview,/rewardStatusText\(reward, state, language\)/); assert.match(overview,/<EmptyState/);
});
test("offers reuse one existing carousel and retain both event boundaries",()=>{
  const s=read("src/modules/customer/CustomerOffersPage.tsx");
  assert.equal((s.match(/<PremiumHorizontalCarousel\b/g)||[]).length,1);
  assert.doesNotMatch(s,/className="customer-offer-grid"/);
  assert.match(s,/<RestaurantOfferCard imageFirst preserveTitle/);
  assert.match(s,/recordRestaurantOfferEvent\(offer.id, "OFFER_VIEWED"\)/);
  assert.match(s,/recordRestaurantOfferEvent\(offer.id, "OFFER_CTA_CLICKED"\)/);
  assert.match(s,/<EmptyState/); assert.match(s,/<RestaurantOfferDetail preserveTitle/);
});
for(const kind of ["tap","pan","scroll","cancel","keyboard"]) test(`Block A existing gesture guard: ${kind}`,()=>{
  const guard=createImageCardPointerGuard(); let prevented=false;
  const target={closest:()=>target}; const viewport={closest:s=>s===".customer-block-a"?viewport:null,scrollLeft:0};
  const event={target,currentTarget:viewport,pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100};
  guard.onPointerDownCapture(event);
  if(kind==="pan"||kind==="keyboard") guard.onPointerMoveCapture({...event,clientX:50});
  if(kind==="scroll") viewport.scrollLeft=30;
  if(kind==="cancel") guard.onPointerCancelCapture();
  guard.onClickCapture({...event,detail:kind==="keyboard"?0:1,preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(prevented,["pan","scroll","cancel"].includes(kind));
});
test("CSS scope cannot change Home or operational QR/PIN; full hit area and non-clamped titles",()=>{
  const css=read("src/modules/customer/customer-block-a.css");
  assert.doesNotMatch(css,/\.customer-home-compact|\.premium-boost|\.premium-customer-header|QRCode|daily.?pin|\bzoom\s*:/i);
  assert.match(css,/aspect-ratio: 3 \/ 2/); assert.match(css,/height: 100%;[\s\S]*inset: 0/);
  assert.match(css,/display: block;\s+overflow: visible;\s+overflow-wrap: anywhere/);
  assert.match(css,/:has\(\.premium-reward-detail\) \{ height: auto;/);
});
