import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

const authSource = readFileSync("src/lib/server/auth.ts", "utf8");
const mappingBlock = authSource.match(/const ADMIN_WRITE_ROUTE_PERMISSIONS[\s\S]*?\n\];/)?.[0] || "";
const mappings = [...mappingBlock.matchAll(/\["(\/api\/admin\/[^"]+)",\s*"([^"]+)"\]/g)]
  .map((match) => ({ prefix: match[1], permission: match[2] }));
const rows = [];
const failures = [];

for (const filename of files("src/app/api/admin").filter((name) => name.endsWith("route.ts"))) {
  const source = readFileSync(filename, "utf8");
  const methods = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)/g)].map((match) => match[1]);
  if (!methods.length) continue;
  const route = `/${relative("src/app", dirname(filename)).split(sep).join("/")}`;
  const special = !source.includes("requireAdmin(") && (
    source.includes("authenticatedUser(") ||
    source.includes("requirePlatformSuperadmin(") ||
    (source.includes("MASTER_SETUP_TOKEN") && source.includes("bootstrap_tenant_owner_v4"))
  );
  const mapping = mappings.find(({ prefix }) => route === prefix || route.startsWith(`${prefix}/`));
  const status = special ? "SPECIAL_AUTH_FLOW" : mapping ? "MAPPED" : "UNMAPPED";
  rows.push({ route, methods: methods.join(","), permission: mapping?.permission || "-", status });
  if (status === "UNMAPPED") failures.push(route);
}

for (const row of rows) console.log(`${row.route} | ${row.methods} | ${row.permission} | ${row.status}`);
if (failures.length) {
  console.error(`FAIL: ${failures.length} rota(s) de escrita sem política explícita.`);
  process.exit(1);
}
console.log(`PASS: ${rows.length} rotas administrativas de escrita mapeadas ou com fluxo especial autenticado.`);
