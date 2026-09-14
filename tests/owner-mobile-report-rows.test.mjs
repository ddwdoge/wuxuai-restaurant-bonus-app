import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import { GENERATED_MESSAGES as messages, GENERATED_SOURCE_TO_KEY as keys } from "../src/shared/i18n/messages.generated.mjs";

const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const page=read("src/modules/reports/BonusActivityReportsPage.tsx");
const css=read("src/modules/reports/bonus-activity-reports.css");
const labels=["Datum","Zeit","Belohnung","Typ","Punkte","Referenzwert","Status","Aktion"];
const start=page.indexOf("function ReportCell");
const source=page.slice(start,page.indexOf("const periodOptions",start));
const exports={};
new Function("require","exports",ts.transpileModule(`export ${source}`,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText)(createRequire(import.meta.url),exports);

test("mobile Zellen zeigen denselben Wert und genau dieselbe explizite Aktion",()=>{
  const html=renderToStaticMarkup(React.createElement("table",null,React.createElement("tbody",null,React.createElement("tr",null,
    React.createElement(exports.ReportCell,{label:"Belohnung"},"Individueller Restauranttitel — unverändert"),
    React.createElement(exports.ReportCell,{label:"Aktion"},React.createElement("button",{type:"button",disabled:true},"Fixture"))))));
  assert.match(html,/role="cell"/);
  assert.match(html,/aria-hidden="true" class="bonus-report-cell-label"/);
  assert.ok(html.includes("Individueller Restauranttitel — unverändert"));
  assert.equal((html.match(/<button/g)??[]).length,1);
  assert.match(html,/disabled=""/);
});

test("ein gemeinsamer Datensatz pro Tabelle, Tabellenrollen und Spaltenüberschriften bleiben",()=>{
  assert.equal((page.match(/kassa\.rows\.map/g)??[]).length,1);
  assert.equal((page.match(/report\.rows\.map/g)??[]).length,1);
  assert.equal((page.match(/<table role="table">/g)??[]).length,2);
  assert.equal((page.match(/scope="col"/g)??[]).length,12);
  for(const label of labels) assert.ok(page.includes(`<ReportCell label="${label}">`));
  assert.match(page,/row\.status === "RECORDED" && restaurantRole === "owner"/);
  assert.match(page,/disabled=\{kassaBusy === row\.id\}/);
  assert.match(page,/onClick=\{\(\) => setCancelTarget\(row\)\}/);
});

test("mobil keine verkleinerte 850px-Tabelle; Desktop und Druck behalten Tabelle",()=>{
  const root=postcss.parse(css);
  let mobile;
  root.walkAtRules("media",a=>{if(a.params==="screen and (max-width: 767px)")mobile=a;});
  assert.ok(mobile);
  assert.match(mobile.toString(),/table \{ display: block; min-width: 0;/);
  assert.match(mobile.toString(),/min-height: 48px/);
  assert.match(mobile.toString(),/repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css,/\.bonus-report-table-wrap table \{ width: 100%; min-width: 850px;/);
  assert.doesNotMatch(mobile.toString(),/zoom:|scale\(/);
  assert.match(css,/\.bonus-report-cell-label \{ display: none;/);
});

for(const lang of ["de","en","fr","it","es","zh","ko"])test(`${lang}: mobile Feldbeschriftungen verwenden vorhandene Übersetzungen`,()=>{
  for(const label of labels){
    assert.ok(messages[lang][keys[label]]);
    if(lang!=="de")assert.notEqual(messages[lang][keys[label]],label);
  }
});
