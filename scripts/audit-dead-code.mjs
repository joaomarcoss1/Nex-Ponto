import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(full);
  }
}
walk(sourceRoot);
const allText = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const candidates = files.filter((file) => {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.includes("/app/") || normalized.includes("/__tests__/")) return false;
  const basename = path.basename(file).replace(/\.(ts|tsx|css)$/, "");
  if (["index", "types", "constants"].includes(basename)) return false;
  const occurrences = allText.split(basename).length - 1;
  return occurrences <= 1;
});
console.log(`ATIVO: ${files.length - candidates.length} arquivos com referência ou convenção Next.js/teste.`);
console.log(`NÃO REMOVER SEM HOMOLOGAÇÃO: migrations, rotas, assets públicos, SQL/RPCs e relatórios.`);
for (const file of candidates) console.log(`CANDIDATO A REMOÇÃO: ${path.relative(root, file)} — requer inspeção dinâmica/manual.`);
console.log("Nenhum arquivo foi removido automaticamente; auditoria conservadora concluída.");
