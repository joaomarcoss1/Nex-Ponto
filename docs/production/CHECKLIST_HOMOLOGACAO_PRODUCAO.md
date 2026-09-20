# Checklist obrigatório de homologação

## Banco e isolamento

- [ ] Backup restaurado com sucesso em ambiente separado.
- [ ] Migrations 001–020 aplicadas do zero.
- [ ] Upgrade de cópia sanitizada da v2 aplicado.
- [ ] Nenhuma linha operacional sem `tenant_id`.
- [ ] Empresa A não lê, altera ou exporta dados da empresa B.
- [ ] Gerente não acessa filial fora do escopo.
- [ ] Usuário sem permissão financeira não visualiza remuneração.

## Aplicação

- [ ] `npm run security:data`
- [ ] `npm run migrations:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Smoke test desktop e mobile.

## Operação

- [ ] SMTP e redirects do Supabase configurados.
- [ ] Storage e políticas de upload configurados.
- [ ] Domínios verificados.
- [ ] Monitoramento de erros ativado.
- [ ] Rotina de backup e retenção definida.
- [ ] Piloto com duas empresas concluído.
- [ ] Pré-folha homologada por RH/contabilidade.
