import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const findings = [];
let controls = 0;

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

const forbidden = [
  ["link morto href=#", /href\s*=\s*["']#["']/g],
  ["onClick vazio", /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g],
  ["confirmação nativa bloqueante", /window\.(?:confirm|prompt)\s*\(/g],
  ["handler explicitamente indefinido", /onClick\s*=\s*\{\s*undefined\s*\}/g],
];

for (const file of filesIn(sourceRoot)) {
  const content = readFileSync(file, "utf8");
  controls += (content.match(/<(?:Button|button)\b/g) || []).length;
  for (const [label, pattern] of forbidden) {
    if (pattern.test(content)) findings.push(`${relative(root, file)}: ${label}`);
  }
}

const button = readFileSync(join(root, "src/components/ui/button.tsx"), "utf8");
if (!button.includes("disabled={disabled || loading}")) findings.push("Button canônico não bloqueia durante loading");
if (!button.includes("aria-busy={loading || undefined}")) findings.push("Button canônico não informa aria-busy");
if (!readFileSync(join(root, "src/components/ui/confirmation-dialog.tsx"), "utf8").includes('role="alertdialog"')) findings.push("diálogo de confirmação acessível ausente");

if (findings.length) {
  console.error("Falhas na auditoria estática de interações:\n- " + findings.join("\n- "));
  process.exit(1);
}
console.log(`PASS: ${controls} controles de botão inventariados; nenhum link morto, handler vazio ou diálogo nativo bloqueante.`);
