# Validações externas pendentes — NexPonto v5.1

A implementação local não substitui homologação em infraestrutura real.

Antes da produção, concluir:

- `npm ci`, lint, typecheck, Vitest e build;
- migrations do zero e upgrade em PostgreSQL/Supabase;
- RLS com dois tenants e filiais distintas;
- E2E de ponto, escalas, banco de horas e pré-folha;
- teste de carga e concorrência;
- PDF/XLSX em grande volume;
- storage e expiração de downloads;
- backup e restauração;
- observabilidade e alertas;
- homologação contábil das regras financeiras.
