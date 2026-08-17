# Dependências

## Resultado

Em 07/08/2026, `npm audit --omit=dev --audit-level=high` e a auditoria completa retornaram zero vulnerabilidades.

Medidas:

- `brace-expansion` fixado em 5.0.9 por override;
- `postcss` fixado em 8.5.23 e deduplicado na árvore;
- `js-yaml` transitivo de desenvolvimento fixado em 4.3.1;
- Playwright atualizado para 1.62.0;
- ExcelJS mantido em 4.1.1 com regressão obrigatória de importação/exportação;
- Node 22 e npm 10 fixados.

O SBOM CycloneDX em `artifacts/sbom.cdx.json` foi regenerado a partir do lockfile final e identifica o aplicativo `nexponto@5.4.0`.

Qualquer alteração de ExcelJS, archiver, glob/minimatch, PDFKit, Next.js, Supabase ou Playwright deve executar testes de arquivos e auditoria antes do merge.
