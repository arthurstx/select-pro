# Data Model: Cobertura de avaliadores nos grupos presenciais

**Feature**: 025 | **Fase**: 1

> **Nenhuma migration.** Nenhuma tabela muda de shape e nenhum dado gravado é reinterpretado — o Princípio III não é acionado. O que segue descreve as tabelas existentes só na medida em que esta feature depende do comportamento delas.

## Tabelas envolvidas (inalteradas)

### `group_evaluators`

| Coluna | Observação |
|---|---|
| `group_id` | FK para `groups` |
| `user_id` | **Sem `UNIQUE`** desde a migration `0017` |

A ausência do `UNIQUE(user_id)` é a invariante mais importante desta feature. Ela existe para o **host aparecer em todos os grupos da sua sala** (FEAT-0021), e é o motivo de a troca de host precisar de primitiva própria (`research.md`, Decisão 2). Consequências que o código precisa respeitar:

- um **avaliador** tem no máximo uma linha — garantido por convenção, não pelo schema;
- um **host** tem uma linha por grupo da sala em que atua;
- `findEvaluatorGroup` usa `.first()`, então para um host devolve **um** grupo arbitrário entre os da sala. Não é bug para o uso atual (saber se a pessoa está alocada), mas não serve para "todos os grupos deste host".

### `groups`, `rooms`, `member_checkins`
Lidas como hoje. `rooms.type` alimenta `deriveRoomCapacity`; `member_checkins` define quem está presente.

## Estados de um grupo presencial

Máquina de estados de classificação, avaliada na prévia e no card real. **A ordem importa**: cobertura é checada antes de tamanho.

| Estado | Condição | Onde muda |
|---|---|---|
| `sem_avaliador` | zero avaliadores com `role === "avaliador"` no grupo (host não conta — D2) | **novo** |
| `ideal` | 5 candidatos e 1 avaliador | inalterado |
| `aceitavel` | 6-7 candidatos e 2 avaliadores | inalterado |
| `fora_do_ideal` | qualquer outra combinação, com ao menos 1 avaliador | passa a **excluir** o caso sem avaliador |

Hoje `sem_avaliador` está fundido em `fora_do_ideal`, indistinguível de um grupo de 6 com 1 avaliador — a razão de o problema ter passado despercebido.

## Conjuntos derivados na prévia (front, sem persistência)

Nenhum destes vira campo de banco ou de response; são computados a partir do que `previewPresencial` já devolve.

| Conjunto | Definição |
|---|---|
| **Alocados** | união de `groups[].evaluators`, por `userId` |
| **Participando** | `availableEvaluators` filtrado por: `role === "host"` (sempre) OU `role === "avaliador"` e marcado no seletor |
| **De fora** | *Participando* − *Alocados* (FR-003) |
| **Grupos descobertos** | grupos cujo estado é `sem_avaliador` (FR-001) |

Invariante que a UI mantém: um `userId` nunca aparece em *Alocados* e *De fora* ao mesmo tempo. A troca (FR-004) move um `userId` entre os dois conjuntos, sempre aos pares e sempre dentro do mesmo `role` (nunca cruza papéis).

## Efeito de cada operação em `group_evaluators`

| Operação | Efeito |
|---|---|
| Trocar avaliador (X sai, Y entra no grupo G) | apaga a linha de X; insere `(G, Y)`. É exatamente o que `assignEvaluator` já faz (delete-all + insert). |
| Trocar host da sala S (X sai, Y entra) | apaga **todas** as linhas de X nos grupos de S; insere `(g, Y)` para **cada** grupo `g` de S. Precisa de `replaceRoomHost` — `assignEvaluator` colapsaria o host num grupo só. |
| Mover avaliador (já existente) | inalterado (`UPDATE ... WHERE user_id`) |

## Volume

Escala real de uma edição: dezenas de candidatos, poucas salas, poucos grupos. Todo cálculo novo é `O(grupos)` em memória, e as escritas são `batch` de D1 — I/O, que não conta no teto de 10 ms de CPU do Princípio IV.
