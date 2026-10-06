# EconomizaAI — Contexto do Projeto

> Leia este arquivo, o `ROADMAP.md` e o `SECURITY.md` antes de qualquer
> tarefa. O roadmap é a fonte de verdade do que fazer; este arquivo, de
> **como**; o SECURITY.md, do que é **inaceitável** (prevalece em conflito).

## Agentes

Inicie com `claude --agent orquestrador`. O orquestrador planeja e delega;
os especialistas ficam em `.claude/agents/` e não criam outros subagentes
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`).

| Subagente | Papel |
|---|---|
| `orquestrador` | Sessão principal: Passo 0, delegação, verificação, relatório, commits |
| `implementador-tdd` | `domain/` e `application/` com TDD estrito |
| `integrador-infra` | `infrastructure/` e `presentation/` (TypeORM, IA, Telegram, exportadores) |
| `revisor-codigo` | Revisão read-only: Clean Code, SOLID, fronteiras, testes |
| `devops` | Docker, CI, Dependabot, documentação de deploy |

Fluxo por etapa: Passo 0 → implementação → revisão → gate de segurança
(SECURITY.md seção 5) → verificação → aprovação do dono → commit.

## Segurança (resumo — detalhes no SECURITY.md)

- Proibido ler `.env` (regras `deny` + hook `protege-segredos.mjs`).
- Proibido SQL concatenado; saída de LLM sempre validada por zod.
- Owner guard é o primeiro middleware do Telegram.
- Nunca logar tokens, chaves, `DATABASE_URL` ou a URL de `getFileLink`.
- `/dev/*` só fora de produção, com teste.
- Dependência nova, skill nova ou mudança em `.claude/**` exige aprovação do dono.
- Agentes não acessam a VPS, o Easypanel nem serviços de terceiros além das
  APIs que o próprio app usa.

## O que é

Bot de Telegram pessoal (um único usuário) que recebe mensagens de texto ou
áudio sobre gastos ("ontem gastei 32,50 de Uber") e usa IA gratuita para
extrair valor, categoria, descrição e data, salvando em Postgres. Exporta as
movimentações do mês em CSV/Markdown para análise manual — os dados nunca
saem da VPS a não ser por exportação explícita do dono.

Projeto de portfólio (GitHub `devguto`): a estrutura e a qualidade do código
importam tanto quanto a funcionalidade.

## Stack

- NestJS + TypeScript (strict), **pnpm**
- TypeORM + Postgres **17**, **migrations** (nunca `synchronize`)
- Telegraf em **long polling** (a VPS não tem domínio — webhook não é opção)
- IA para **extrair**: **Gemini** (principal; entende áudio nativamente,
  structured output). Fallback para **Groq** (Whisper + LLM) adiado: por ora só Gemini.
  Hermes foi avaliado e descartado (sem áudio, free tier menor).
- Validação: **zod** (env, respostas de IA e corpo HTTP via `ZodValidationPipe` com `.strict()`)
- Testes: Vitest (padrão do Nest 12); Postgres real para testes de integração
- Lint: oxlint type-aware; formatação: Prettier. Módulos: ESM (`"type": "module"`, imports com `.js`)
- Deploy: Docker multi-stage no **Easypanel**, repositório no GitHub

## Arquitetura (Clean Architecture, pragmática)

```
modules/gastos/
  domain/          TypeScript puro: Dinheiro, Categoria, Gasto, erros, port do repositório
  application/     casos de uso + ports (ExtratorDeGastos, Exportador, Relogio)
  infrastructure/  TypeORM, Gemini, Groq, Fallback, CSV, Markdown
  presentation/    Telegram (handlers, owner guard) e HTTP de dev
  gastos.module.ts único lugar que liga ports a adapters
```

**Regras invioláveis:**
- `domain` não importa Nest, TypeORM, Telegraf nem SDKs de IA.
- Handlers e controllers não têm regra de negócio — só traduzem entrada/saída.
- Trocar provedor de IA ou formato de exportação = nova classe, sem mexer em caso de uso.
- **Não adicionar** CQRS, event bus, mediator ou abstrações sem uso concreto.

## Regras de domínio

- Valor em **centavos inteiros** (`decimal` do Postgres vira `string` no TypeORM).
- **Categorias fechadas:** `alimentacao`, `mercado`, `transporte`, `moradia`,
  `saude`, `lazer`, `educacao`, `assinaturas`, `vestuario`, `outros`.
  Desconhecida → `outros`.
- `dataGasto` (quando aconteceu, extraída pela IA) ≠ `criadoEm` (quando registrou).
- Uma mensagem pode conter vários gastos; registro é **tudo ou nada**.
- Fuso de referência: `America/Sao_Paulo` (limites de mês incluídos).
- Saída de LLM **sempre** validada pelo schema zod antes de virar domínio.

## Fluxo de trabalho obrigatório

1. **Passo 0:** investigar o estado atual antes de alterar qualquer coisa.
2. Uma etapa do `ROADMAP.md` por vez. Ao fim, **parar e aguardar aprovação**.
3. **TDD** em `domain` e `application`: teste falhando → implementação mínima → refactor.
   Adapters de SDK externos: testar com mock na fronteira; não gastar cota de IA no CI.
4. Validar com **curl** (endpoints `/dev/*`, só fora de produção), `psql` ou Telegram.
5. **Conventional commits** em português, pequenos e incrementais.
6. Nunca quebrar comportamento existente; nunca commitar `.env` nem logar segredos.
7. Atualizar a seção "Status" abaixo ao concluir cada etapa.
8. **Dúvidas antes de agir:** usar a skill `brainstorming` para tirar **todas**
   as dúvidas com o dono antes de planejar ou implementar.
9. **Subagente especialista por tarefa:** cada tarefa vai ao subagente da sua
   área (tabela "Agentes"). Tarefas independentes rodam **em paralelo** com a
   skill `superpowers:dispatching-parallel-agents`, cada uma no seu worktree.

O autor prefere explicações do raciocínio por trás das decisões e quer que
riscos e pontos fracos sejam apontados antes de validar uma ideia.

## Ambientes — atenção (fonte de bugs recentes)

| | Local | Produção (Easypanel) |
|---|---|---|
| Onde o Nest roda | Direto no host (fora do Docker) | Container no projeto `economiza-ai` |
| Host do banco | `localhost:5432` | `<HOST_INTERNO_DO_BANCO>:5432` (só resolve dentro do Easypanel) |
| Banco | `economizaai` (+ `economizaai_test`) | `economiza-ai` |
| Bot do Telegram | bot de **dev** (token próprio) | bot de **produção** |

- Nomes de serviço do docker-compose só resolvem entre containers, nunca do
  processo Node no host.
- `POSTGRES_PASSWORD` só vale na criação do volume; mudar depois exige
  `docker compose down -v` ou `ALTER USER`.
- Dois processos com o mesmo token de bot em long polling → erro **409 Conflict**.
- Máquina de dev com memória limitada: evitar vários processos de watch/build em paralelo.
- Máquina recém-formatada: confirmar o SO no Passo 0. Se for Windows, trabalhar
  dentro do **WSL2 (Ubuntu)**; hooks e scripts assumem shell POSIX.

## Variáveis de ambiente

Ver `src/config/env.schema.ts` (validadas no boot) e `.env.example`.
Nomes de modelos de IA ficam no `.env` — mudam com frequência no free tier.

## Status

O código do primeiro protótipo foi perdido numa formatação. O projeto
recomeçou do zero em 2026-10-03.

| Etapa | Situação |
|---|---|
| 0 — Passo 0 e scaffold do zero | ✅ |
| 1 — Ferramental e configuração | ✅ |
| 2 — Domínio (TDD) | ✅ |
| 3 — Persistência | ✅ |
| 4 — Caso de uso RegistrarGastos | ✅ |
| 5 — Adapter Gemini | ✅ (texto; test:ia manual ainda não rodado) |
| 6 — Adapter Groq + Fallback | ⏸️ adiada (só Gemini por enquanto) |
| 7 — Telegram texto | 🔧 próxima |
| 8 — Telegram áudio | ⏳ |
| 9 — (removida) | ❌ |
| 10 — Exportação CSV/MD | ⏳ |
| 11 — Docker + Easypanel | ⏳ (Postgres de produção já existe no Easypanel) |
