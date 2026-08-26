# Contrato HTTP — FEAT-0012 Organização automática de grupos

`GroupCandidate` **não inclui `gender`** — mesma postura de `CandidateCheckinItemSchema`
(FEAT-0005): gênero é dado sensível de inscrição, nunca exposto por pessoa numa listagem
comum. O algoritmo usa gênero só internamente, no backend, para aplicar D1; o resultado de
uma violação chega ao front como o aviso `GENDER_RULE_VIOLATED` (sem identificar quem),
igual a como `attendanceSummary` já agrega em vez de expor `saturday_restriction` por linha.

Todas as rotas abaixo são **admin-only** (`ADMIN_ONLY = [requireAuth,
requireRole(ROLES.ADMIN)]`, mesmo padrão de `member-checkin.routes.ts`/`rooms.routes.ts`).
Schemas Zod completos vivem em `shared/src/schemas/group.schema.ts` — este documento é a
referência de forma/status, não a fonte da verdade (essa é o schema em si, Princípio I).

## `POST /groups/organize`

Roda o algoritmo (research.md D-tech4) para a edição corrente, descarta qualquer organização
anterior (FR-011) e grava a nova.

**Response `200`** — `OrganizeResultResponseSchema`:

```json
{
  "data": {
    "groups": [
      {
        "id": "uuid",
        "name": "Sala 1 - Grupo 1",
        "modality": "presencial",
        "room": { "id": "uuid", "name": "Sala 1" },
        "candidates": [
          { "id": "uuid", "name": "Fulana", "attendance": "presencial" }
        ],
        "evaluators": [{ "userId": "uuid", "name": "Beltrano", "role": "avaliador" }]
      },
      {
        "id": "uuid",
        "name": "Grupo Online 1",
        "modality": "online",
        "room": null,
        "candidates": [
          { "id": "uuid", "name": "Ciclana", "attendance": "online" }
        ],
        "evaluators": []
      }
    ],
    "unallocatedCandidateCount": 0
  }
}
```

**Erros**:

| Status | Código | Quando |
|---|---|---|
| 409 | `NO_ACTIVE_SELECTION_PROCESS` | sem edição corrente (mesmo código já usado em check-in) |
| 409 | `NO_CANDIDATES_PRESENT` | nenhum candidato com check-in feito na edição |
| 409 | `NO_ROOMS_AVAILABLE` | há candidatos presenciais presentes, mas nenhuma sala cadastrada (FR-012) |

## `GET /groups`

Lista a organização atual da edição corrente (FR-008), sem rodar o algoritmo.

**Response `200`**: mesmo shape de `data` do `POST /groups/organize`, com
`unallocatedCandidateCount` sempre `0` (não é recalculado aqui — só existe logo após um
`organize`; ver Assumptions).

**Erros**: `409 NO_ACTIVE_SELECTION_PROCESS`. Ausência de organização (nunca organizado
ainda) **não é erro** — `groups: []`.

## `PATCH /groups/:groupId/candidates/:candidateId`

Move um candidato já alocado para `groupId` (FR-009). `candidateId` deve já estar alocado a
algum grupo da mesma edição (resultado de um `organize` anterior) — não é uma forma de
adicionar à organização quem ficou de fora (`unallocatedCandidateCount`), isso é assumption
documentada como fora de escopo.

**Response `200`** — `MoveResultResponseSchema`:

```json
{
  "data": {
    "groups": ["<GroupSummary do grupo de origem>", "<GroupSummary do grupo de destino>"],
    "warning": "GENDER_RULE_VIOLATED"
  }
}
```

`warning` é `null` quando o movimento não deixa nenhum grupo envolvido com exatamente 1
mulher; caso contrário carrega `"GENDER_RULE_VIOLATED"` — o corpo ainda é `200` (FR-010: o
sistema avisa, mas não bloqueia o ajuste manual).

**Erros**:

| Status | Código | Quando |
|---|---|---|
| 404 | `GROUP_NOT_FOUND` | `groupId` não existe na edição corrente |
| 404 | `CANDIDATE_NOT_ALLOCATED` | `candidateId` não está em nenhum grupo da edição corrente |
| 409 | `GROUP_MODALITY_MISMATCH` | mover entre grupo presencial e online (FR-003, invariante rígida — nunca um aviso, sempre bloqueado) |

## `PATCH /groups/:groupId/evaluators/:userId`

Mesmo contrato de `PATCH /groups/:groupId/candidates/:candidateId`, para avaliador/host.
`warning` nunca se aplica (D1 é sobre candidatos) — sempre `null`.

**Erros**: mesmos códigos, trocando `CANDIDATE_NOT_ALLOCATED` por
`EVALUATOR_NOT_ALLOCATED`. Adicionalmente, `409 GROUP_MODALITY_MISMATCH` nunca ocorre na
prática para o destino "online" porque grupo online não tem `PATCH .../evaluators` alvo
válido — mover um avaliador para um `groupId` de modalidade online é rejeitado com o mesmo
código (grupo online não aceita avaliador, FR-007).
