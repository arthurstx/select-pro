# Implementation Plan: Status de membro e aprovação de cadastro

**Branch**: `feat/status-membro-aprovacao` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-member-status-approval/spec.md`

## Summary

`MemberStatus` passa de 4 para 3 valores reconhecidos (`active`/`inactive`/`trainee`,
D3), e só `active` continua criando conta direto em `POST /auth/register`.
`inactive` (pós-júnior) e `trainee` geram uma solicitação pendente
(`signup_requests`), notificam `gentegestao@cimatecjr.com.br` via a
`Mailer` já existente, e a conta só é criada quando um admin **autenticado**
aprova — pelo painel ou por um link de e-mail que expõe os dados sem decidir
nada (FR-007) e exige login só na escrita (decisão de 2026-08-24, ver
`research.md` R2, motivada por SC-005 exigir autoria sem exceção contra uma
caixa de e-mail compartilhada).

## Technical Context

**Language/Version**: TypeScript 5.x, mesmo `tsconfig` do workspace `api`

**Primary Dependencies**: Hono + `@hono/zod-openapi` (rotas), Zod (contratos
em `shared`), `Mailer`/`ResendMailer` já existente (`api/src/lib/mailer.ts`)

**Storage**: Cloudflare D1 (SQL puro, sem ORM) — migration aditiva `0008`

**Testing**: Vitest + `@cloudflare/vitest-pool-workers`, padrão
`<feature>.service.test.ts` + `<feature>.routes.test.ts` (Princípio V)

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo `front/` + `api/` + `shared/`)

**Performance Goals**: sem meta nova além do que já existe — nenhuma
operação desta feature usa PBKDF2 (a senha do pedido pendente já vem
hasheada de `register()`; aprovar não re-hasheia)

**Constraints**: 10 ms CPU/invocação (Princípio IV) — geração/hash de token
opaco é SHA-256, mesmo custo desprezível de `resetPassword()`; nenhuma nova
chamada de criptografia cara

**Scale/Scope**: 3 tabelas de domínio inalteradas + 2 novas
(`signup_requests`, `signup_approval_tokens`); 1 rota estendida
(`/auth/register`) + 3 rotas novas; 3 telas novas no front
(fila de solicitações, confirmação de acesso, "cadastro em análise" — já
prototipadas no Stitch, ver nota em `research.md` R2 sobre revisão pendente
do mockup de confirmação)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ Todo schema novo (`SignupRequest*`, `RegisterPendingResponseSchema`, `SignupDecisionSchema`) entra em `shared/src/schemas/auth.schema.ts`. Nenhum DTO local no `front/` ou `api/`. |
| II. Spec antes de código | ✅ `spec.md` aprovado antes deste plan; mudança de contrato de API e schema de banco — feature "relevante" por definição da própria constitution. |
| III. Banco insubstituível | ✅ Migration `0008` é puramente aditiva (2 tabelas novas, sem `ALTER`/`DROP` em tabela existente) — dispensa `MAINTENANCE_MODE`, mesma classificação da `0005`. |
| IV. Orçamento de plataforma | ✅ Nenhuma operação nova de CPU cara. Rate limiting do WAF (recurso único, já disputado por `/auth/*` desde a FEAT-0003) não é alocado por código — fica registrado como dependência operacional, não deste plan. |
| V. Backend com testes | ✅ `signup-requests.service.test.ts` + `signup-requests.routes.test.ts` novos; `auth.service.test.ts`/`auth.routes.test.ts` atualizados para a bifurcação de `register()`. |

Nenhuma violação. Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
specs/008-member-status-approval/
├── plan.md              # este arquivo
├── research.md          # R1-R5, decisões técnicas
├── data-model.md         # schema D1 + contratos shared
├── quickstart.md        # roteiro de validação ponta a ponta
├── contracts/
│   └── signup-requests.md
└── tasks.md              # gerado por /speckit-tasks (ainda não existe)
```

### Source Code (repository root)

Segue a Arquitetura em Camadas já estabelecida (`api/.agents/architecture/SKILL.md`):
`routes/` → `services/` → `repositories/`, composição manual no handler,
sem DI framework. Convenção de nome `[nome].[tipo].ts`.

```text
shared/src/schemas/
├── database.schema.ts        # MemberStatus: 4 → 3 valores
├── member.schema.ts          # MemberStatusSchema, RECOGNIZED_MEMBER_STATUSES,
│                              # isRecognizedMemberStatus, requiresApproval,
│                              # isEligibleToAnchorTrainee (novo)
└── auth.schema.ts             # SignupRequest*, RegisterPendingResponseSchema,
                                # SignupDecisionSchema, 3 códigos de erro novos

api/migrations/
└── 0008-signup-requests.sql   # aditiva — ver data-model.md

api/src/
├── routes/
│   ├── auth.routes.ts               # register(): bifurcação por status (não novo endpoint)
│   └── signup-requests.routes.ts    # NOVO — GET lista, GET by-token, POST decision
├── services/
│   ├── auth.service.ts              # register() delega a SignupRequestsService quando requiresApproval()
│   └── signup-requests.service.ts   # NOVO — create/list/decide, e-mails via defer()
├── repositories/
│   ├── auth.repository.ts            # + createApprovedMemberAccount (sem sessão, ver data-model.md)
│   └── signup-requests.repository.ts # NOVO
├── core/errors/
│   └── auth-errors.ts                 # + SignupRequestNotFoundError,
│                                       #   SignupRequestExpiredError,
│                                       #   SignupRequestAlreadyDecidedError
└── lib/
    └── mailer.ts                       # Mailer ganha sendSignupApprovalRequest() e
                                          # sendSignupDecisionResult() — SEM criar mailer novo

api/test/
├── auth.service.test.ts / auth.routes.test.ts        # atualizados
└── signup-requests.service.test.ts / signup-requests.routes.test.ts  # novos

front/app/(auth)/
├── cadastro-em-analise/          # NOVO — US1, "aguardando análise"
└── solicitacoes/[token]/          # NOVO — US2, tela de decisão (GET público + gate de login)

front/app/painel/
└── solicitacoes/                  # NOVO — US3, fila do admin
```

**Structure Decision**: `signup-requests` ganha router/service/repository
próprios em vez de crescer dentro de `auth.*`. `auth.service.ts` só adquire
uma dependência nova (`SignupRequestsService`, injetada como as demais) e um
`if (requiresApproval(member.status))` no início de `register()` — o resto do
método (validação de membro, conflito de email) não muda. Reaproveita
`hashPassword`, `generateOpaqueToken`/`hashOpaqueToken` e o padrão
`parseUniqueConstraint` já existentes; nenhuma dependência nova no
`package.json`.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar (ver Constitution Check).*
