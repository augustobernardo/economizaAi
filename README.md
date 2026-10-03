# EconomizaAI

Bot de Telegram pessoal que recebe mensagens de texto ou áudio sobre gastos
("ontem gastei 32,50 de Uber"), usa IA para extrair valor, categoria,
descrição e data, e salva no Postgres. Exporta as movimentações do mês em
CSV/Markdown para análise manual. Os dados nunca saem da VPS a não ser por
exportação explícita do dono.

Projeto de portfólio, construído com NestJS + TypeScript, TypeORM e Postgres.
Veja `CLAUDE.md` (contexto e arquitetura), `ROADMAP.md` (roteiro de
implementação) e `SECURITY.md` (controles de segurança).

## Desenvolvimento

```bash
pnpm install
docker compose up -d       # Postgres local
pnpm start:dev
```

Copie `.env.example` para `.env` e preencha as chaves antes de subir o app.
