# Contrato: alocação de avaliador/host a grupo

**Feature**: 025 | **Fase**: 1

Todos os schemas citados vivem em `shared/src/schemas/group.schema.ts` (Princípio I). Nenhum tipo novo é declarado no `api/` ou no `front/`.

---

## 1. `shared` — o que muda

### `GroupErrorCode`
Um código novo, ao lado dos dois vizinhos da mesma categoria (pré-condição da edição que impede organizar):

```
NO_EVALUATORS_PRESENT — nenhum avaliador presente/participando ao organizar o presencial
```

### `classifyPresencialGroup`
Retorno ampliado de `"ideal" | "aceitavel" | "fora_do_ideal"` para incluir `"sem_avaliador"`, avaliado **antes** das demais condições. Ampliar a união é intencional: o compilador passa a exigir que todo chamador trate o estado novo (`research.md`, Decisão 3).

### Sem mudança de shape
`GroupSummary.evaluators` já traz `role`, e `PreviewPresencialResponse.availableEvaluators` já vem completo. Os conjuntos do FR-001/FR-003 são deriváveis no front sem campo novo.

---

## 2. `PUT /groups/{groupId}/evaluators/{userId}` — atribuir

Rota **movida** de `PUT /groups/online/{groupId}/evaluators/{userId}`, agora válida para as duas modalidades.

| | |
|---|---|
| Auth | `requireAuth` + `requireRole(ADMIN)` |
| Semântica | idempotente; **não** exige grupo de origem |
| Response 200 | `GroupResponseSchema` — só o grupo de destino |

**Erros**

| Status | Código | Quando |
|---|---|---|
| 404 | `GROUP_NOT_FOUND` | `groupId` não existe na edição corrente |
| 409 | `NO_ACTIVE_SELECTION_PROCESS` | sem edição corrente |
| 401 / 403 | — | sem sessão / não é admin |

A checagem `modality !== "online"` some. `GROUP_MODALITY_MISMATCH` deixa de ser possível nesta rota (atribuir não tem origem, então não há par de modalidades a comparar).

> **Restrição de uso:** esta rota usa `assignEvaluator`, que apaga todas as linhas do usuário antes de inserir uma. Correto para avaliador, **errado para host** — ver rota 3.

### Convivência com o `PATCH` no mesmo path
`PATCH /groups/{groupId}/evaluators/{userId}` (mover) permanece inalterado. A distinção é semântica e válida em OpenAPI:

| Método | Operação | Exige origem? | Response |
|---|---|---|---|
| `PATCH` | mover | sim (`EVALUATOR_NOT_ALLOCATED` se não) | par origem/destino + aviso de gênero |
| `PUT` | atribuir | não | só o destino |

---

## 3. Troca de host da sala

A troca de host **não** usa a rota 2. Ela precisa apagar todas as linhas do host que sai naquela sala e inserir o que entra em **cada** grupo da sala, num `batch` só — `GroupRepository.replaceRoomHost(roomId, outUserId, inUserId)`.

A superfície HTTP dessa operação é decisão do `tasks`/implementação (rota dedicada de troca de host, ou a rota 2 ganhando um modo de sala). O contrato obrigatório é o comportamento: **um host trocado continua presente em todos os grupos da sala**, nunca colapsado em um.

---

## 4. `POST /groups/organize/presencial` — recusa por falta de avaliador

| | |
|---|---|
| Mudança | novo erro possível |
| Status | 409 |
| Código | `NO_EVALUATORS_PRESENT` |
| Quando | nenhum avaliador presente, ou `evaluatorUserIds` vazio |
| Garantia | nada é gravado; a organização anterior sobrevive |

Host presente não satisfaz a condição (D2).

---

## 5. `POST /groups/preview/presencial` — inalterado

**Continua 200** mesmo com zero avaliadores participando, devolvendo `groups` e `availableEvaluators` normalmente. A recusa vive só na escrita (`research.md`, Decisão 6): a lista de checkboxes do modal é montada a partir de `availableEvaluators`, então um 409 aqui faria o seletor sumir e deixaria sem saída quem desmarcou todos por engano.

---

## 6. Remover da organização

Necessária para o lado "quem sai" da troca. `GroupRepository.removeEvaluator(userId)` já existe e apaga todas as linhas do usuário — serve tanto para avaliador (uma linha) quanto para host (todas as da sala).

O que falta é superfície admin para presencial: hoje só existe `DELETE /groups/online/me`, self-service do próprio avaliador e restrito a online. Forma exata da rota é decisão do `tasks`; o contrato é: **admin**, funciona para as duas modalidades, idempotente (remover quem já não está alocado não é erro).
