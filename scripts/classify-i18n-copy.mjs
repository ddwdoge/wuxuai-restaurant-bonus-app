import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.cwd(), "src");
const reportPath = resolve(process.cwd(), "docs/reports/2026-09-06_I18N_TRANSLATION_DATA_CLASSIFICATION.json");
const approvedPath = "/private/tmp/wuxuai-approved-static-ui-copy.json";
const visibleAttributes = new Set(["aria-label", "aria-description", "alt", "description", "label", "placeholder", "title"]);

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function namespaceFor(file) {
  const path = relative(root, file).split("/");
  const module = path[0] === "modules" ? path[1] : path[0];
  return ({ admin: "owner", reports: "owner", public: "common", campaigns: "common", shared: "common" })[module] ?? module;
}

function stableKey(namespace, source) {
  return `${namespace}.auto_${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

function classificationFor(source) {
  if (source === "z. B. Café am Markt" || source === "z. B. Muster Gastro GmbH") return "PERSON_OR_RESTAURANT_EXAMPLE";
  if (/https?:\/\/|www\./i.test(source)) return "URL_OR_ENDPOINT";
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(source)) return "EMAIL_ADDRESS";
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(source)) return "UUID";
  if (/\b(?:eyJ|sk_|pk_|sbp_|cf_)[A-Za-z0-9._-]{8,}\b/.test(source)) return "TOKEN_OR_KEY_SHAPE";
  if (/\b(?:\+?[0-9][0-9 ()/.-]{7,}[0-9])\b/.test(source)) return "PHONE_OR_LONG_NUMBER";
  if (/\b(?:z\.\s?B\.|zum Beispiel)\b/i.test(source) && /(?:café|gmbh|telefon|straße|name|mail)/i.test(source)) return "PERSON_OR_RESTAURANT_EXAMPLE";
  if (/^(?:[A-Z][A-Z0-9_./:-]*|[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)$/.test(source)) return "TECHNICAL_IDENTIFIER";
  if (/(?:Rechtsberatung|Rechtstext|rechtlich\p{L}*|Datenschutz\p{L}*|Teilnahmebeding\p{L}*|Impressum|Einwillig\p{L}*|Zustimm\p{L}*|Haftung|Vertrag\p{L}*|Kündig\p{L}*|Programmende|Beschwerde\p{L}*|Unternehmensdaten|Geschäftsanschrift|Firmenbuch|UID|DSGVO)/iu.test(source)) return "LEGAL_OR_CONTRACT_COPY";
  return "STATIC_UI_COPY";
}

const bySource = new Map();
for (const file of filesIn(root)) {
  const sourceText = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const add = (node, raw) => {
    const text = normalize(raw);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    const location = relative(process.cwd(), file);
    const existing = bySource.get(text);
    if (existing) {
      if (!existing.files.includes(location)) existing.files.push(location);
      return;
    }
    const classification = classificationFor(text);
    bySource.set(text, {
      key: stableKey(namespaceFor(file), text),
      source: text,
      classification,
      files: [location],
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  };
  function visit(node) {
    if (ts.isJsxText(node)) add(node, node.text);
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      add(node, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const messages = [...bySource.values()].map((message) => ({
  ...message,
  classification: message.files.some((file) => file.startsWith("src/modules/legal/"))
    ? "LEGAL_MODULE"
    : message.classification,
})).sort((a, b) => a.key.localeCompare(b.key));
const approved = messages.filter(({ classification }) => classification === "STATIC_UI_COPY");
const excluded = messages.filter(({ classification }) => classification !== "STATIC_UI_COPY");
mkdirSync(resolve(process.cwd(), "docs/reports"), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  policy: "Only the explicit STATIC_UI_COPY list may be sent for first-pass machine translation. Runtime values and legal document bodies are outside this source-only inventory.",
  counts: { total: messages.length, static_ui_copy: approved.length, not_allowed: excluded.length },
  excluded,
  approved,
}, null, 2)}\n`);
writeFileSync(approvedPath, `${JSON.stringify(approved.map(({ key, source }) => ({ key, source })), null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ total: messages.length, approved: approved.length, excluded: excluded.length, reportPath, approvedPath })}\n`);
