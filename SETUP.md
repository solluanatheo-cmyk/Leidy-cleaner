# Setup rápido — Leidy Cleaner

Este documento reúne os passos essenciais para configurar o projeto localmente, rodar migrations, seed, testes e configurar E2E no CI (Playwright).

1) Pré-requisitos
- Node.js 20+ e npm
- Docker (opcional, recomendado para Postgres/Redis)
- Git

2) Criar variáveis de ambiente
Copie o exemplo e preencha segredos:

```bash
cp .env.example .env
# Edite .env com JWT_SECRET, DATABASE_URL (ou DATABASE_LOCAL), SMTP, TWILIO, SENTRY_DSN
```

3) Instalar dependências

```bash
npm ci
npm --prefix backend ci
npm --prefix frontend ci
```

4) Banco de dados

- Opção A (Postgres via Docker – recomendado):

```bash
docker-compose -f docker-compose.pg.yml up -d postgres redis
# Aguarde os containers subirem
npm --prefix backend run migrate
npm --prefix backend run seed
```

- Opção B (SQLite local):

```bash
# No .env: DB_TYPE=sqlite e DATABASE_LOCAL=./backend/database.sqlite
npm --prefix backend run migrate
npm --prefix backend run seed
```

5) Rodar em desenvolvimento

```bash
# Backend (dev)
npm --prefix backend run dev

# Frontend (Next.js)
npm --prefix frontend run dev
```

6) Testes e E2E

- Testes unitários:
```bash
npm --prefix backend run test
npm --prefix frontend run test
```

- Playwright (local):
Requer bibliotecas nativas (GTK, Vulkan, GStreamer, codecs). Se não quiser instalar as libs locais, rode os testes em CI (recomendado).

```bash
npx playwright install
npm run test:e2e
```

7) Integração contínua (recomendado)

- Use o workflow adicionado em `.github/workflows/playwright.yml` (GitHub Actions). Ele:
  - sobe Postgres/Redis como serviços
  - instala dependências e navegadores Playwright (`--with-deps`)
  - roda migrations, seed e executa `npm run test:e2e`

8) Troubleshooting rápido

- `.env` não criado: `cp .env.example .env`
- Erro de conexão com Postgres: verifique `DATABASE_URL` e se o container está ativo (`docker ps`).
- Erros Playwright sobre libs nativas: prefira usar o workflow GitHub Actions ou a imagem Docker oficial do Playwright.
- Logs backend: `tail -f backend/logs/error.log`

9) Comandos úteis (resumo)

```bash
# checar setup criado
npm run check:setup

# migrations + seed
npm --prefix backend run migrate
npm --prefix backend run seed

# executar E2E (local)
npx playwright install
npm run test:e2e
```

Se quiser, eu também posso abrir um PR com essas mudanças (inclui workflow e scripts adicionados). Diga se quer PR automático.