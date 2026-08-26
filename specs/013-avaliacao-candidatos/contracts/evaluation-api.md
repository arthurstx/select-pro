# Contrato HTTP — FEAT-0013 Avaliação dos candidatos

Schemas Zod completos em `shared/src/schemas/evaluation.schema.ts` — este documento é
referência de forma/status, não a fonte da verdade (Princípio I).

## `GET /evaluations/my-group`

Avaliador/host autenticado (`requireAuth` + papel `avaliador` ou `host` — reaproveita
`ROLES.AVALIADOR`; qualquer um alocado a grupo pode avaliar, FEAT-0012 não distingue).
Lista os candidatos do grupo presencial do usuário logado na edição corrente.

**Response `200`**:

```json
{
  "data": {
    "groupName": "Sala 1 - Grupo 1",
    "candidates": [
      {
        "id": "uuid",
        "name": "Fulana",
        "evaluationCount": 1,
        "myEvaluation": null
      },
      {
        "id": "uuid",
        "name": "Ciclano",
        "evaluationCount": 2,
        "myEvaluation": {
          "scores": {
            "raciocinio_logico": 4,
            "trabalho_equipe": 5,
            "lideranca": 3,
            "proatividade": 4,
            "comunicacao": 5
          },
          "overallColor": "GREEN",
          "feedback": "Ótima comunicação, participou bastante."
        }
      }
    ]
  }
}
```

`myEvaluation` nunca revela avaliações de outra pessoa — só `evaluationCount` soma o total
(FR-005).

**Erros**:

| Status | Código | Quando |
|---|---|---|
| 409 | `NO_ACTIVE_SELECTION_PROCESS` | sem edição corrente |
| 409 | `NOT_IN_ANY_GROUP` | o avaliador logado não está alocado a nenhum grupo presencial da edição — mesma resposta de "sem grupo formado ainda" |

## `PUT /evaluations/candidates/{candidateId}`

Cria ou atualiza a avaliação do avaliador logado sobre `candidateId` (FR-002/FR-004).

**Request**:

```json
{
  "scores": {
    "raciocinio_logico": 4,
    "trabalho_equipe": 5,
    "lideranca": 3,
    "proatividade": 4,
    "comunicacao": 5
  },
  "overallColor": "GREEN",
  "feedback": "Ótima comunicação, participou bastante."
}
```

`scores` exige as 5 chaves, cada uma `0`-`5` inteiro (validado no schema Zod). `feedback` é
opcional (`string` ou omitido/`null`).

**Response `200`**: mesmo shape do `myEvaluation` de `GET /evaluations/my-group`.

**Erros**:

| Status | Código | Quando |
|---|---|---|
| 409 | `NO_ACTIVE_SELECTION_PROCESS` | sem edição corrente |
| 404 | `CANDIDATE_NOT_FOUND` | `candidateId` não existe |
| 409 | `NOT_IN_ANY_GROUP` | avaliador não está em nenhum grupo presencial da edição |
| 409 | `CANDIDATE_NOT_IN_EVALUATOR_GROUP` | candidato existe, mas não está no mesmo grupo do avaliador (FR-003) |

## `GET /evaluations/admin/candidates`

Admin-only. Lista candidatos presentes da edição corrente com contagem de avaliações e
veredito (FR-007).

**Response `200`**:

```json
{
  "data": {
    "candidates": [
      { "id": "uuid", "name": "Fulana", "evaluationCount": 1, "verdict": "pendente", "weightedScore": 4.2 },
      { "id": "uuid", "name": "Ciclano", "evaluationCount": 0, "verdict": "pendente", "weightedScore": null }
    ]
  }
}
```

**Erros**: `409 NO_ACTIVE_SELECTION_PROCESS`.

## `GET /evaluations/admin/candidates/{candidateId}`

Admin-only. Detalhe de todas as avaliações de um candidato (FR-008).

**Response `200`**:

```json
{
  "data": {
    "id": "uuid",
    "name": "Fulana",
    "verdict": "reprovado",
    "evaluations": [
      {
        "evaluatorName": "Beltrano",
        "scores": { "raciocinio_logico": 2, "trabalho_equipe": 1, "lideranca": 2, "proatividade": 3, "comunicacao": 2 },
        "overallColor": "RED",
        "feedback": "Não se engajou na dinâmica.",
        "weightedScore": 1.95
      }
    ]
  }
}
```

**Erros**: `409 NO_ACTIVE_SELECTION_PROCESS`, `404 CANDIDATE_NOT_FOUND`.
