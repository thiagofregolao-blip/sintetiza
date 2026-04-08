# WhatsApp Digest SaaS — CLAUDE.md

## O que é esse projeto
SaaS de monitoramento pessoal de WhatsApp. O usuário conecta o WhatsApp via QR Code, o sistema monitora silenciosamente todos os grupos e conversas, e gera relatórios inteligentes (via Claude API) no horário que o usuário definir.

**Não é um disparador de mensagens.** É um assistente passivo de leitura + sumarização.

## Stack
- Node.js + TypeScript + Express
- PostgreSQL (banco principal)
- Redis + BullMQ (filas de jobs)
- Unipile API (conexão WhatsApp via QR)
- Claude API / Anthropic (análise de mensagens e geração de relatórios)
- Nodemailer (entrega por email)
- node-cron (agendamento)

## Estrutura do projeto
```
src/
├── server.ts                    # Entry point
├── database/
│   ├── connection.ts            # Pool Postgres
│   └── schema.sql               # Schema completo (rodar uma vez)
├── middleware/
│   └── auth.ts                  # JWT middleware
├── types/
│   └── index.ts                 # Todos os types TypeScript
└── modules/
    ├── auth/                    # M1: Registro, login, JWT
    ├── whatsapp/                # M2: Unipile + webhook handler
    ├── messages/                # M3: saveMessage, getDigestContext
    ├── digest/                  # M4+M5: Claude API + entrega
    └── scheduler/               # Cron + BullMQ queues
```

## Fluxo principal
1. Usuário faz POST /api/whatsapp/connect → recebe QR Code
2. Usuário escaneia QR no WhatsApp
3. Unipile confirma via webhook POST /api/whatsapp/webhook (event: account_connected)
4. A partir daí, cada mensagem recebida chega via webhook (event: message_received)
5. saveMessage() processa, detecta urgências e keywords, salva no Postgres
6. No horário configurado, cron dispara geração do digest via BullMQ
7. digestService.generateDigest() manda contexto para Claude API
8. Claude analisa e retorna JSON estruturado
9. Relatório é entregue via WhatsApp/email/dashboard

## Banco de dados
Rodar o schema.sql uma vez:
```bash
psql -U postgres -d whatsapp_digest -f src/database/schema.sql
```

## Variáveis de ambiente
Copiar .env.example para .env e preencher:
- DATABASE_URL: string de conexão postgres
- UNIPILE_API_KEY: chave da API do Unipile
- ANTHROPIC_API_KEY: chave da API da Anthropic
- JWT_SECRET: string longa e aleatória
- REDIS_URL: conexão Redis

## Comandos
```bash
npm install          # Instalar dependências
npm run dev          # Desenvolvimento (ts-node-dev)
npm run build        # Compilar TypeScript
npm start            # Produção
```

## Módulos para implementar ainda (v2)
- [ ] Criptografia AES-256 do conteúdo das mensagens (campo content_encrypted)
- [ ] Relatório semanal (digest type = 'weekly')
- [ ] suggestReply() — sugestão de resposta com IA
- [ ] Integração DataGrow (módulo M7)
- [ ] Dashboard frontend (React/Next.js)
- [ ] Sistema de billing/pagamento (Stripe)
- [ ] Rate limiting por plano (max_digests_per_day)
- [ ] Endpoint SSE para streaming do QR Code em tempo real

## Decisões de arquitetura

### Por que BullMQ para digests?
Claude API tem rate limits e latência. Usar fila garante que múltiplos usuários com digest no mesmo horário não sobrecarregam a API ao mesmo tempo. Concurrency=3 no worker controla isso.

### Por que urgency_score é calculado no saveMessage?
Score 5 precisa disparar alerta IMEDIATO sem esperar o cron noturno. Se calculasse só na hora do digest, o usuário perderia alertas urgentes.

### Por que included_in_digest?
Evita duplicar mensagens quando o usuário pede 2 digests no mesmo dia. Cada mensagem só entra em 1 digest.

### Webhook do Unipile
O webhook responde 200 IMEDIATAMENTE e processa async. Isso é obrigatório — se o Unipile não receber 200 em ~5s, ele reenvia o evento e você processaria mensagens duplicadas (por isso tem o dedup via unipile_message_id).

## Notas importantes
- phone_number_encrypted: guardar o telefone criptografado (AES-256) — implementar em v2
- expires_at: LGPD — mensagens expiram automaticamente baseado no plano
- O campo datagrow_user_id em users é o gancho para a integração futura com DataGrow
