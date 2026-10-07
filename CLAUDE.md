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
| `seguranca` | Gate de segurança read-only: AppSec, DevSecOps, CI/CD, container, infra (documental), OSINT, OWASP Top 10:2025 e LLM |
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
- grammY em **long polling** (a VPS não tem domínio — webhook não é opção)
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
  application/     casos de uso + ports (InterpretadorDeMensagem, Exportador, Relogio)
  infrastructure/  TypeORM, Gemini, Groq, Fallback, CSV, Markdown
  presentation/    Telegram (handlers, owner guard) e HTTP de dev
  gastos.module.ts único lugar que liga ports a adapters
```

**Regras invioláveis:**
- `domain` não importa Nest, TypeORM, grammY nem SDKs de IA.
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
5. **Git:** seguir **sempre** a seção "Git — branches, commits, PRs e merges".
6. Nunca quebrar comportamento existente; nunca commitar `.env` nem logar segredos.
7. Atualizar a seção "Status" abaixo ao concluir cada etapa.
8. **Dúvidas antes de agir:** usar a skill `brainstorming` para tirar **todas**
   as dúvidas com o dono antes de planejar ou implementar.
9. **Subagente especialista por tarefa:** cada tarefa vai ao subagente da sua
   área (tabela "Agentes"). Tarefas independentes rodam **em paralelo** com a
   skill `superpowers:dispatching-parallel-agents`, cada uma no seu worktree.

O autor prefere explicações do raciocínio por trás das decisões e quer que
riscos e pontos fracos sejam apontados antes de validar uma ideia.

## Git — branches, commits, PRs e merges

Regras obrigatórias. Base: Conventional Commits 1.0.0, Conventional Branch,
git-flow (Driessen), Google Engineering Practices e documentação do GitHub.
Regra do dono prevalece sobre a referência externa.

### Branches
- **`main`** = produção; **`develop`** = homologação. Nada é commitado
  direto na `main`: ela só recebe PR `develop → main` (ou `hotfix/*`) com o
  CI verde.
- **Branch extra só quando necessário:** mudança que leva mais de uma sessão,
  que precisa de PR para revisão ou que roda em paralelo (worktree). O resto é
  commitado direto na `develop`.
- **Proibido branch de docs.** Documentação vai direto na `develop`.
- Nome: `<tipo>/<o-que-muda>`, sai da `develop` e volta para ela.
  - Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`;
    `hotfix` sai da `main` e volta para `main` **e** `develop`.
  - `<o-que-muda>`: kebab-case, minúsculas, `a-z 0-9 -`, sem acento, sem `_`,
    sem `--`, sem hífen no início ou no fim. Curto (2 a 5 palavras), dizendo
    **o que muda**, não a etapa nem a ferramenta: `feat/entradas-e-faturas`,
    `fix/fuso-no-resumo-mensal`. Nunca `feat/etapa-12`, `wip`, `teste`,
    `claude/...`. Se houver issue: `feat/42-entradas-e-faturas`.
- Branch mesclado é **apagado** (local e remoto) logo após o merge. Branch
  de worktree segue as mesmas regras.
- Nunca `push --force` em `main`/`develop`; nunca reescrever histórico já
  enviado. Rebase só em branch local ou só seu (`--force-with-lease`).

### Commits (Conventional Commits 1.0.0)
- **Sempre** Conventional Commits, com **título e corpo em inglês**.
- **Proibido** o rodapé `Co-Authored-By` (nem de IA, nem de ferramenta).
- Formato: `<tipo>(<escopo>)!: <descrição>` + corpo e rodapés opcionais,
  separados por linha em branco.
- Tipos: `feat` (funcionalidade), `fix` (correção), `refactor` (sem mudar
  comportamento), `perf`, `test`, `docs`, `build` (build e dependências),
  `ci`, `chore`, `style` (só formatação), `revert`.
- Escopo opcional, substantivo do módulo: `gastos`, `telegram`, `ia`,
  `exportacao`, `config`, `deps`, `security`.
- Descrição em inglês, minúscula, sem ponto final, no imperativo
  ("add", "fix", não "added"/"adds"), completando "if applied, this commit
  will…". Cabeçalho com até 72 caracteres (ideal ≤ 50).
- Corpo em inglês (quebrado em 72 colunas) explica **o quê e por quê**, não
  o como. Obrigatório quando o cabeçalho não basta.
- Quebra de compatibilidade: `!` no cabeçalho **e** rodapé
  `BREAKING CHANGE: <o que quebra e como migrar>`.
- Rodapés: só `Closes #N` / `Refs #N` e `BREAKING CHANGE:`.
- `revert: <cabeçalho original>` com `This reverts commit <sha>.` e o motivo.
- **Um commit = uma mudança lógica** que compila e passa nos testes. Teste
  junto do código que ele cobre; refactor em commit separado de feature/fix.
  Se cabe em dois tipos, são dois commits.
- Proibido: `--no-verify`, commit de WIP na `develop`, mensagens vagas
  ("ajustes", "fix bug", "wip").
- As mensagens sugeridas no `ROADMAP.md` e nas specs indicam só o tema; a
  mensagem final segue estas regras (inglês, imperativo).

### Pull requests
- **Um propósito por PR**, pequeno: ideal até ~400 linhas alteradas (sem
  lockfile nem gerado). Maior que isso → dividir (por camada ou por fatia
  vertical) ou empilhar.
- Título = commit convencional em inglês (vira o commit do squash):
  `feat(gastos): record income and card bills`.
- Descrição em inglês: **What** (2–3 frases), **Why**, **How to test**
  (comandos e resultado), **Risks / breaking changes**, `Closes #N`. Sem
  linha de co-autoria nem de "gerado por".
- Antes de abrir: revisar o próprio diff, CI local (`pnpm lint`, `pnpm test`)
  verde e gate de segurança feito. Não pronto → PR em **draft**.
- Antes de mesclar: CI verde no PR e branch atualizado com o destino.
- Comentário de revisão que revela código confuso → melhorar o código, não
  só responder no PR.

### Merges
| Origem → destino | Método | Por quê |
|---|---|---|
| `feat/*`, `fix/*` etc. → `develop` | **Squash** | 1 PR = 1 commit convencional na `develop`; revert simples |
| `develop` → `main` | **Merge commit** (nunca squash/rebase) | Branch de longa duração: squash repete conflitos e duplica commits; o merge marca cada promoção |
| `hotfix/*` → `main` | **Merge commit**, depois `main` → `develop` | Mantém os dois em sincronia |

- PR `develop → main` com título `chore(release): <summary>` e a lista dos
  commits na descrição.
- **Versão (SemVer 2.0.0):** todo PR para a `main` sobe a `version` do
  `package.json` (MAJOR quebra, MINOR feature, PATCH correção) e move
  `## [Unreleased]` do `CHANGELOG.md` para `## [x.y.z] - AAAA-MM-DD`; o CI
  barra o PR sem isso. O merge na `main` cria a tag `vX.Y.Z`, a GitHub
  Release e a imagem `:vX.Y.Z`. Mudanças que importam ao usuário entram em
  `[Unreleased]` no mesmo PR que as introduz. Releases são **imutáveis**:
  release com problema → nova versão de patch, nunca editar/recriar a tag.
  PR de segurança do Dependabot para a `main` também precisa, no próprio
  branch do bot, de um commit com bump de patch e a seção no CHANGELOG.
- Dependabot abre PRs na `develop` (alertas de **segurança** sempre vão para
  a `main`, branch padrão).

## README.md — regras

Base: Standard Readme, makeareadme.com, documentação do GitHub (READMEs e
badges de workflow). O README é a vitrine do portfólio: responde **o que
é, por que existe, como rodar e como está construído**, nessa ordem.

- **Bilíngue:** `README.md` em **inglês** (padrão) e `README.pt-BR.md` em
  português, com o mesmo conteúdo e um seletor de idioma logo abaixo do
  título (`**English** | [Português](./README.pt-BR.md)`). Mudou um, muda o
  outro no mesmo commit.
- **Ordem:** título → seletor de idioma → badges (sem cabeçalho) → descrição curta (1 frase,
  ≤ 120 caracteres; a versão pt-BR é igual à `description` do `package.json`) → descrição
  longa → sumário (se passar de 100 linhas) → seções (Funcionalidades, Stack,
  Arquitetura, Como rodar, Uso, Testes, Deploy, Documentação) → Licença por
  último.
- **Badges:** no topo, poucos e úteis (2 a 6), mesmo estilo. Primeiro o
  status do CI, com o badge **nativo** do GitHub Actions apontando para o
  **nome do arquivo** do workflow e com `?branch=` explícito
  (`.../actions/workflows/ci.yml/badge.svg?branch=main`), cada badge com
  link para a página de execuções do workflow. Um badge por branch longa
  (`main` e `develop`). Badges de stack via shields.io, só das tecnologias
  centrais. Nada de badge decorativo, de contagem ou de serviço não usado.
- **Stack** em tabela (camada → tecnologia → por quê), versões só onde
  importam (Node, Postgres) e sem repetir o `package.json` inteiro.
- **Como rodar:** pré-requisitos com versão, comandos copiáveis em blocos
  `bash`, na ordem real, com o resultado esperado. Testar os comandos antes
  de documentar.
- **Uso:** exemplos reais (mensagens, comandos, `curl`) com a saída esperada.
- Links internos **relativos** (`./SECURITY.md`); nada de URL absoluta para
  arquivo do próprio repositório.
- GFM: admonitions (`> [!NOTE]`, `> [!WARNING]`) só para o que o leitor não
  pode perder; emojis com moderação; sem HTML desnecessário.
- **Nunca** colocar segredos, tokens, IDs reais, URLs internas da produção
  nem dados de gastos reais; exemplos são fictícios.
- Detalhe longo vai para `docs/` e o README aponta para ele.
- Atualizar o README no mesmo commit/PR que muda o que ele descreve
  (comando, variável, stack, funcionalidade).

## Ambientes — atenção (fonte de bugs recentes)

| | Local | Produção (Easypanel) |
|---|---|---|
| Onde o Nest roda | Direto no host (fora do Docker) | Container no Easypanel |
| Host do banco | `localhost:5432` | host interno do Easypanel (só resolve lá dentro; ver `SECURITY.md` local) |
| Banco | `economizaai` (+ `economizaai_test`) | banco de produção (ver `SECURITY.md` local) |
| Bot do Telegram | bot de **dev** (token próprio) | bot de **produção** |

> Produção fica atrás de Cloudflare (DNS, proxy e Access) e do firewall do
> provedor. Detalhes e riscos aceitos ficam no `SECURITY.md` (local, fora do
> git), seção 7. Agentes não acessam a infraestrutura.

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
| 7 — Telegram texto | ✅ (grammY; Desfazer por registroId) |
| 8 — Telegram áudio | ✅ (só voz; transcrição pelo Gemini) |
| 9 — (removida) | ❌ |
| 10 — Exportação, resumo e últimos | ✅ (texto, voz e comandos) |
| 11 — Docker + Easypanel | 🔧 pipeline pronto (Dockerfile, CI com trivy, deploy após CI verde); falta a configuração do dono e o 1º deploy |

Infraestrutura de produção endurecida e com backup em 04/10/2026
(ver `SECURITY.md` local, seção 7). `SECURITY.md`, `ROADMAP.md`,
`PROMPT_INICIAL.md`, `docs/deploy.md` e `docs/superpowers/` são só locais.
