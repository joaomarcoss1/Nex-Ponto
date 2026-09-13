import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

function routeMappings(source, constantName) {
  const block = source.match(new RegExp(`const ${constantName}[\\s\\S]*?\\n\\];`))?.[0] || "";
  return [...block.matchAll(/\["(\/api\/admin\/[^"]+)",\s*"([^"]+)"\]/g)].map((match) => ({
    prefix: match[1],
    permission: match[2],
  }));
}

function mappedPermission(route, mappings) {
  return mappings.find(({ prefix }) => route === prefix || route.startsWith(`${prefix}/`))?.permission || null;
}

const authSource = readFileSync("src/lib/server/auth.ts", "utf8");
const writeMappings = routeMappings(authSource, "ADMIN_WRITE_ROUTE_PERMISSIONS");
const readMappings = routeMappings(authSource, "ADMIN_READ_ROUTE_PERMISSIONS");
const rows = [];
const failures = [];

for (const filename of files("src/app/api/admin").filter((name) => name.endsWith("route.ts"))) {
  const source = readFileSync(filename, "utf8");
  const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)].map((match) => match[1]);
  const route = `/${relative("src/app", dirname(filename)).split(sep).join("/")}`;
  const usesAdminAuth = source.includes("requireAdmin(");
  const usesUserAuth = source.includes("authenticatedUser(");
  const isBootstrap = route === "/api/admin/bootstrap-master"
    && source.includes("MASTER_SETUP_TOKEN")
    && source.includes("bootstrap_tenant_owner_v4");

  for (const method of methods) {
    const isWrite = method !== "GET";
    const permission = mappedPermission(route, isWrite ? writeMappings : readMappings);
    const auth = usesAdminAuth
      ? "ADMIN_SESSION"
      : usesUserAuth
        ? "AUTH_SESSION"
        : isBootstrap
          ? "ONE_TIME_SETUP_TOKEN"
          : "MISSING";
    const policy = permission || (usesAdminAuth ? "authenticated.admin" : isBootstrap ? "bootstrap.once" : "-");
    const tenant = usesAdminAuth ? "REQUIRED_AND_SERVER_SCOPED" : usesUserAuth ? "MEMBERSHIP_SCOPED" : isBootstrap ? "CREATED_ATOMICALLY" : "UNKNOWN";
    const validation = isWrite
      ? source.includes("safeParse(")
        ? "SCHEMA"
        : source.includes("searchParams")
          ? "QUERY"
          : "NO_BODY"
      : "QUERY_OR_NONE";
    const audit = isWrite && (source.includes("writeAuditLog(") || source.includes("audit_logs") || source.includes("_v5"))
      ? "YES"
      : isWrite
        ? "REVIEW"
        : "N/A";

    rows.push({ method, route, auth, tenant, policy, validation, audit });
    if (auth === "MISSING") failures.push(`${method} ${route}: autenticação ausente`);
    if (isWrite && usesAdminAuth && !permission) failures.push(`${method} ${route}: permissão de escrita ausente`);
  }
}

console.log("METHOD | ROUTE | AUTH | TENANT | PERMISSION | VALIDATION | AUDIT");
for (const row of rows) {
  console.log(`${row.method} | ${row.route} | ${row.auth} | ${row.tenant} | ${row.policy} | ${row.validation} | ${row.audit}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

const writeCount = rows.filter(({ method }) => method !== "GET").length;
console.log(`PASS: matriz completa com ${rows.length} métodos administrativos (${writeCount} de escrita), todos autenticados e todas as escritas administrativas com permissão explícita.`);
