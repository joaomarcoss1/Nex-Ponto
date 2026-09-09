import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { scanSensitiveText } from "./lib/sensitive-data-rules.mjs";

const root = process.cwd();
const ignored = new Set(["node_modules", ".next", ".git", ".vercel", "coverage", "dist", "out", ".npm-project-cache", ".npm-runtime-cache", "playwright-report", "test-results"]);
const ignoredFiles = new Set(["package-lock.json", "check-sensitive-data.mjs", "sensitive-data-rules.mjs"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".md", ".json", ".csv", ".txt", ".env", ".example"]);

const rules = [
  { name: "marca legada", pattern: /\bbrilho(?:[\s-]+do[\s-]+sol|[\s-]*ponto)?\b/i },
  { name: "filial/dado legado identificado", pattern: /vila\s+bin[eé]|filial\s+1.?[\sº°]*de\s+maio|cod[oó]\s*-\s*ma/i },
  { name: "CPF formatado", pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/ },
  { name: "JWT possivelmente real", pattern: /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: "chave Supabase possivelmente real", pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{24,}\b/i },
  { name: "PIN em texto puro persistido", pattern: /\b(pin_plain|plain_pin|pin_code)\b/i },
];

function filesIn(directory) {
  const result = [];
  for (const name of readdirSync(directory)) {
    if (ignored.has(name)) continue;
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...filesIn(path));
    else if (!ignoredFiles.has(name) && textExtensions.has(extname(name).toLowerCase())) result.push(path);
  }
  return result;
}

const findings = [];
for (const file of filesIn(root)) {
  const content = readFileSync(file, "utf8");
  for (const finding of scanSensitiveText(content)) findings.push(`${relative(root, file)}: ${finding}`);
  for (const rule of rules) {
    if (rule.pattern.test(content)) findings.push(`${relative(root, file)}: ${rule.name}`);
  }
}

if (findings.length) {
  console.error("Dados sensíveis ou legados encontrados:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Varredura concluída: nenhum dado real, segredo conhecido, CPF formatado ou marca legada encontrado.");
