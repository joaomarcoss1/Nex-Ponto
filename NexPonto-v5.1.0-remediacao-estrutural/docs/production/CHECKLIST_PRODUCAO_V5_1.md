# Checklist de homologação e produção v5.1

## Código

- [ ] `npm ci` em ambiente limpo;
- [ ] scanner aprovado;
- [ ] lint sem erro;
- [ ] typecheck sem erro;
- [ ] testes unitários e integração aprovados;
- [ ] build de produção aprovado.

## Banco

- [ ] backup e restauração comprovados;
- [ ] precheck armazenado;
- [ ] migrations 001–044 aplicadas do zero;
- [ ] upgrade de cópia v4/v5 ensaiado;
- [ ] postcheck sem perda;
- [ ] RLS com dois tenants aprovada;
- [ ] mesma matrícula/código de filial em tenants distintos aprovado.

## Regras

- [ ] banco de horas conciliado;
- [ ] snapshots históricos validados;
- [ ] turnos que atravessam mês testados;
- [ ] tabelas legais sem sobreposição;
- [ ] casos dourados homologados pela contabilidade;
- [ ] consolidado igual à soma das filiais.

## Operação

- [ ] PDF/XLSX testados;
- [ ] jobs e storage testados;
- [ ] observabilidade configurada;
- [ ] mobile testado em aparelhos reais;
- [ ] piloto com dois tenants;
- [ ] duas competências paralelas comparadas.
