# Implementation Plan: Exportação de candidatos em planilha (CSV)

**Branch**: `feat/exportacao-csv` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-exportacao-csv-candidatos/spec.md`

## Summary

Rota admin-only `GET /exports/candidates` que lê `candidates` + `candidate_applications` (com
os mesmos filtros de recorte/busca/data já usados no dashboard, FEAT-0007) e devolve
`text/csv` gerado por concatenação de strings — sem biblioteca de planilha, sem XLSX (custo de
CPU no Worker, Princípio IV). Gênero/etnia só entram quando `include_sensitive=true` é pedido
explicitamente na query, estendendo ao CSV a mesma decisão de privacidade já em vigor no
dashboard/check-in. Toda chamada bem-sucedida grava uma linha em `candidate_export_events`
(nova, migration `0012`, append-only — mesmo espírito de `checkin_events`) antes de devolver o
arquivo; falha ao gravar o registro derruba a exportação inteira (FR-009).

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod — nenhuma dependência nova (CSV é
concatenação de strings, sem lib de planilha)

**Storage**: Cloudflare D1 — migration `0012`, aditiva (1 tabela nova, sem tocar em tabela
existente)

**Testing**: Vitest + `@cloudflare/vitest-pool-workers`, `exports.service.test.ts` +
`exports.routes.test.ts` (Princípio V)

**Target Platform**: Cloudflare Workers (api). Sem mudança de front nesta versão — ver
"Structure Decision".

**Project Type**: web application (monorepo), escopo desta feature restrito a `api`/`shared`

**Performance Goals**: CSV é concatenação de strings sobre um `SELECT` já paginação-livre (sem
`LIMIT`) — mesma classe de custo que `dashboard.repository.listCandidates` sem a paginação;
sem risco de estourar 10ms de CPU na escala assumida (dezenas/centenas de linhas)

**Constraints**: 10 ms CPU/invocação (Princípio IV) — é exatamente o motivo de a spec exigir
CSV e não XLSX; nenhuma outra restrição de plataforma nova

**Scale/Scope**: 1 tabela nova (`candidate_export_events`); 1 arquivo `shared` novo
(`export.schema.ts`); 1 router/service/repository novos na api; sem mudança de schema em
`candidates`/`candidate_applications`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ `ExportCandidatesQuerySchema`/`ExportErrorCode` em `shared/src/schemas/export.schema.ts`. A resposta é `text/csv`, não JSON — não há `Schema` de resposta Zod para o corpo do arquivo (não é um contrato JSON), mas os cabeçalhos de coluna e a ordem são documentados em `data-model.md` como o contrato de fato. |
| II. Spec antes de código | ✅ `spec.md` escrito e revisado (nesta sessão) antes deste plan. |
| III. Banco insubstituível | ✅ Migration `0012` só cria tabela nova + índices — aditiva, sem tocar em tabela existente, sem `MAINTENANCE_MODE`. |
| IV. Orçamento de plataforma | ✅ Motivo declarado da spec inteira: CSV em vez de XLSX. Sem geração de arquivo binário, sem lib de planilha — só `Array.join`. |
| V. Backend com testes | ✅ `exports.service.test.ts` + `exports.routes.test.ts` novos. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/012-exportacao-csv-candidatos/
├── plan.md
├── data-model.md
├── contracts/export.md
└── tasks.md
```

### Source Code (repository root)

```text
shared/src/schemas/
└── export.schema.ts                    # NOVO — ExportCandidatesQuerySchema, ExportErrorCode,
                                         # EXPORT_CSV_COLUMNS (não-sensíveis) e
                                         # EXPORT_SENSITIVE_CSV_COLUMNS (gênero/etnia)

api/migrations/
└── 0012-candidate-export-events.sql    # aditiva — 1 tabela nova + índices

api/src/
├── routes/exports.routes.ts            # NOVO — GET /exports/candidates, [requireAuth, requireRole(ADMIN)]
├── services/exports.service.ts         # NOVO — monta o CSV, resolve recorte, grava auditoria
├── repositories/exports.repository.ts  # NOVO — SELECT de candidatos p/ export + INSERT de auditoria
├── core/errors/export-errors.ts        # NOVO — SelectionProcessNotFoundError já existe em
│                                        # checkin-errors.ts e é reaproveitado, não duplicado
├── lib/csv.ts                          # NOVO — toCsvField()/toCsvRow() (escapamento RFC 4180)
└── index.ts                            # + CORS/maintenanceGuard para /exports/*, monta exportsRouter

api/test/
├── exports.service.test.ts             # novo
├── exports.routes.test.ts              # novo
└── lib/csv.test.ts                     # novo — escapamento RFC 4180 isolado
```

**Structure Decision**: domínio novo (`exports`), reaproveitando
`SelectionProcessRepository`/`SelectionProcessNotFoundError` já existentes (FEAT-0005/0007) em
vez de duplicar a resolução de edição. Sem mudança de front: a spec não pede uma tela nova, e
um link direto `<a href=".../exports/candidates?...">` autenticado por query não é seguro (o
token iria na URL) — a exportação é consumida via chamada autenticada (`Authorization` header)
e download do blob resultante no cliente, o que é trabalho de UI que não está no escopo desta
rodada (spec não lista User Story de front). Documentado como decisão de escopo a validar com
o Arthur.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
