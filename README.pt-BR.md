# EconomizaAI

[English](./README.md) | **Português**

[![CI (main)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml?query=branch%3Amain)
[![CI (develop)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/augustobernardo/economizaAi/actions/workflows/ci.yml?query=branch%3Adevelop)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS 12](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

Bot de Telegram pessoal para registro de gastos com IA.

Você manda "ontem gastei 32,50 de Uber" por texto ou áudio, e o bot usa o
Gemini para extrair valor, categoria, descrição e data, e salva tudo no
Postgres. No fim do mês, exporta as movimentações em CSV ou Markdown para
análise. Os dados ficam na VPS do dono e só saem por exportação explícita.

É também um projeto de portfólio: a estrutura (Clean Architecture, TDD,
segurança documentada) importa tanto quanto a funcionalidade.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Como rodar](#como-rodar)
- [Uso](#uso)
- [Testes](#testes)
- [Fluxo de desenvolvimento](#fluxo-de-desenvolvimento)
- [Deploy](#deploy)
- [Documentação](#documentação)
- [Licença](#licença)

## Funcionalidades

- **Registro em linguagem natural**, por texto ou mensagem de voz. Uma
  mensagem pode trazer vários gastos e o registro é tudo ou nada.
- **Categorias fechadas** (`alimentacao`, `mercado`, `transporte`, `moradia`,
  `saude`, `lazer`, `educacao`, `assinaturas`, `vestuario`, `outros`).
- **Desfazer** o último registro com um botão, por até 1 hora.
- **Exportação** de um período em CSV ou Markdown (`/exportar` ou "exporta
  meus gastos de agosto").
- **Resumo** por categoria e **últimos gastos** (`/resumo`, `/ultimos`).
- **Bot de um único dono:** qualquer outro usuário é ignorado antes de
  chegar à regra de negócio.

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js 24, TypeScript (strict, ESM) | Tipagem forte de ponta a ponta |
| Framework | NestJS 12 | Injeção de dependência para ligar ports a adapters |
| Banco | PostgreSQL 17 + TypeORM (só migrations) | Valores em centavos inteiros, sem `synchronize` |
| Telegram | grammY, long polling | A VPS não tem domínio; long polling só faz conexões de saída |
| IA | Google Gemini (`@google/genai`) | Entende áudio nativamente e devolve saída estruturada |
| Validação | zod | Env, corpo HTTP e **toda** resposta do LLM antes de virar domínio |
| Testes | Vitest + Postgres real | Unidade, integração, contrato e e2e |
| Qualidade | oxlint (type-aware), Prettier, Husky, commitlint, gitleaks | Lint, formato, commits convencionais e segredos checados no commit |
| CI | GitHub Actions, CodeQL, Dependabot | Lint, testes e `pnpm audit` em todo PR |
| Deploy | Docker multi-stage no Easypanel | Em andamento (Etapa 11 do roadmap) |

## Arquitetura

Clean Architecture pragmática: o domínio não conhece Nest, TypeORM, grammY
nem SDKs de IA. Trocar o provedor de IA ou o formato de exportação é
escrever uma classe nova, sem mexer em caso de uso.

```
src/modules/gastos/
  domain/          Dinheiro, Categoria, Gasto, Periodo, erros e o port do repositório
  application/     casos de uso + ports (InterpretadorDeMensagem, Exportador, Relogio)
  infrastructure/  TypeORM, Gemini, exportadores CSV e Markdown
  presentation/    Telegram (handlers, owner guard, rate limit) e HTTP de dev
  gastos.module.ts único lugar que liga ports a adapters
```

## Como rodar

**Pré-requisitos:** Node.js 24+, pnpm (via `corepack enable`), Docker, um
bot de Telegram de **desenvolvimento** (crie com o
[@BotFather](https://t.me/BotFather)) e uma chave do
[Google AI Studio](https://aistudio.google.com/).

```bash
corepack enable
pnpm install
docker compose up -d        # Postgres 17 local, já com o usuário da aplicação
cp .env.example .env        # preencha as variáveis (ver abaixo)
pnpm migration:run
pnpm start:dev
```

| Variável | Para quê |
|---|---|
| `NODE_ENV` | `development` libera as rotas `/dev/*`; em `production` elas não existem |
| `DATABASE_URL` | Conexão com o Postgres (o exemplo local está no `.env.example`) |
| `TELEGRAM_BOT_TOKEN` | Token do bot de dev |
| `TELEGRAM_OWNER_ID` | Seu ID numérico no Telegram; só ele é atendido |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Chave e modelo do Gemini |
| `PORT`, `TZ` | Opcionais: `3000` e `America/Sao_Paulo` por padrão |

> [!WARNING]
> Não use o token do bot de produção na sua máquina. Dois processos com o
> mesmo token em long polling derrubam um ao outro (erro 409 Conflict).

## Uso

No Telegram, com o bot de dev:

```
você: ontem 18 num açaí e 120 no mercado
bot:  ✅ 2 gastos registrados
      • R$ 18,00 — açaí (alimentação) — 04/10
      • R$ 120,00 — mercado (mercado) — 04/10
      Total: R$ 138,00
      [↩️ Desfazer]
```

Comandos: `/exportar`, `/resumo`, `/ultimos` e `/ajuda`. Pedidos em
linguagem natural ("quanto gastei em setembro?") também funcionam.

Fora de produção há rotas HTTP para validar sem o Telegram:

```bash
curl -X POST localhost:3000/dev/gastos/texto \
  -H 'Content-Type: application/json' \
  -d '{"texto":"gastei 32,50 de uber"}'

curl 'localhost:3000/dev/exportar?inicio=2026-10-01&fim=2026-10-31&formato=csv'
```

## Testes

```bash
pnpm test               # unidade (domínio e aplicação, com fakes)
pnpm test:integration   # repositório contra Postgres real (banco economizaai_test)
pnpm test:e2e           # rotas HTTP
pnpm test:cov           # cobertura
pnpm lint
```

> [!NOTE]
> `pnpm test:ia` chama o Gemini de verdade e gasta cota. Ele é manual e não
> roda no CI.

## Fluxo de desenvolvimento

`develop` é a homologação e `main` é a produção. Tudo entra na `develop`, o
CI roda, e só um PR `develop → main` com o CI verde chega à produção. Os
commits seguem [Conventional Commits](https://www.conventionalcommits.org/),
verificados pelo commitlint. As regras completas estão no
[CLAUDE.md](./CLAUDE.md#git--branches-commits-prs-e-merges).

## Deploy

A produção roda como container Docker no Easypanel. O Auto Deploy do
Easypanel fica desligado: o job `deploy` do CI dispara o deploy só depois
de `ci` e `gitleaks` passarem num push na `main`, autenticando por um
service token do Cloudflare Access restrito ao caminho de deploy. Se a `main` já avançou além do commit
testado, o job `deploy` termina verde sem chamar o Easypanel e a execução do
commit mais novo faz o deploy dele.

Num push na `main`, o CI gera e escaneia a imagem, publica no GHCR com
uma atestação de proveniência, e o Easypanel faz o deploy dessa mesma imagem.

## Documentação

- [CLAUDE.md](./CLAUDE.md): contexto, arquitetura e regras de trabalho

## Licença

Projeto pessoal, sem licença de uso (`UNLICENSED`). Todos os direitos
reservados a Augusto Bernardo.
