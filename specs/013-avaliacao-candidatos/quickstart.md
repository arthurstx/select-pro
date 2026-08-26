# Quickstart — FEAT-0013 Avaliação dos candidatos

Validação manual via `wrangler dev` + `curl`. Requer: edição corrente, grupos já
organizados (FEAT-0012, `POST /groups/organize`) com ao menos um grupo presencial contendo
candidatos e pelo menos 1 avaliador/host alocado.

## Cenário 1 — avaliador vê a lista do próprio grupo

```bash
curl http://localhost:8787/evaluations/my-group -H "Cookie: $AVALIADOR_TOKEN"
```

**Esperado**: `200`, candidatos do grupo do avaliador, `myEvaluation: null` para quem ele
ainda não avaliou.

## Cenário 2 — avaliador registra uma avaliação

```bash
curl -X PUT http://localhost:8787/evaluations/candidates/<candidateId> \
  -H "Cookie: $AVALIADOR_TOKEN" -H "Content-Type: application/json" \
  -d '{"scores":{"raciocinio_logico":4,"trabalho_equipe":5,"lideranca":3,"proatividade":4,"comunicacao":5},"overallColor":"GREEN","feedback":"Boa comunicação."}'
```

**Esperado**: `200`, `data.overallColor: "GREEN"`. Repetir o `GET` do Cenário 1: esse
candidato agora tem `myEvaluation` preenchido.

## Cenário 3 — reenviar edita, não duplica

Repetir o Cenário 2 com notas diferentes para o mesmo candidato.

**Esperado**: `200`; `evaluationCount` desse candidato no `GET /evaluations/my-group`
continua o mesmo de antes (não incrementou).

## Cenário 4 — avaliar candidato de outro grupo é bloqueado

```bash
curl -X PUT http://localhost:8787/evaluations/candidates/<candidateIdDeOutroGrupo> \
  -H "Cookie: $AVALIADOR_TOKEN" -H "Content-Type: application/json" \
  -d '{"scores":{"raciocinio_logico":3,"trabalho_equipe":3,"lideranca":3,"proatividade":3,"comunicacao":3},"overallColor":"YELLOW"}'
```

**Esperado**: `409 CANDIDATE_NOT_IN_EVALUATOR_GROUP`.

## Cenário 5 — veto vermelho reprova com 1 avaliação só

Registrar 1 avaliação `overallColor: "RED"` para um candidato sem nenhuma outra avaliação.

```bash
curl http://localhost:8787/evaluations/admin/candidates -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: esse candidato aparece com `evaluationCount: 1`, `verdict: "reprovado"` (D2
não espera D6).

## Cenário 6 — mínimo de 2 avaliações (D6)

Um candidato com 1 avaliação `GREEN` e nenhuma outra.

**Esperado**: `verdict: "pendente"` em `GET /evaluations/admin/candidates`.

## Cenário 7 — aprovado com 2+ avaliações, nenhuma vermelha

Um candidato com 2 avaliações `GREEN`/`YELLOW`.

**Esperado**: `verdict: "aprovado"`.

## Cenário 8 — detalhe do admin

```bash
curl http://localhost:8787/evaluations/admin/candidates/<candidateId> -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: `200`, `data.evaluations` com uma entrada por avaliador, cada uma com as 5
notas, cor, comentário e `evaluatorName`.

## Cenário 9 — sem processo corrente

**Esperado**: `409 NO_ACTIVE_SELECTION_PROCESS` nas 4 rotas.
