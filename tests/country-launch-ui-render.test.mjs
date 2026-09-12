import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COUNTRY_LAUNCH_MESSAGES } from '../src/shared/i18n/countryLaunchMessages.mjs';
import * as countries from '../src/shared/countries.mjs';
import * as readiness from '../src/modules/platform/countryLaunchReadiness.mjs';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/modules/platform/PlatformCountryLaunchPanel.tsx',import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const fixtures=['AT','DE','CH','FR','IT','ES'].map(country_code=>({country_code,enabled:country_code==='AT',currency_code:country_code==='CH'?'CHF':'EUR',market_status:'prepared',activated_at:null,readiness:{ready:false,checks:readiness.COUNTRY_READINESS_KEYS.map(key=>({key,status:'not_configured',document_version_refs:[]}))}}));
function render(language,{audit=[],role='platform_admin',target=null}={}) {
  const states=[fixtures,audit,'',false,target,'','']; let index=0;
  const exports={};
  const load = id => {
    if(id==='react') return {...React,useState:()=>[states[index++],()=>{}],useEffect:()=>{},useCallback:fn=>fn,useRef:value=>({current:value})};
    if(id.endsWith('/supabase')) return {supabase:{rpc:()=>{throw Error('Unexpected server call during render');}}};
    if(id.endsWith('/countries.mjs')) return countries;
    if(id.endsWith('/I18nProvider')) return {useI18n:()=>({language,translateKey:key=>COUNTRY_LAUNCH_MESSAGES[language][key]??key})};
    if(id.endsWith('/AppDrawer')) return {AppDrawer:({open,children,title})=>open?React.createElement('section',{'role':'dialog','aria-label':title},children):null};
    if(id.endsWith('/countryLaunchReadiness.mjs')) return readiness;
    return require(id);
  };
  new Function('require','exports',compiled)(load,exports);
  return renderToStaticMarkup(exports.PlatformCountryLaunchPanel({role}));
}
for(const language of ['de','en','fr','it','es','zh','ko']) test(`Country real component renders safe complete ${language} overview`,()=> {
  const html=render(language); const copy=COUNTRY_LAUNCH_MESSAGES[language];
  assert.equal((html.match(/class="country-launch-card"/g)||[]).length,6);
  assert.match(html,/class="country-launch-section"[^>]*data-i18n-skip="true"/);
  assert.equal((html.match(/<dt>Stripe<\/dt>/g)||[]).length,6);
  assert.equal((html.match(/data-readiness="not_configured"/g)||[]).length,48);
  assert.equal((html.match(/disabled=""/g)||[]).length,6);
  assert.equal((html.match(/>EUR</g)||[]).length,5); assert.equal((html.match(/>CHF</g)||[]).length,1);
  for(const code of ['AT','DE','CH','FR','IT','ES']) assert.ok(html.includes(countries.countryNameForCode(code,language)));
  assert.ok(html.includes(copy['platform.country.no_history']));
  assert.ok(html.includes(copy['platform.country.market_prepared']));
  assert.doesNotMatch(html,/platform\.country\./);
  if(['zh','ko'].includes(language)) assert.doesNotMatch(html,/Spanien|Frankreich/);
});
test('Country real component renders before/after, actor, reason and localized timestamp',()=> {
  const html=render('de',{audit:[{id:'synthetic-audit',country_code:'DE',actor_id:'synthetic-operator',created_at:'2026-09-11T12:00:00Z',reason:'Synthetic review evidence',before_state:{enabled:false},after_state:{enabled:true,market_status:'live'}}]});
  for(const value of ['synthetic-operator','Synthetic review evidence','Vorher','Nachher','Aktivierung']) assert.ok(html.includes(value),value);
  assert.match(html,/datetime="2026-09-11T12:00:00Z"/i);
});
test('Country real component offers no controls to a read-only platform role',()=> {
  const html=render('de',{role:'platform_support'});
  assert.doesNotMatch(html,/country-blocked-AT" type=|Neue Registrierungen freigeben<|Neue Registrierungen sperren</);
});
test('Country confirmation remains disabled even if frontend target were forged',()=> {
  const html=render('de',{target:{country:fixtures[1],enabled:true}});
  assert.match(html,/<button class="button" type="submit" disabled="">/);
});
