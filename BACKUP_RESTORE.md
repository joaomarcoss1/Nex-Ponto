# Backup e restauração — NexPonto 5.5.4

## Responsabilidades

O banco e o Storage são operados no Supabase. A disponibilidade de backups automáticos, retenção e PITR depende do plano contratado e deve ser confirmada no painel do projeto; este documento não presume recursos que o plano não oferece.

O responsável pela produção deve manter inventário do projeto, região, plano, buckets privados, responsáveis autorizados e evidências de cada teste de restauração. Nunca copie `service_role`, tokens, senhas ou PINs para tickets e relatórios.

## Antes de uma migration

1. Execute `scripts/sql/precheck-v554.sql` e arquive o resultado.
2. Confirme o backup mais recente e a política de retenção no Supabase.
3. Para mudanças críticas, crie um backup manual ou snapshot suportado pelo plano.
4. Exporte separadamente configurações não cobertas pelo backup de banco, incluindo variáveis Vercel e configuração dos buckets, sem gravar os valores secretos no repositório.
5. Defina janela, responsável, critério de abortar e procedimento de comunicação.

## Restauração

1. Interrompa gravações ou coloque o serviço em manutenção controlada.
2. Identifique o instante anterior ao incidente e preserve logs/requestIds.
3. Restaure primeiro em um projeto isolado quando o plano e a urgência permitirem.
4. Verifique Auth, tenants, memberships, funcionários, pontos, NSR, recibos, ledger, folha e objetos do Storage.
5. Troque as URLs somente depois do `postcheck`, `/api/health` e `/api/readiness` aprovados.
6. Registre RPO, RTO, perdas confirmadas e responsável pela decisão.

## PITR

Use PITR somente se estiver habilitado no plano e confirme a janela disponível no painel. Escolha um instante anterior à primeira escrita incorreta. Uma restauração pontual do banco não garante, por si só, que objetos do Storage tenham voltado ao mesmo estado; valide ambos.

## Rollback de migration

A migration `057` é incremental e não destrutiva. Em caso de regressão, faça rollback da aplicação para 5.5.3 e interrompa o worker v5.5.4. As novas funções podem permanecer instaladas sem serem chamadas. Não remova colunas, dados ou histórico em uma emergência. Uma remoção posterior das funções deve ocorrer em migration própria, após confirmar que nenhum deploy as utiliza.

## Teste periódico

Execute uma restauração de ensaio pelo menos trimestralmente e antes de mudanças de alto risco. O teste só é aprovado quando login administrativo, isolamento Tenant A/B, ponto/NSR, exports privados e readiness funcionam no ambiente restaurado.
