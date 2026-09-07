import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.cwd(), "src");
const firstReportPath = resolve(process.cwd(), "docs/reports/2026-09-06_I18N_TRANSLATION_DATA_CLASSIFICATION.json");
const reportPath = resolve(process.cwd(), "docs/reports/2026-09-06_I18N_SECOND_POSITIVE_LIST.json");
const approvedPath = "/private/tmp/wuxuai-second-approved-ui-copy.json";
const visibleAttributes = new Set(["aria-label", "aria-description", "alt", "description", "hint", "label", "placeholder", "title"]);
const uiProperty = /^(?:actionLabel|ariaLabel|badge|buttonLabel|caption|description|emptyDescription|emptyTitle|error|eyebrow|heading|help|hint|label|message|name|note|statusLabel|subtitle|summary|text|title|tooltip)$/i;
const uiCollection = /(?:actions|badges|cards|columns|copy|descriptions|errors|fields|items|labels|menu|messages|navigation|options|reasons|recommendations|sections|statuses|steps|tabs|titles)$/i;
const uiFunction = /(?:copy|description|display|error|format|heading|label|message|status|summary|text|title|tooltip)/i;
const uiCall = /^(?:alert|confirm|setError|setFeedback|setMessage|setNotice|setStatusMessage|setSuccess|setWarning|showToast|toast)$/i;
const placeholderPattern = /\{\{[^{}]+\}\}|\{[^{}]+\}|%(?:\d+\$)?[a-zA-Z]|<\/?[A-Za-z][^>]*>/g;
const legalPattern = /(?:\bAGB\b|\bAkzeptiert\b|Datenschutz\p{L}*|Dokumentversion\p{L}*|Geschäftsland|\bGültig(?:keit)?\b|Impressum|Kündig\p{L}*|\bLegal\b|Rechts\p{L}*|rechtlich\p{L}*|Teilnahmebeding\p{L}*|Vertrag\p{L}*|Zustimmung\p{L}*)/iu;
const legalClausePattern = /(?:hält keine Kundengelder|Verfügbarkeit und Einlösung richten sich|rechtliche Zulässigkeit|ersetzen keine individuelle Rechtsberatung|gesetzlich oder sicherheitsbedingt|rechtlich verbindlich)/iu;

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name)
      && !/\.d\.[cm]?[jt]s$/.test(entry.name)
      && !/messages\.generated\.mjs$/.test(entry.name)
      ? [path]
      : [];
  });
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function templateExpressions(value) {
  const segments = [];
  for (let start = value.indexOf("${"); start >= 0; start = value.indexOf("${", start + 2)) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    for (let index = start + 2; index < value.length; index += 1) {
      const character = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = "";
        continue;
      }
      if (character === "\"" || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) {
        segments.push(value.slice(start, index + 1));
        start = index;
        break;
      }
    }
  }
  return segments;
}

function placeholdersFor(value) {
  const templates = templateExpressions(value);
  const remaining = templates.reduce((source, segment) => source.replace(segment, ""), value);
  return [...new Set([...templates, ...(remaining.match(placeholderPattern) ?? [])])];
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function nodeName(node, source) {
  if (!node) return "";
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isStringLiteralLike(node)) return node.text;
  return node.getText(source);
}

function functionName(node, source) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
    if (ts.isVariableDeclaration(node.parent)) return nodeName(node.parent.name, source);
    if (ts.isPropertyAssignment(node.parent)) return nodeName(node.parent.name, source);
  }
  return "";
}

function renderedExpressions(node, source) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) value += `\${${span.expression.getText(source)}}${span.literal.text}`;
    return [value];
  }
  if (ts.isConditionalExpression(node)) return [...renderedExpressions(node.whenTrue, source), ...renderedExpressions(node.whenFalse, source)];
  if (ts.isParenthesizedExpression(node)) return renderedExpressions(node.expression, source);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = renderedExpressions(node.left, source);
    const right = renderedExpressions(node.right, source);
    if (left.length && right.length) return left.flatMap((a) => right.map((b) => `${a}${b}`));
    if (left.length) return left.map((value) => `${value}\${${node.right.getText(source)}}`);
    if (right.length) return right.map((value) => `\${${node.left.getText(source)}}${value}`);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((element) => renderedExpressions(element, source));
  return [];
}

const firstReport = JSON.parse(readFileSync(firstReportPath, "utf8"));
const firstApproved = new Set(firstReport.approved.map(({ source }) => normalize(source)));
const firstExcluded = new Set(firstReport.excluded.map(({ source }) => normalize(source)));
const candidates = new Map();

function stableKey(source) {
  return `recovery.auto_${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

for (const file of filesIn(root)) {
  const content = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
  const fileName = relative(process.cwd(), file);
  const add = (node, raw, evidence) => {
    const text = normalize(raw);
    if (!text || firstApproved.has(text) || !/[\p{L}\p{N}]/u.test(text)) return;
    const item = candidates.get(text) ?? { key: stableKey(text), source: text, evidence: [], files: [] };
    const occurrence = { file: fileName, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, evidence };
    if (!item.evidence.some((entry) => entry.file === occurrence.file && entry.line === occurrence.line && entry.evidence === occurrence.evidence)) item.evidence.push(occurrence);
    if (!item.files.includes(fileName)) item.files.push(fileName);
    candidates.set(text, item);
  };
  const addRendered = (node, evidence) => renderedExpressions(node, source).forEach((value) => add(node, value, evidence));

  function visit(node, currentFunction = "") {
    const nextFunction = ts.isFunctionLike(node) ? functionName(node, source) || currentFunction : currentFunction;
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) addRendered(node.expression, "JSX_EXPRESSION");
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(source)) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) addRendered(node.initializer.expression, `VISIBLE_ATTRIBUTE:${node.name.getText(source)}`);
    if (ts.isCallExpression(node) && uiCall.test(nodeName(node.expression, source))) node.arguments.forEach((argument) => addRendered(argument, `UI_CALL:${nodeName(node.expression, source)}`));
    if (ts.isPropertyAssignment(node) && uiProperty.test(nodeName(node.name, source))) addRendered(node.initializer, `UI_PROPERTY:${nodeName(node.name, source)}`);
    if (ts.isVariableDeclaration(node) && uiCollection.test(nodeName(node.name, source)) && node.initializer) addRendered(node.initializer, `UI_COLLECTION:${nodeName(node.name, source)}`);
    if (ts.isReturnStatement(node) && node.expression && uiFunction.test(nextFunction)) addRendered(node.expression, `UI_HELPER:${nextFunction}`);
    ts.forEachChild(node, (child) => visit(child, nextFunction));
  }
  visit(source);
}

for (const entry of firstReport.excluded) {
  const text = normalize(entry.source);
  const item = candidates.get(text) ?? { key: stableKey(text), source: text, evidence: [], files: [...entry.files] };
  item.evidence.push({ file: entry.files[0], line: entry.line, evidence: `FIRST_BATCH_EXCLUDED:${entry.classification}` });
  candidates.set(text, item);
}

function isInternal(item) {
  return item.evidence.length > 0 && item.evidence.every(({ evidence }) => evidence.startsWith("UI_HELPER:") && /(?:debug|log|technical|internal)/i.test(evidence));
}

function classify(item) {
  const { source, files } = item;
  const legal = files.some((file) => file.startsWith("src/modules/legal/")) || legalPattern.test(source);
  if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:eyJ|sk_|pk_|sbp_|cf_)[A-Za-z0-9._-]{8,}|\+?[0-9][0-9 ()/.-]{7,}[0-9]/i.test(source)) return "PERSONAL_OR_EXAMPLE_DATA_LOCAL_ONLY";
  if (/(?:z\.\s?B\.|zum Beispiel)/i.test(source)) return "PERSONAL_OR_EXAMPLE_DATA_LOCAL_ONLY";
  if (/^(?:[/#?.]|[a-z]+:)|^(?:[A-Z][A-Z0-9_./:-]*|[a-z][A-Za-z0-9_]*(?:[._/-][A-Za-z0-9_]+)+)$/.test(source) || /^(?:SUPABASE|SERVICE_ROLE|ANON_KEY|API_KEY|VITE_[A-Z0-9_]+)$/i.test(source)) return "TECHNICAL_IDENTIFIER_LOCAL_ONLY";
  if (isInternal(item)) return "INTERNAL_LOG_DEBUG_LOCAL_ONLY";
  if (legal) {
    const sentences = (source.match(/[.!?](?:\s|$)/g) ?? []).length;
    if (source.length > 180 || sentences >= 3 || legalClausePattern.test(source)) return "LEGAL_DOCUMENT_BODY_LOCAL_ONLY";
    return "LEGAL_UI_LABEL_EXTERNAL_OK";
  }
  return "STATIC_UI_COPY_EXTERNAL_OK";
}

const entries = [...candidates.values()].map((item) => ({
  ...item,
  classification: classify(item),
  placeholders: placeholdersFor(item.source),
})).sort((a, b) => a.key.localeCompare(b.key));

const categories = [
  "STATIC_UI_COPY_EXTERNAL_OK",
  "LEGAL_UI_LABEL_EXTERNAL_OK",
  "LEGAL_DOCUMENT_BODY_LOCAL_ONLY",
  "PERSONAL_OR_EXAMPLE_DATA_LOCAL_ONLY",
  "TECHNICAL_IDENTIFIER_LOCAL_ONLY",
  "OWNER_OR_USER_CONTENT_LOCAL_ONLY",
  "INTERNAL_LOG_DEBUG_LOCAL_ONLY",
];
const counts = Object.fromEntries(categories.map((category) => [category, entries.filter((entry) => entry.classification === category).length]));
const external = entries.filter(({ classification }) => classification.endsWith("EXTERNAL_OK"));
const safety = {
  personal_data_in_external_list: external.filter((entry) => /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?[0-9][0-9 ()/.-]{7,}[0-9]|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(entry.source)).length,
  legal_document_body_in_external_list: external.filter((entry) => entry.source.length > 180 && legalPattern.test(entry.source)).length,
  secret_or_provider_data_in_external_list: external.filter((entry) => /(?:eyJ|sk_|pk_|sbp_|cf_|SERVICE_ROLE|ANON_KEY|API_KEY|VITE_[A-Z0-9_]+|workers\.dev|\.supabase\.co|\b[a-z]{20}\.supabase\b)/i.test(entry.source)).length,
};
const placeholderStrings = entries.filter(({ placeholders }) => placeholders.length > 0).length;
const report = {
  generated_at: new Date().toISOString(),
  policy: "Second local-only inventory. No string in this report has been transmitted externally.",
  first_approved_external_batch: firstApproved.size,
  counts: { ...counts, total_external_eligible: external.length, placeholder_strings: placeholderStrings, user_visible_unclassified: 0 },
  safety,
  entries,
};
mkdirSync(resolve(process.cwd(), "docs/reports"), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(approvedPath, `${JSON.stringify(external.map(({ key, source, classification, placeholders }) => ({ key, source, classification, placeholders })), null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ reportPath, approvedPath, counts: report.counts, safety }, null, 2)}\n`);
