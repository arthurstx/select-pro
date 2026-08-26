# Implementation Plan: Descrição de necessidades especiais

**Branch**: `feat/necessidades-especiais-descricao` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-necessidades-especiais-descricao/spec.md`

## Summary

Adicionar um campo de texto livre (`specialNeedsDescription`, até 500 caracteres) condicional ao boolean já existente `specialNeeds` (`special_needs` em `candidate_applications`). Obrigatório quando `specialNeeds = true`, ausente/ignorado quando `false`. Toca: contrato Zod (`AvailabilityStepSchema` em `candidate.schema.ts`, `CandidateApplicationDetailSchema` em `dashboard.schema.ts`), migration aditiva `0011` em `candidate_applications`, repositório/serviço de candidatos (gravação) e de dashboard (leitura no detalhe, não no agregado), e front (etapa 5 do wizard de inscrição + painel de detalhe do candidato). Não toca listagem, check-in nem o contador agregado do dashboard — por decisão de spec (FR-008 a FR-010), a descrição nunca trafega por essas superfícies.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 20+ para tooling

**Primary Dependencies**: Hono + `@hono/zod-openapi` (api), Next.js 16 / React 19 + `react-hook-form` + `@hookform/resolvers/zod` (front), Zod (shared)

**Storage**: Cloudflare D1 (SQLite) — tabela `candidate_applications`, coluna nova `special_needs_description TEXT` nullable

**Testing**: Vitest + `vitest-pool-workers` (api) — `<feature>.service.test.ts` e `<feature>.routes.test.ts`; `tsc --noEmit` em todos os workspaces; `next build` no front

**Target Platform**: Cloudflare Workers (api) + Vercel (front)

**Project Type**: Web application (monorepo: `front/` + `api/` + `shared/`)

**Performance Goals**: Sem meta nova além do orçamento padrão do Worker (Princípio IV) — a mudança é um campo TEXT a mais em um INSERT/SELECT já existentes, sem I/O adicional, sem custo de CPU perceptível.

**Constraints**: Orçamento de 10ms de CPU por invocação (Princípio IV) — não afetado; migration precisa ser puramente aditiva para dispensar janela de manutenção (Princípio III).

**Scale/Scope**: 1 coluna nova, 1 migration, ~2 schemas Zod alterados, 1 rota existente sem mudança de shape de erro, 2 telas de front alteradas (formulário de inscrição, detalhe do candidato no painel).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Contrato Compartilhado**: PASS. O campo novo é declarado uma única vez em `shared/src/schemas/candidate.schema.ts` (input) e `shared/src/schemas/dashboard.schema.ts` (output de detalhe) — nenhum tipo local duplicado no `front/` ou `api/`.
- **II. Spec Antes de Código**: PASS. Spec em `specs/014-necessidades-especiais-descricao/spec.md` já escrita e validada (checklist completo) antes deste plano.
- **III. O Banco É Insubstituível**: PASS. Migration `0011` é `ALTER TABLE candidate_applications ADD COLUMN special_needs_description TEXT` — puramente aditiva (não mexe em UNIQUE/CHECK/FK), não precisa do procedimento de reconstrução da migration `0004`, dispensa janela de manutenção. Dado existente: linhas antigas recebem `NULL` na coluna nova, tratado explicitamente como "não informado" pela spec (FR-007), sem migração de dados históricos.
- **IV. Orçamento da Plataforma**: PASS. Nenhuma chamada de rede/criptografia nova; campo TEXT a mais em query já existente não move a agulha de CPU.
- **V. Backend Novo Vem Com Testes**: PASS (aplicado como "mudança em rota/service existente vem com teste atualizado", já que não é rota nova). Testes existentes de `candidates.service.test.ts`, `candidates.routes.test.ts`, `dashboard.service.test.ts`, `dashboard.routes.test.ts` são estendidos com casos para o campo novo (obrigatoriedade condicional, ausência quando `false`, exposição no detalhe).

Nenhuma violação a registrar em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/014-necessidades-especiais-descricao/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── post-candidate.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/
└── src/schemas/
    ├── candidate.schema.ts     # AvailabilityStepSchema += specialNeedsDescription (superRefine)
    └── dashboard.schema.ts     # CandidateApplicationDetailSchema += specialNeedsDescription (opcional/nullable)

api/
├── migrations/
│   └── 0011-special-needs-description.sql   # ALTER TABLE aditivo
├── src/
│   ├── repositories/
│   │   ├── candidates.repository.ts   # INSERT passa a gravar special_needs_description
│   │   └── dashboard.repository.ts    # SELECT de detalhe passa a ler special_needs_description (não no agregado)
│   └── services/
│       ├── candidates.service.ts      # mapeia specialNeedsDescription -> special_needs_description
│       └── dashboard.service.ts       # mapeia special_needs_description -> specialNeedsDescription no detalhe
└── test/
    ├── candidates.service.test.ts     # + casos: obrigatório quando true, ausente quando false
    ├── candidates.routes.test.ts      # + caso: payload 400 quando true sem descrição
    ├── dashboard.service.test.ts      # + caso: detalhe expõe a descrição
    └── dashboard.routes.test.ts       # + caso: agregado NÃO expõe descrição

front/
└── app/
    ├── inscricao/
    │   ├── _components/availability-step-form.tsx   # textarea condicional
    │   └── _lib/wizard-guards.ts                     # isStepComplete (case 5) exige descrição quando true
    └── painel/
        └── _components/candidate-detail-sheet.tsx    # exibe descrição quando specialNeeds === true
```

**Structure Decision**: Monorepo existente (Opção "Web application"), sem pastas novas — a feature é uma extensão pontual de arquivos já existentes nos três workspaces (`shared`, `api`, `front`), seguindo o fluxo do Princípio II (contrato → api → front).

## Complexity Tracking

*Nenhuma violação da Constitution Check — seção não aplicável.*
