import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { GENERATED_SOURCE_TO_KEY } from "../src/shared/i18n/messages.generated.mjs";

const root = resolve(process.cwd(), "src");
const attributeNames = new Set(["aria-label", "alt", "description", "label", "placeholder", "title"]);

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function moduleName(file) {
  const path = relative(root, file).split("/");
  return path[0] === "modules" ? path[1] : path[0];
}

function normalizedText(value) {
  return value.replace(/\s+/g, " ").trim();
}

const occurrences = [];
for (const file of filesIn(root)) {
  const sourceText = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const add = (node, kind, text) => {
    const value = normalizedText(text);
    if (!value || !/[\p{L}\p{N}]/u.test(value)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    occurrences.push({ file: relative(process.cwd(), file), line: line + 1, module: moduleName(file), kind, text: value });
  };

  function visit(node) {
    if (ts.isJsxText(node)) add(node, "jsx-text", node.text);
    if (ts.isJsxAttribute(node) && attributeNames.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      add(node, `attribute:${node.name.getText(source)}`, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const byModule = Object.fromEntries(
  [...new Set(occurrences.map((entry) => entry.module))]
    .sort()
    .map((module) => [module, occurrences.filter((entry) => entry.module === module).length]),
);

const managed = occurrences.filter((entry) => GENERATED_SOURCE_TO_KEY[entry.text]);
const unmanaged = occurrences.filter((entry) => !GENERATED_SOURCE_TO_KEY[entry.text]);

process.stdout.write(`${JSON.stringify({
  count: occurrences.length,
  byModule,
  managedCount: managed.length,
  unmanagedCount: unmanaged.length,
  unmanaged,
  occurrences,
}, null, 2)}\n`);
