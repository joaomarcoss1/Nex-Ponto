-- Banco "agente": dados do assistente jurídico, multi-escritório (multi-tenant).
-- Um único fluxo no n8n atende todos os escritórios: ele identifica o escritório
-- pela instância do WhatsApp que recebeu a mensagem e carrega a config daqui.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Escritórios clientes ------------------------------------------------------
CREATE TABLE escritorios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               text NOT NULL,
  instancia_whatsapp text NOT NULL UNIQUE,        -- nome da instância na Evolution API
  telefone           text,
  endereco           text,
  site               text,
  areas_atuacao      text[] NOT NULL DEFAULT '{}', -- ex: {trabalhista,familia,previdenciario}
  horario_atendimento jsonb NOT NULL DEFAULT
    '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","18:00"]}',
  duracao_reuniao_min int NOT NULL DEFAULT 60,
  google_calendar_id text,                         -- agenda onde as reuniões são marcadas
  chatwoot_account_id int,
  chatwoot_inbox_id  int,
  tom_de_voz         text NOT NULL DEFAULT 'formal, cordial e objetivo',
  instrucoes_extras  text,                         -- regras específicas do escritório
  valor_consulta     text,                         -- null = não informar valores
  plano              text NOT NULL DEFAULT 'basico',
  ativo              boolean NOT NULL DEFAULT true,
  criado_em          timestamptz NOT NULL DEFAULT now()
);

-- Perguntas frequentes / base de conhecimento --------------------------------
CREATE TABLE faq (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  pergunta      text NOT NULL,
  resposta      text NOT NULL,
  embedding     vector(1536),                      -- opcional: busca semântica (RAG)
  ativo         boolean NOT NULL DEFAULT true
);
CREATE INDEX faq_escritorio_idx ON faq (escritorio_id) WHERE ativo;

-- Contatos / leads ----------------------------------------------------------
CREATE TABLE leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id    uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  whatsapp         text NOT NULL,
  nome             text,
  email            text,
  area             text,
  resumo_caso      text,
  urgencia         text CHECK (urgencia IN ('baixa','media','alta')),
  status           text NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','em_triagem','agendado','atendido','cliente','perdido','humano')),
  consentimento_lgpd_em timestamptz,               -- quando aceitou o tratamento dos dados
  ia_pausada       boolean NOT NULL DEFAULT false, -- true = humano assumiu, IA não responde
  ultimo_contato   timestamptz NOT NULL DEFAULT now(),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escritorio_id, whatsapp)
);
CREATE INDEX leads_status_idx ON leads (escritorio_id, status);

-- Histórico de mensagens (memória do agente) ---------------------------------
CREATE TABLE mensagens (
  id            bigserial PRIMARY KEY,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  papel         text NOT NULL CHECK (papel IN ('cliente','assistente','humano','sistema')),
  conteudo      text NOT NULL,
  tipo          text NOT NULL DEFAULT 'texto',     -- texto, audio (transcrito), imagem, documento
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensagens_lead_idx ON mensagens (lead_id, criado_em DESC);

-- Agendamentos ---------------------------------------------------------------
CREATE TABLE agendamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id    uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  lead_id          uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  inicio           timestamptz NOT NULL,
  fim              timestamptz NOT NULL,
  modalidade       text NOT NULL DEFAULT 'presencial' CHECK (modalidade IN ('presencial','online','telefone')),
  google_event_id  text,
  status           text NOT NULL DEFAULT 'marcado' CHECK (status IN ('marcado','confirmado','remarcado','cancelado','realizado','faltou')),
  lembrete_24h_em  timestamptz,
  lembrete_1h_em   timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agendamentos_inicio_idx ON agendamentos (escritorio_id, inicio) WHERE status IN ('marcado','confirmado','remarcado');

-- Lembretes pendentes (usado por um fluxo agendado no n8n a cada 15 min)
CREATE VIEW lembretes_pendentes AS
SELECT a.*, l.whatsapp, l.nome, e.instancia_whatsapp, e.nome AS escritorio, e.endereco,
       CASE WHEN a.lembrete_24h_em IS NULL AND a.inicio - now() <= interval '24 hours' AND a.inicio - now() > interval '2 hours' THEN '24h'
            WHEN a.lembrete_1h_em  IS NULL AND a.inicio - now() <= interval '1 hour'  AND a.inicio > now() THEN '1h'
       END AS tipo_lembrete
FROM agendamentos a
JOIN leads l ON l.id = a.lead_id
JOIN escritorios e ON e.id = a.escritorio_id
WHERE a.status IN ('marcado','confirmado','remarcado') AND e.ativo
  AND ((a.lembrete_24h_em IS NULL AND a.inicio - now() <= interval '24 hours' AND a.inicio - now() > interval '2 hours')
    OR (a.lembrete_1h_em  IS NULL AND a.inicio - now() <= interval '1 hour'  AND a.inicio > now()));

-- Escritório de exemplo para testes -----------------------------------------
INSERT INTO escritorios (nome, instancia_whatsapp, telefone, endereco, areas_atuacao, valor_consulta, instrucoes_extras)
VALUES ('Escritório Exemplo Advocacia', 'exemplo', '+55 11 99999-0000',
        'Av. Paulista, 1000 - São Paulo/SP',
        '{trabalhista,familia,previdenciario}',
        NULL,
        'Atendimento presencial ou online. Primeira reunião de até 1 hora.');

INSERT INTO faq (escritorio_id, pergunta, resposta)
SELECT id, 'Quais documentos levar na primeira reunião?',
       'RG, CPF, comprovante de residência e todos os documentos relacionados ao caso (contratos, holerites, carteira de trabalho, decisões anteriores etc.).'
FROM escritorios WHERE instancia_whatsapp = 'exemplo';
