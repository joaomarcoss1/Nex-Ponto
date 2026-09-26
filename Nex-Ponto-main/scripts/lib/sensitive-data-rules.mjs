export const sensitiveDataRules = [
  { name: "marca legada", pattern: /\bbrilho(?:[\s-]+do[\s-]+sol|[\s-]*ponto)?\b/i },
  { name: "filial/dado legado identificado", pattern: /vila\s+bin[eé]|filial\s+1.?[\sº°]*de\s+maio|cod[oó]\s*-\s*ma/i },
  { name: "CPF formatado", pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/ },
  { name: "JWT possivelmente real", pattern: /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: "chave Supabase possivelmente real", pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{24,}\b/i },
  { name: "PIN em texto puro persistido", pattern: /\b(pin_plain|plain_pin|pin_code)\b/i },
];

export function scanSensitiveText(content) {
  return sensitiveDataRules
    .filter((rule) => rule.pattern.test(content))
    .map((rule) => rule.name);
}
