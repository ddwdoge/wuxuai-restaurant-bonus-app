import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(process.cwd(), "src");
const families = {
  button: /(?:button|primary-button|secondary-button|icon-button)/,
  form: /(?:field|input|select|textarea|checkbox|toggle)/,
  card: /(?:card|panel)/,
  status: /(?:badge|pill|status)/,
  dialog: /(?:dialog|drawer|modal)/,
  navigation: /(?:nav|navigation|menu|tabs)/,
  state: /(?:loading|empty|error|alert|unavailable)/,
  table: /(?:table|list-row)/,
};

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : /\.(?:tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

const classNames = new Map();
for (const file of filesIn(root)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:className=["'`]|\.)([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)*)/gi)) {
    for (const className of match[1].split(/\s+/)) {
      if (!className || className.includes("${")) continue;
      const record = classNames.get(className) ?? { count: 0, files: new Set() };
      record.count += 1;
      record.files.add(relative(process.cwd(), file));
      classNames.set(className, record);
    }
  }
}

const inventory = Object.fromEntries(Object.entries(families).map(([family, pattern]) => {
  const variants = [...classNames.entries()]
    .filter(([className]) => pattern.test(className))
    .map(([className, record]) => ({ className, count: record.count, files: record.files.size }))
    .sort((left, right) => right.count - left.count || left.className.localeCompare(right.className));
  return [family, { variants: variants.length, top: variants.slice(0, 20) }];
}));

process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), inventory }, null, 2)}\n`);
