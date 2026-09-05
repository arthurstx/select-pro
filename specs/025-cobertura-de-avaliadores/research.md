# Research: Cobertura de avaliadores nos grupos presenciais

**Feature**: 025 | **Data**: 2026-09-05 | **Fase**: 0

Decisões técnicas que a spec deixou em aberto, mais duas descobertas na leitura do código que mudam requisitos.

---

## Decisão 1 — Como expor "atribuir avaliador a um grupo presencial"

**Decisão:** mover a rota de atribuição de `PUT /groups/online/{groupId}/evaluators/{userId}` para `PUT /groups/{groupId}/evaluators/{userId}`, removendo a checagem `group.modality !== "online"` do `assignEvaluatorToOnlineGroup` (que passa a se chamar `assignEvaluator`).

**Rationale:** o path `PATCH /groups/{groupId}/evaluators/{userId}` já existe para *mover*. Usar `PUT` no mesmo path para *atribuir* é a distinção semântica correta e é válido em OpenAPI:

- `PATCH` = mover — exige grupo de origem, devolve o par origem/destino e emite o aviso de gênero;
- `PUT` = atribuir — idempotente, não exige origem, devolve só o destino.

A operação já é modality-agnostic por dentro (`assignEvaluator` no repositório não olha modalidade); só a validação do service restringia. O front é o único consumidor, então renomear o path não quebra ninguém externo.

**Alternativas rejeitadas:**
- *Relaxar o `PATCH` para virar upsert* — apagaria a distinção "mover" vs "atribuir" e o `EVALUATOR_NOT_ALLOCATED`, que é um erro legítimo para a operação de mover. Também mudaria o shape da response (o par origem/destino deixaria de ter origem às vezes).
- *Criar `POST /groups/{groupId}/evaluators`* — terceira rota para a mesma coisa, com o path do online sobrevivendo como duplicata.

---

## Decisão 2 — Troca de host precisa de primitiva própria (descoberta)

**Decisão:** criar `GroupRepository.replaceRoomHost(roomId, outUserId, inUserId)`, num único `db.batch`: apaga as linhas do host que sai nos grupos daquela sala e insere o host que entra em **cada** grupo da sala.

**Rationale:** `GroupRepository.assignEvaluator` faz `DELETE FROM group_evaluators WHERE user_id = ?` seguido de um único `INSERT` — "uma pessoa, um grupo por vez". Isso é correto para avaliador e **errado para host**: a migration `0017` removeu justamente o `UNIQUE(user_id)` para o host poder aparecer em todos os grupos da sala (FEAT-0021). Reusar `assignEvaluator` num host o colapsaria num grupo só, quebrando silenciosamente a organização das outras salas.

Este é o tipo de defeito que só aparece em produção, com o host sumindo dos outros grupos — e nenhum teste atual cobriria, porque a rota de atribuição hoje só existe para online, onde não há host nem sala.

**Alternativas rejeitadas:**
- *N chamadas de `assignEvaluator`, uma por grupo da sala* — cada chamada apaga a anterior; o host acabaria só no último grupo.
- *Reintroduzir `UNIQUE(user_id)`* — reverteria a FEAT-0021 e exigiria migration destrutiva (Princípio III), para resolver um problema que uma função de repositório resolve.

---

## Decisão 3 — Onde mora a classificação "sem avaliador"

**Decisão:** ampliar o retorno de `classifyPresencialGroup` em `shared/src/schemas/room.schema.ts` de `"ideal" | "aceitavel" | "fora_do_ideal"` para incluir `"sem_avaliador"`, checado antes de tudo.

**Rationale:** hoje um grupo com zero avaliadores cai em `fora_do_ideal`, indistinguível de um grupo de 6 com 1 avaliador — é exatamente por isso que o problema passou despercebido. Ampliar a união obriga o compilador a apontar todos os pontos que classificam grupo (o modal e o `GroupCard`) e forçá-los a decidir o que fazer com o estado novo. Um predicado separado (`hasEvaluatorCoverage`) deixaria um chamador consultar tamanho e esquecer cobertura, que é o bug de novo.

**Alternativas rejeitadas:**
- *Predicado booleano à parte* — nada obriga o chamador a usá-lo.
- *Calcular no front* — violaria o Princípio I; a regra é de domínio e é consumida por três lugares (prévia, card real, testes).

---

## Decisão 4 — Falha parcial dos ajustes manuais (FR-009)

**Decisão:** `Promise.all` → `Promise.allSettled` em `reconcileManualMoves`, com cada promessa carregando o nome de quem ela ajusta, para a mensagem poder nomear as que falharam. Sem transação, sem reversão.

**Rationale:** as chamadas são requisições HTTP independentes, cada uma uma invocação separada do Worker; não existe transação atravessando elas. A organização base já está gravada e consistente (o algoritmo rodou inteiro no servidor), então o estado parcial é "organizado + alguns ajustes faltando", que é descritível e corrigível — diferente de um estado corrompido.

**Princípio IV (orçamento da plataforma):** cada ajuste é uma invocação própria, então o teto de 10 ms de CPU por invocação não é afetado pela quantidade — não há acúmulo. O trabalho por invocação é um `batch` de D1, que é I/O e não conta. O paralelismo real é limitado pelo navegador (~6 conexões por origem), e a escala é de dezenas de ajustes no pior caso; não há motivo para `waitUntil` nem para lote no servidor, e Queues (indisponível no plano Free) não é necessário.

**Alternativas rejeitadas:**
- *Endpoint de ajustes em lote, transacional* — resolveria de vez, mas é uma rota nova com shape próprio para um problema que só aparece se a rede cair no meio. Anotado como melhoria futura, não desta feature.
- *Reverter os ajustes aplicados* — a reversão pode falhar pelo mesmo motivo da falha original, e aí o estado fica pior e menos descritível.

---

## Decisão 5 — Código de erro do FR-008

**Decisão:** `GroupErrorCode.NO_EVALUATORS_PRESENT` em `shared/src/schemas/group.schema.ts`, mapeado para **409**, ao lado de `NO_CANDIDATES_PRESENT` e `NO_ROOMS_AVAILABLE`.

**Rationale:** é exatamente a mesma categoria dos dois vizinhos — pré-condição da edição que impede organizar — e o mapeamento de status dessas rotas já trata 409 como "estado da edição impede a operação". Nenhuma novidade estrutural.

---

## Decisão 6 — A prévia NÃO recusa; só a organização recusa (correção do FR-008)

**Decisão:** `previewPresencial` continua respondendo 200 mesmo com zero avaliadores participando. A recusa com `NO_EVALUATORS_PRESENT` fica só em `organizePresencial`. O front bloqueia o botão "Aprovar" e mostra o motivo.

**Rationale:** o FR-008 dizia "tanto a prévia quanto a organização real recusam". Isso cria uma armadilha: a lista de checkboxes do modal é montada a partir de `availableEvaluators`, que vem **na resposta da prévia**. Se a prévia responde 409, o seletor desaparece — e o caso "desmarquei todos sem querer" fica sem saída, porque não há mais checkbox para remarcar. O operador teria que fechar e reabrir o modal.

Recusar só na escrita preserva a intenção do FR-008 (nada é gravado, a organização anterior sobrevive) sem tirar do operador a ferramenta de corrigir o que causou o estado.

A recusa no servidor continua existindo e sendo testada: é a garantia real, já que o botão desabilitado é só UX.

**Alternativas rejeitadas:**
- *Prévia recusa como escrito na spec* — a armadilha acima.
- *Devolver `availableEvaluators` junto do corpo de erro* — corpo de erro com payload de sucesso dentro viola o envelope `ErrorResponseSchema` do Princípio I.

**Ação:** FR-008 da spec foi corrigido para refletir isto.

---

## Não-decisões (confirmadas, sem mudança)

- **Sem migration.** Tudo opera sobre `group_evaluators`, `groups` e `rooms` como estão. O Princípio III não é acionado: nenhuma tabela muda de shape, nenhum dado gravado é reinterpretado.
- **Sem mudança no algoritmo de distribuição.** `distributeEvaluatorsByTarget` continua como está — a D1 decidiu declarar o problema, não redistribuir. O que muda é que o resultado passa a ser classificável e visível.
- **Sem KV, sem cron, sem rate limiting novo.** Nada aqui toca os outros itens do Princípio IV.
