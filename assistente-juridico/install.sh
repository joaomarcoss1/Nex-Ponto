#!/usr/bin/env bash
# Instala o Assistente Jurídico 24h num VPS Ubuntu/Debian limpo.
# Uso:  sudo ./install.sh seudominio.com.br voce@email.com
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN_ARG="${1:-}"
EMAIL_ARG="${2:-}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Rode como root: sudo ./install.sh seudominio.com.br voce@email.com" >&2
  exit 1
fi

# 1. Docker ---------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Instalando Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version >/dev/null

# 2. Firewall ---------------------------------------------------------------
if command -v ufw >/dev/null 2>&1; then
  log "Configurando firewall (SSH, HTTP, HTTPS)"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

# 3. .env com segredos gerados ---------------------------------------------
gen() { openssl rand -hex "${1:-24}"; }

if [[ ! -f .env ]]; then
  log "Gerando .env com senhas aleatórias"
  if [[ -z "$DOMAIN_ARG" || -z "$EMAIL_ARG" ]]; then
    echo "Informe domínio e e-mail: sudo ./install.sh seudominio.com.br voce@email.com" >&2
    exit 1
  fi
  cp .env.example .env
  sed -i \
    -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN_ARG}|" \
    -e "s|^ACME_EMAIL=.*|ACME_EMAIL=${EMAIL_ARG}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(gen)|" \
    -e "s|^N8N_ENCRYPTION_KEY=.*|N8N_ENCRYPTION_KEY=$(gen 32)|" \
    -e "s|^EVOLUTION_API_KEY=.*|EVOLUTION_API_KEY=$(gen 32)|" \
    -e "s|^CHATWOOT_SECRET_KEY_BASE=.*|CHATWOOT_SECRET_KEY_BASE=$(gen 64)|" \
    .env
  chmod 600 .env
else
  log ".env já existe, mantendo"
fi
set -a; source .env; set +a

# 4. Sobe a stack -------------------------------------------------------------
log "Baixando imagens"
docker compose pull

log "Subindo banco e cache"
docker compose up -d postgres redis
until docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d agente >/dev/null 2>&1; do sleep 2; done

log "Preparando banco do Chatwoot (pode levar alguns minutos)"
docker compose run --rm chatwoot-rails bundle exec rails db:chatwoot_prepare

log "Subindo todos os serviços"
docker compose up -d

cat <<EOF

✅ Instalação concluída.

Antes de acessar, confirme que estes 3 registros DNS (tipo A) apontam para o IP deste servidor:
  ${N8N_SUBDOMAIN}.${DOMAIN}
  ${EVOLUTION_SUBDOMAIN}.${DOMAIN}
  ${CHATWOOT_SUBDOMAIN}.${DOMAIN}

  n8n (fluxos e IA):          https://${N8N_SUBDOMAIN}.${DOMAIN}
  Evolution API (WhatsApp):   https://${EVOLUTION_SUBDOMAIN}.${DOMAIN}/manager
      API key: ${EVOLUTION_API_KEY}
  Chatwoot (painel humano):   https://${CHATWOOT_SUBDOMAIN}.${DOMAIN}

Todas as senhas estão em $(pwd)/.env. Faça backup desse arquivo.
Próximos passos: veja o README.md, seção "Depois de instalar".
EOF
