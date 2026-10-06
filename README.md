# EconomizaAI

**English** | [Português](./README.pt-BR.md)

[![CI (main)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml?query=branch%3Amain)
[![CI develop (develop)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml?query=branch%3Adevelop)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS 12](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

A personal Telegram bot that records expenses with AI.

You send "ontem gastei 32,50 de Uber" ("yesterday I spent 32.50 on Uber")
as text or a voice message, and the bot uses Gemini to extract the amount,
category, description and date, then stores them in Postgres. At the end of
the month it exports the records as CSV or Markdown for analysis. The data
stays on the owner's VPS and only leaves it through an explicit export.

> [!NOTE]
> The bot talks to its single user in Brazilian Portuguese, so the messages
> and examples below are in Portuguese.

It is also a portfolio project: the structure (Clean Architecture, TDD,
documented security) matters as much as the features.

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Usage](#usage)
- [Tests](#tests)
- [Development workflow](#development-workflow)
- [Documentation](#documentation)
- [License](#license)

## Features

- **Natural-language entry** by text or voice message. One message can hold
  several expenses, and saving is all-or-nothing.
- **Closed set of categories** (`alimentacao`, `mercado`, `transporte`,
  `moradia`, `saude`, `lazer`, `educacao`, `assinaturas`, `vestuario`,
  `outros`).
- **Undo** the last entry with one button, for up to 1 hour.
- **Export** a period as CSV or Markdown (`/exportar`, or "exporta meus
  gastos de agosto").
- **Summary** by category and **latest expenses** (`/resumo`, `/ultimos`).
- **Single-owner bot:** any other user is dropped before reaching the
  business rules.

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 24, TypeScript (strict, ESM) | Strong typing end to end |
| Framework | NestJS 12 | Dependency injection wires ports to adapters |
| Database | PostgreSQL 17 + TypeORM (migrations only) | Amounts stored as integer cents, no `synchronize` |
| Telegram | grammY, long polling | The VPS has no domain; long polling only makes outbound connections |
| AI | Google Gemini (`@google/genai`) | Understands audio natively and returns structured output |
| Validation | zod | Env, HTTP bodies and **every** LLM response before it becomes domain |
| Tests | Vitest + real Postgres | Unit, integration, contract and e2e |
| Quality | oxlint (type-aware), Prettier, Husky, commitlint, gitleaks | Lint, formatting, conventional commits and secrets checked on commit |
| CI | GitHub Actions, CodeQL, Dependabot | Lint, tests and `pnpm audit` on every PR |
| Deploy | Multi-stage Docker on Easypanel | In progress (roadmap stage 11) |

## Architecture

Pragmatic Clean Architecture: the domain knows nothing about Nest, TypeORM,
grammY or AI SDKs. Swapping the AI provider or the export format means
writing a new class, without touching any use case.

```
src/modules/gastos/
  domain/          Dinheiro, Categoria, Gasto, Periodo, errors and the repository port
  application/     use cases + ports (InterpretadorDeMensagem, Exportador, Relogio)
  infrastructure/  TypeORM, Gemini, CSV and Markdown exporters
  presentation/    Telegram (handlers, owner guard, rate limit) and dev HTTP routes
  gastos.module.ts the only place that binds ports to adapters
```

## Getting started

**Prerequisites:** Node.js 24+, pnpm (via `corepack enable`), Docker, a
**development** Telegram bot (create one with
[@BotFather](https://t.me/BotFather)) and a
[Google AI Studio](https://aistudio.google.com/) API key.

```bash
corepack enable
pnpm install
docker compose up -d        # local Postgres 17, with the app user already created
cp .env.example .env        # fill in the variables (see below)
pnpm migration:run
pnpm start:dev
```

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` enables the `/dev/*` routes; in `production` they do not exist |
| `DATABASE_URL` | Postgres connection (the local example is in `.env.example`) |
| `TELEGRAM_BOT_TOKEN` | Token of the development bot |
| `TELEGRAM_OWNER_ID` | Your numeric Telegram ID; only this user is served |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and model |
| `PORT`, `TZ` | Optional: default to `3000` and `America/Sao_Paulo` |

> [!WARNING]
> Do not use the production bot token on your machine. Two processes polling
> with the same token knock each other out (409 Conflict).

## Usage

In Telegram, with the development bot:

```
you: ontem 18 num açaí e 120 no mercado
bot: ✅ 2 gastos registrados
     • R$ 18,00 — açaí (alimentação) — 04/10
     • R$ 120,00 — mercado (mercado) — 04/10
     Total: R$ 138,00
     [↩️ Desfazer]
```

Commands: `/exportar`, `/resumo`, `/ultimos` and `/ajuda`. Natural-language
requests ("quanto gastei em setembro?") work too.

Outside production, HTTP routes let you test without Telegram:

```bash
curl -X POST localhost:3000/dev/gastos/texto \
  -H 'Content-Type: application/json' \
  -d '{"texto":"gastei 32,50 de uber"}'

curl 'localhost:3000/dev/exportar?inicio=2026-10-01&fim=2026-10-31&formato=csv'
```

## Tests

```bash
pnpm test               # unit (domain and application, with fakes)
pnpm test:integration   # repository against a real Postgres (economizaai_test database)
pnpm test:e2e           # HTTP routes
pnpm test:cov           # coverage
pnpm lint
```

> [!NOTE]
> `pnpm test:ia` calls the real Gemini API and uses quota. It is run by hand
> and never in CI.

## Development workflow

`develop` is staging and `main` is production. Everything lands on
`develop`, CI runs, and only a `develop → main` pull request with green CI
reaches production. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/), enforced by
commitlint. The full rules live in
[CLAUDE.md](./CLAUDE.md#git--branches-commits-prs-e-merges) (Portuguese).

## Documentation

These documents are written in Portuguese:

- [ROADMAP.md](./ROADMAP.md): stage-by-stage plan and status
- [SECURITY.md](./SECURITY.md): threat model, controls and security gate
- [CLAUDE.md](./CLAUDE.md): context, architecture and working rules

## License

Personal project with no usage license (`UNLICENSED`). All rights reserved
by Augusto Bernardo.
