import assert from "node:assert/strict";
import { scanSensitiveText } from "./lib/sensitive-data-rules.mjs";

assert.deepEqual(scanSensitiveText("process.env.SUPABASE_SERVICE_ROLE_KEY"), []);
assert.deepEqual(scanSensitiveText('const name = "SUPABASE_SERVICE_ROLE_KEY";'), []);

const simulatedRealKey = "sb_" + "secret_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6";
assert.ok(scanSensitiveText(`SUPABASE_SERVICE_ROLE_KEY=${simulatedRealKey}`).includes("chave Supabase possivelmente real"));

const simulatedJwt = ["eyJ" + "A".repeat(40), "B".repeat(30), "C".repeat(30)].join(".");
assert.ok(scanSensitiveText(simulatedJwt).includes("JWT possivelmente real"));

console.log("Scanner de dados sensíveis: nomes de variáveis aceitos e valores com formato real bloqueados.");
