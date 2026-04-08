# WhatsApp Digest SaaS

Assistente pessoal de WhatsApp que monitora grupos e conversas silenciosamente e entrega resumos inteligentes gerados por IA no horário que você definir.

## Início rápido

```bash
# 1. Clonar e instalar
git clone <repo>
cd whatsapp-digest
npm install

# 2. Configurar variáveis
cp .env.example .env
# Editar .env com suas chaves

# 3. Criar banco de dados
createdb whatsapp_digest
psql -U postgres -d whatsapp_digest -f src/database/schema.sql

# 4. Subir Redis (Docker)
docker run -d -p 6379:6379 redis:alpine

# 5. Rodar em desenvolvimento
npm run dev
```

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Criar conta |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/me` | Perfil do usuário |
| POST | `/api/whatsapp/connect` | Gerar QR Code |
| GET | `/api/whatsapp/status` | Status da sessão |
| GET | `/api/whatsapp/groups` | Listar grupos |
| PUT | `/api/whatsapp/groups/:id` | Ativar/desativar grupo |
| POST | `/api/whatsapp/webhook` | Webhook Unipile (não autenticado) |
| GET | `/api/digests` | Listar relatórios |
| GET | `/api/digests/:id` | Relatório completo |
| POST | `/api/digests/manual` | Gerar relatório agora |
| PUT | `/api/digests/schedule/config` | Configurar horário |
| POST | `/api/digests/keywords` | Adicionar palavra-chave |

## Exemplo de uso

```bash
# Registro
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"voce@email.com","password":"senha123","name":"Thiago"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"voce@email.com","password":"senha123"}'

# Conectar WhatsApp (retorna QR Code base64)
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Authorization: Bearer SEU_JWT"

# Gerar relatório manual das últimas 24h
curl -X POST http://localhost:3000/api/digests/manual \
  -H "Authorization: Bearer SEU_JWT" \
  -H "Content-Type: application/json" \
  -d '{"period_hours":24,"format":"detailed","channels":["dashboard"]}'

# Configurar relatório diário às 22h via WhatsApp
curl -X PUT http://localhost:3000/api/digests/schedule/config \
  -H "Authorization: Bearer SEU_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "cron_expression":"0 22 * * *",
    "delivery_channels":["whatsapp","dashboard"],
    "report_format":"detailed"
  }'
```

## Arquitetura

```
WhatsApp → Unipile API → webhook → saveMessage() → Postgres
                                                       ↓
                                    cron/manual → getDigestContext()
                                                       ↓
                                               Claude API (análise)
                                                       ↓
                                          WhatsApp / Email / Dashboard
```

## Planos

| Plano | Preço | Grupos | Relatórios/dia | Retenção |
|-------|-------|--------|----------------|----------|
| Free | R$0 | 3 | 1 | 30 dias |
| Pro | R$29/mês | Ilimitado | 3 | 90 dias |
| Business | R$79/mês | Ilimitado | 6 | 365 dias |
