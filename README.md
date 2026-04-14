# 🚗 IMP Locadora — Plataforma de Gestão de Locação de Veículos

Plataforma completa (Web + Android/PWA) para gestão de locação de veículos para motoristas de app, com módulos para **motorista** e **admin**, integração com **Mercado Pago** e deploy automatizado na **Hostinger**.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + PWA |
| Backend | Node.js + Express |
| Banco | PostgreSQL 16 |
| Pagamentos | Mercado Pago (Pix + Cartão até 12x) |
| Android | Capacitor (wrapper PWA → APK) |
| Deploy | Docker / PM2 + Nginx + GitHub Actions |

---

## 📁 Estrutura

```
implocadora/
├── backend/
│   ├── src/
│   │   ├── config/          # database, migrate, seed
│   │   ├── middleware/       # auth JWT, upload multer
│   │   ├── routes/           # auth, cars, drivers, payments, settings, webhooks
│   │   ├── services/         # PaymentService, MercadoPagoService, ExternalPlatformService
│   │   └── server.js
│   ├── uploads/
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Layout, Loading
│   │   ├── contexts/         # AuthContext
│   │   ├── pages/
│   │   │   ├── admin/        # Dashboard, Cars, Drivers, DriverDetail, Settings
│   │   │   ├── driver/       # Dashboard, Documents, Payments
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Vitrine.jsx
│   │   └── services/         # api.js (axios)
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── capacitor.config.json
│   └── package.json
├── .github/workflows/deploy.yml
├── docker-compose.yml
├── deploy.bat                # Deploy manual Windows → VPS
├── deploy-docker.bat         # Deploy Docker → VPS
├── setup-vps.sh              # Setup inicial do VPS
└── README.md
```

---

## 🚀 Instalação Local (Dev)

```bash
# 1. Clone
git clone https://github.com/seu-usuario/implocadora.git
cd implocadora

# 2. Backend
cd backend
cp .env.example .env       # Edite com dados do seu PostgreSQL
npm install
npm run migrate
npm run seed
npm run dev                # → http://localhost:3001

# 3. Frontend (novo terminal)
cd ../frontend
npm install
npm run dev                # → http://localhost:5173
```

**Acesso inicial:** admin@implocadora.com.br / admin123

---

## 💳 Configuração Mercado Pago

### 1. Criar aplicação

Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel/app) e crie uma aplicação.

### 2. Credenciais

No `.env` do backend:
```env
MP_ACCESS_TOKEN=APP_USR-xxxx      # Credenciais de produção
MP_PUBLIC_KEY=APP_USR-xxxx
MP_WEBHOOK_SECRET=sua_chave       # Gerada no painel MP
MP_WEBHOOK_URL=https://seudominio.com/api/webhooks/mp
```

### 3. Webhook

No painel do Mercado Pago → Webhooks:
- **URL:** `https://seudominio.com/api/webhooks/mp`
- **Eventos:** `payment` (apenas)

### 4. Modo Sandbox

Para testes, use credenciais de teste (sandbox). O sistema detecta automaticamente e faz fallback para simulação se `MP_ACCESS_TOKEN` não estiver configurado.

### 5. Juros no Cartão

No painel admin → Configurações → Taxas de Parcelamento, edite a taxa por parcela. Os juros são adicionados ao valor pago pelo motorista (ex: 12x com 25,49% → valor × 1,2549).

---

## 🌐 Plataforma Externa

O sistema cadastra motoristas automaticamente em outra plataforma via API HTTP POST:

- **Token do motorista:** 6 primeiros dígitos do CPF
- **Evento disparador:** configurável (caução pago / contrato confirmado / ativado)
- **Config no `.env`:**
  ```env
  EXTERNAL_API_URL=https://outra-plataforma.com/api/motoristas
  EXTERNAL_API_KEY=bearer_token
  ```

---

## 🚢 Deploy na Hostinger

### Opção A: VPS com PM2 + Nginx (recomendado)

**1. Setup inicial (uma vez):**
```bash
# No VPS via SSH
wget https://raw.githubusercontent.com/seu-usuario/implocadora/main/setup-vps.sh
bash setup-vps.sh
```

**2. Configure o `.env`:**
```bash
nano /opt/implocadora/backend/.env
```

**3. Deploy pelo Windows:**
```bash
# Edite deploy.bat com seu IP/user
deploy.bat --full          # Deploy completo
deploy.bat --backend       # Só backend
deploy.bat --frontend      # Só frontend
deploy.bat --watch         # Auto-deploy ao salvar
```

### Opção B: VPS com Docker

```bash
# 1. Instale Docker no VPS
curl -fsSL https://get.docker.com | sh

# 2. Deploy
deploy-docker.bat
```

### Opção C: GitHub Actions (CI/CD automático)

Configure os secrets no GitHub:
- `DEPLOY_HOST` — IP do VPS
- `DEPLOY_USER` — root
- `SSH_PRIVATE_KEY` — chave SSH privada

A cada push na branch `main`, o deploy é executado automaticamente.

---

## 📱 Build Android (APK)

```bash
cd frontend

# 1. Instale Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init "IMP Locadora" com.implocadora.app --web-dir dist

# 2. Adicione Android
npm install @capacitor/android
npx cap add android

# 3. Build
npm run build
npx cap sync

# 4. Abra no Android Studio
npx cap open android
# → Build → Generate Signed APK
```

**Obs:** Defina `VITE_API_URL=https://seudominio.com` para o app apontar para o servidor.

---

## 🔌 Endpoints da API

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/register | Cadastro motorista |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Perfil do logado |

### Cars
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/cars | Disponíveis (público) |
| GET | /api/cars/all | Todos (admin) |
| POST | /api/cars | Criar (admin) |
| PUT | /api/cars/:id | Editar (admin) |
| DELETE | /api/cars/:id | Remover (admin) |

### Drivers
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/drivers/me | Meu perfil |
| GET | /api/drivers/me/documents | Meus docs |
| POST | /api/drivers/me/documents?tipo= | Upload doc |
| POST | /api/drivers/me/contrato | Upload contrato PDF |
| GET | /api/drivers/me/charges | Minhas cobranças |
| GET | /api/drivers/me/charges/current | Cobrança atual |
| GET | /api/drivers/me/balance | Saldo |
| POST | /api/drivers/me/charges/:id/abatimentos | Solicitar abatimento |
| GET | /api/drivers | Listar todos (admin) |
| GET | /api/drivers/:id | Detalhe (admin) |
| PATCH | /api/drivers/:id/approve | Aprovar (admin) |
| PATCH | /api/drivers/:id/reject | Reprovar (admin) |
| PATCH | /api/drivers/:id/activate | Ativar (admin) |
| PATCH | /api/drivers/:id/confirm-contract | Confirmar contrato (admin) |
| POST | /api/drivers/:id/charges | Criar cobrança (admin) |
| PATCH | /api/drivers/:did/abatimentos/:id/approve | Aprovar abatimento (admin) |
| POST | /api/drivers/:id/settlement | Acerto final + rescisão (admin) |

### Payments
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/payments/simulate | Simular parcelas |
| POST | /api/payments/caucao | Pagar caução |
| POST | /api/payments/weekly/:chargeId | Pagar semanal |
| POST | /api/payments/:id/regenerate-pix | Regenerar Pix expirado |
| POST | /api/payments/:id/confirm | Confirmar (dev/manual) |

### Webhooks
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/webhooks/mp | Notificação Mercado Pago |

### Settings
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/settings | Configurações (admin) |
| PUT | /api/settings | Atualizar (admin) |
| GET/PUT | /api/settings/installment-fees | Taxas de parcelas |

---

## 🔐 Checklist de Segurança

- [x] JWT com expiração configurável
- [x] Helmet (headers HTTP seguros)
- [x] CORS restrito por domínio
- [x] Rate limiting (100 req/15min, 20/15min para auth)
- [x] Senhas hasheadas (bcrypt salt 10)
- [x] Upload com filtro de tipo + limite 10MB
- [x] Validação de webhook MP com HMAC-SHA256
- [x] HTTPS via Certbot (instalado pelo `setup-vps.sh`; emitir com `certbot --nginx -d seudominio.com`)
- [x] Backup automático do PostgreSQL (cron diário 03:00 → `/opt/implocadora/backups`, retenção 14 dias)

### HTTPS (Certbot)
O `setup-vps.sh` já instala o Certbot. Para emitir o certificado (após apontar o DNS para o VPS):
```bash
certbot --nginx -d seudominio.com
```
A renovação automática é configurada pelo próprio pacote `certbot`.

### Backup PostgreSQL
Configurado automaticamente pelo `setup-vps.sh`:
- Script: `/usr/local/bin/implocadora-pgbackup.sh`
- Cron: diário às 03:00
- Destino: `/opt/implocadora/backups/implocadora_YYYYMMDD_HHMMSS.sql.gz`
- Retenção: 14 dias

---

## 📋 Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|:-----------:|
| PORT | Porta do backend | ✓ |
| NODE_ENV | production / development | ✓ |
| DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS | PostgreSQL | ✓ |
| JWT_SECRET | Chave secreta JWT | ✓ |
| MP_ACCESS_TOKEN | Token Mercado Pago | Para MP real |
| MP_PUBLIC_KEY | Chave pública MP | Para MP real |
| MP_WEBHOOK_SECRET | Segredo do webhook | Recomendado |
| MP_WEBHOOK_URL | URL pública do webhook | Para MP real |
| FRONTEND_URL | URL do frontend | Produção |
| EXTERNAL_API_URL | API da plataforma externa | Opcional |
| EXTERNAL_API_KEY | Token da API externa | Opcional |
