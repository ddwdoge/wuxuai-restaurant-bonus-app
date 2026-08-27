const requiredBuildEnvironment = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];

export function missingRequiredBuildEnvironment(environment = process.env) {
  return requiredBuildEnvironment.filter((name) => !String(environment[name] ?? "").trim());
}

export function validateRequiredBuildEnvironment(environment = process.env) {
  const missing = missingRequiredBuildEnvironment(environment);
  if (missing.length === 0) return;

  throw new Error(`Build abgebrochen: Erforderliche Umgebungsvariablen fehlen: ${missing.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateRequiredBuildEnvironment();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Build abgebrochen: Erforderliche Umgebungsvariablen fehlen.");
    process.exitCode = 1;
  }
}
import { pathToFileURL } from "node:url";
