# Assistente Jurídico 24h: stack de instalação

Atendimento automático por WhatsApp para escritórios de advocacia: tira dúvidas,
faz triagem, marca reuniões e passa para um humano quando precisa.
Um único servidor atende vários escritórios (multi-tenant).

| Serviço | Para que serve | Endereço |
|---|---|---|
| **n8n** | Fluxos e agente de IA | `https://n8n.SEUDOMINIO` |
| **Evolution API** | Conexão com o WhatsApp | `https://api.SEUDOMINIO/manager` |
| **Chatwoot** | Painel onde a equipe acompanha e assume conversas | `https://chat.SEUDOMINIO` |
| **Postgres 17 + pgvector** | Bancos `n8n`, `evolution`, `chatwoot` e `agente` (leads, agenda, FAQ) | interno |
| **Redis** | Cache e filas | interno |
| **Caddy** | HTTPS automático (Let's Encrypt) | portas 80/443 |

## Do que você precisa

1. **Um VPS Ubuntu 22.04 ou 24.04** com no mínimo **4 GB de RAM e 2 vCPU** (o Chatwoot é o mais pesado). Opções: Hetzner, Contabo, Hostinger VPS, DigitalOcean.
2. **Um domínio**, com 3 registros DNS tipo **A** apontando para o IP do VPS:
   `n8n`, `api` e `chat` (ex.: `n8n.seudominio.com.br`).
3. **Uma chave de API de IA** (Anthropic/Claude ou OpenAI). Ela é cadastrada depois, dentro do n8n.
4. **Um número de WhatsApp** só para o escritório (chip dedicado).

## Instalação (um comando)

No VPS, como root:

```bash
git clone <este-repositorio> && cd <repositorio>/assistente-juridico
sudo ./install.sh seudominio.com.br voce@seudominio.com.br
```

O script:
1. instala o Docker, se faltar;
2. libera só SSH, HTTP e HTTPS no firewall;
3. gera o `.env` com senhas aleatórias;
4. cria os bancos e o schema do agente;
5. prepara o Chatwoot e sobe tudo com HTTPS.

No fim ele mostra os endereços e a API key da Evolution. **Faça backup do `.env`.**

## Depois de instalar

1. **n8n**: acesse `https://n8n.SEUDOMINIO` e crie a conta de dono.
   Em *Credentials*, cadastre:
   - **Anthropic** (ou OpenAI) com sua chave de API;
   - **Postgres**: host `postgres`, banco `agente`, usuário e senha do `.env`;
   - **Google Calendar** (OAuth), para a agenda dos escritórios.
2. **Chatwoot**: acesse `https://chat.SEUDOMINIO`, crie o admin e uma conta por escritório.
   Em *Profile settings*, copie o **Access Token**.
3. **WhatsApp**: em `https://api.SEUDOMINIO/manager`, entre com a API key, crie uma
   instância (ex.: `escritorio-silva`) e leia o QR Code com o celular do escritório.
   - Em *Integrations → Chatwoot*, ligue a integração com a URL `http://chatwoot-rails:3000`,
     o token e o ID da conta. As conversas passam a aparecer no painel.
   - Em *Events → Webhook*, aponte para o webhook do seu fluxo no n8n
     (ex.: `https://n8n.SEUDOMINIO/webhook/whatsapp`) com o evento `MESSAGES_UPSERT`.
4. **Cadastre o escritório** no banco `agente` (tabela `escritorios`), com
   `instancia_whatsapp` igual ao nome da instância criada na Evolution. Há um escritório de exemplo já inserido.
5. **Monte o fluxo no n8n** usando o prompt em [`prompts/agente-juridico.md`](prompts/agente-juridico.md).

## Comandos úteis

```bash
docker compose ps                 # status dos serviços
docker compose logs -f n8n        # logs de um serviço
docker compose pull && docker compose up -d   # atualizar
docker compose exec postgres psql -U assistente -d agente   # acessar o banco do agente

# backup de todos os bancos
docker compose exec -T postgres pg_dumpall -U assistente | gzip > backup-$(date +%F).sql.gz
```

## Segurança e boas práticas

- **Fixe versões** em produção: troque `latest` no `.env` pelas versões que você testou.
- **Backup diário** do Postgres (comando acima, via `cron`) e cópia do `.env` fora do servidor.
- **WhatsApp não oficial**: a Evolution API conecta via WhatsApp Web, e o número pode ser
  bloqueado se mandar mensagens em massa. Para clientes maiores, a própria Evolution suporta
  a **Cloud API oficial da Meta**, sem trocar o resto da stack.
- **LGPD/OAB**: o prompt já obriga a se identificar como assistente virtual, a pedir
  consentimento e a não dar parecer jurídico. Revise com o escritório antes de ativar.
