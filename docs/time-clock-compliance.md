# Conformidade do registro de ponto

Cada marcação recebe NSR crescente por tenant, timestamp do servidor,
identificador do coletor e SHA-256 dos campos essenciais. Um trigger cria, na
mesma transação, um comprovante imutável em `time_clock_receipts`.

O dispositivo usa identidade aleatória assinada em cookie HTTP-only. Políticas:
livre, monitorado (padrão) ou obrigatório. Dispositivo revogado/bloqueado nunca
registra. O motor antifraude é explicável e sinaliza dispositivo novo, geofence,
GPS impreciso e deslocamento impossível; ele encaminha à revisão, sem apagar a
marcação.

## Limite regulatório

AFD/AEJ desta versão são prévias técnicas determinísticas. O comprovante possui
hash, mas não assinatura CAdES. Antes de alegar aderência à Portaria 671/REP-P:

1. contratar validação jurídica/trabalhista;
2. homologar layout AFD/AEJ e fabricante/coletor;
3. integrar certificado ICP-Brasil e validar CAdES;
4. executar casos dourados e verificação independente;
5. publicar política de contingência e disponibilidade.

Sem essas etapas, comunicar o recurso como controle eletrônico de jornada em
piloto, nunca como REP-P oficialmente homologado.
