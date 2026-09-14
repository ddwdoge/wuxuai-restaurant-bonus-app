import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const page = readFileSync(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const compile = source => {
  const exports = {};
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText)(createRequire(import.meta.url), exports);
  return exports;
};
const save = page.slice(page.indexOf("  async function savePartnerLocation"), page.indexOf("  function updatePartnerAddress"));
const update = page.slice(page.indexOf("  function updatePartnerAddress"), page.indexOf("  async function findPartnerLocation"));
const make = compile(`export function make(c) {
 const {details,partnerLocation,verifiedLocationKey,ownerLocationAddressKey,isIsoAlpha2CountryCode,setErrorMessage,setStatus,setMapConfirmationGuidance,requestAnimationFrame,mapActionRef,mapGuidanceRef,setSaving,supabase,coverImagePersistenceFields,smartSetup,geocodingRequestRef,setPartnerLocation,setVerifiedLocationKey,setGeocodingCandidates,setGeocodingStatus}=c;
 ${save} ${update}
 return {savePartnerLocation,updatePartnerAddress,applyGeocodingCandidate};
}`).make;

function fixture({ verified=true, latitude="48.2", disabled=false }={}) {
  const calls={writes:0,focus:0,hintFocus:0,flags:[],status:[],errors:[],saved:null};
  const location={id:"fixture-location",address:"Fixture street",postalCode:"1010",city:"Fixture city",country:"AT",latitude,longitude:"16.3",isDiscoverable:false,shortDescription:"",coverImageUrl:""};
  const chain={update(value){calls.writes++;calls.saved=value;return this;},eq(){return this;},then(resolve){resolve({error:null});}};
  const c={details:{id:"fixture-restaurant",status:"active"},partnerLocation:location,verifiedLocationKey:verified?"verified":"stale",ownerLocationAddressKey:()=>"verified",isIsoAlpha2CountryCode:c=>c==="AT",setErrorMessage:v=>calls.errors.push(v),setStatus:v=>calls.status.push(v),setMapConfirmationGuidance:v=>calls.flags.push(v),requestAnimationFrame:f=>f(),mapActionRef:{current:{disabled,focus(){calls.focus++;}}},mapGuidanceRef:{current:{focus(){calls.hintFocus++;}}},setSaving(){},supabase:{from(table){assert.equal(table,"branches");return chain;}},coverImagePersistenceFields:()=>({}),smartSetup:{complete(){}},geocodingRequestRef:{current:0},setPartnerLocation:v=>{calls.next=typeof v==="function"?v(location):v;},setVerifiedLocationKey:v=>{calls.key=v;},setGeocodingCandidates(){},setGeocodingStatus:v=>{calls.geocoding=v;}};
  return {calls,actions:make(c),c};
}

test("unbestätigte Adresse zeigt Inline-Hilfe, fokussiert Kartenaktion und schreibt nichts", async()=>{
  const {calls,actions}=fixture({verified:false});
  await actions.savePartnerLocation({preventDefault(){}});
  assert.equal(calls.writes,0); assert.deepEqual(calls.flags,[true]); assert.equal(calls.focus,1);
  assert.deepEqual(calls.errors,[null]);
});
test("fehlende Koordinaten und laufende Suche: erreichbarer Hinweis statt Fokus auf disabled Button",async()=>{
  const {calls,actions}=fixture({latitude:"",disabled:true});
  await actions.savePartnerLocation({preventDefault(){}});
  assert.equal(calls.writes,0); assert.equal(calls.focus,0); assert.equal(calls.hintFocus,1);
});
test("bestätigte Adresse verwendet unverändert den bestehenden Save-Payload",async()=>{
  const {calls,actions}=fixture();
  await actions.savePartnerLocation({preventDefault(){}});
  assert.equal(calls.writes,1); assert.deepEqual(calls.flags,[]);
  assert.deepEqual(calls.saved,{address:"Fixture street",postal_code:"1010",city:"Fixture city",country:"AT",latitude:48.2,longitude:16.3,is_discoverable:false,public_short_description:null});
});
test("Adressänderung und Kartenbestätigung behalten den bestehenden Invalidierungsvertrag",()=>{
  const {calls,actions,c}=fixture();
  actions.updatePartnerAddress("city","New fixture city");
  assert.equal(calls.next.latitude,""); assert.equal(calls.next.longitude,""); assert.equal(calls.key,null); assert.equal(c.geocodingRequestRef.current,1); assert.equal(calls.geocoding,"stale");
  actions.applyGeocodingCandidate({address:"Fixture street",postalCode:"1010",city:"New fixture city",country:"AT",latitude:48.2,longitude:16.3});
  assert.equal(calls.key,"verified"); assert.equal(calls.geocoding,"found"); assert.equal(calls.flags.at(-1),false);
  assert.equal(calls.writes,0);
});

const hint = page.match(/\{mapConfirmationGuidance \? (<p className="status-message error settings-location-guidance"[\s\S]*?<\/p>) : null\}/)[1];
const Hint=compile(`export function Hint({translatedText}) { const mapGuidanceRef=null; const translateKey=()=>translatedText;return (${hint}); }`).Hint;
for(const lang of ["de","en","fr","it","es","zh","ko"]) test(`${lang}: lokalisierter Inline-Hinweis mit Fokus- und ARIA-Zuordnung`,()=>{
  const text=translateStructural("owner.location.confirmMapFirst",lang);
  assert.notEqual(text,"owner.location.confirmMapFirst");
  if(lang==="de")assert.equal(text,"Bitte zeige die eingegebene Adresse zuerst auf der Karte an.");
  else assert.notEqual(text,translateStructural("owner.location.confirmMapFirst","de"));
  const html=renderToStaticMarkup(React.createElement(Hint,{translatedText:text}));
  assert.match(html,/role="alert"/);assert.match(html,/tabindex="-1"/);assert.match(html,/id="location-map-guidance"/);
  assert.ok(html.includes(text));
  assert.match(page,/aria-describedby=\{mapConfirmationGuidance \? "location-map-guidance" : undefined\}/);
});
