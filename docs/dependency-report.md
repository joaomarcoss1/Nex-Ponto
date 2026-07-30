# Dependências

## Resultado

Em 29/07/2026, `npm audit --omit=dev --audit-level=high` retornou zero vulnerabilidades.

Medidas:

- `brace-expansion` fixado em 5.0.8 por override para remover a cadeia transitiva do ExcelJS;
- Playwright atualizado para 1.62.0;
- ExcelJS mantido em 4.1.1 com regressão obrigatória de importação/exportação;
- Node 22 e npm 10 fixados.

Qualquer alteração de ExcelJS, archiver, glob/minimatch, PDFKit, Next.js, Supabase ou Playwright deve executar testes de arquivos e auditoria antes do merge.

