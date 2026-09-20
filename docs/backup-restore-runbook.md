# Backup e restauração

## Política a preencher

- RPO recomendado inicial: 24 horas;
- RTO recomendado inicial: 4 horas;
- retenção: diária, semanal e mensal conforme jurídico/LGPD;
- banco e storage devem usar criptografia e contas separadas.

## Ensaio

1. registrar contagens e checksums;
2. gerar backup nativo do PostgreSQL;
3. copiar buckets privados;
4. restaurar em projeto isolado;
5. executar migrations;
6. comparar contagens/checksums;
7. validar login, ponto, relatório e fechamento;
8. destruir o ambiente de ensaio conforme política.

Um arquivo gerado não comprova backup. Somente uma restauração verificada é evidência. Esta entrega não executou restauração por ausência de ambiente Supabase de homologação.

