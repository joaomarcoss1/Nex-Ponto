# Checklist de prontidão para produção

## Automatizado

- [ ] instalação limpa em Node 22/npm 10
- [ ] lint, TypeScript, unitários, integração e build
- [ ] migrations e verificadores estruturais
- [ ] audit de dependências e SBOM
- [ ] flags de folha oficial/eSocial desativadas

## Ambiente real

- [ ] migrations ensaiadas em clone
- [ ] RLS A/B com dois tenants e todas as tabelas críticas
- [ ] MFA AAL2 e recuperação
- [ ] storage privado e URLs assinadas
- [ ] carga com 20 tenants e p95 aprovado
- [ ] backup restaurado dentro do RTO/RPO
- [ ] alertas, Sentry/APM, logs e plantão
- [ ] pentest sem alto/crítico aberto

## Negócio e conformidade

- [ ] contrato, DPA, política LGPD e subprocessadores
- [ ] regras trabalhistas/contábeis homologadas
- [ ] AFD/AEJ/CAdES validados antes de qualquer alegação REP
- [ ] onboarding, contingência e suporte treinados
- [ ] plano de piloto e rollback assinados

Enquanto qualquer item externo crítico estiver pendente, o resultado é
**candidato a piloto controlado**, não produção irrestrita.
