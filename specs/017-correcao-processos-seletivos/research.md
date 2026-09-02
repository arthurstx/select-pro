# Research: Correção de processos seletivos

Sem `NEEDS CLARIFICATION` no Technical Context — a stack é fixa (constitution, "Restrições
Tecnológicas") e o domínio já existe (`selection_processes`, migration `0006`). As decisões
abaixo são de desenho dentro dessa stack, não de tecnologia.

## Decisão 1: Sem migration nova

**Decision**: Nenhuma migration nova. A tabela `selection_processes` (migration `0006`) já
tem `id`, `label` (com `UNIQUE`), `starts_at`, `ends_at`, `created_at` — exatamente os campos
que a spec pede para editar.

**Rationale**: FR-002/FR-004 pedem editar campos que já existem, com a unicidade de `label`
que já existe como constraint de banco (`UNIQUE`). Não há novo dado a persistir.

**Alternatives considered**: Nenhuma — não haveria o que considerar sem um campo novo.

## Decisão 2: Verbo HTTP — `PUT /selection-processes/{id}`, substituindo os três campos juntos

**Decision**: Uma única rota `PUT` que recebe `label`, `starts_at` e `ends_at` sempre juntos,
não um `PATCH` parcial.

**Rationale**: Mesmo padrão já estabelecido em `/rooms/{id}` (`UpdateRoomSchema = CreateRoomSchema`,
FEAT-0011) — a tela sempre pré-carrega os três campos antes de editar, então não há ganho em
aceitar atualização parcial, e um `PUT` total evita o caso ambíguo de "o campo não veio no
body, isso significa não mudar ou mudar para vazio?".

**Alternatives considered**: `PATCH` parcial — rejeitado por inconsistência com o padrão já
usado no projeto para este tipo de tela (formulário único, salvar tudo de uma vez).

## Decisão 3: Validação `starts_at < ends_at` no schema Zod (`superRefine`), não no service

**Decision**: A checagem de FR-003 (`starts_at` não pode ser posterior ou igual a `ends_at`)
vive no schema compartilhado, via `.superRefine`, e sobe como `400 VALIDATION_ERROR` pelo
`validationHook` que toda rota do projeto já usa (mesmo mecanismo de `exports.routes.ts`,
`rooms.routes.ts` etc.).

**Rationale**: É uma regra de forma do payload (relação entre dois campos do mesmo request),
não uma regra que depende de estado do banco — mesma categoria de validação que já é feita em
Zod no projeto inteiro (Princípio I: contrato como fonte da verdade). Colocá-la no service
duplicaria uma checagem que o schema já consegue fazer sozinho, sem I/O.

**Alternatives considered**: Checar no service e devolver um `SelectionProcessInvalidRangeError`
dedicado — rejeitado por ser trabalho a mais para expressar a mesma regra que `.superRefine`
já cobre no ponto de entrada, e por inflar a lista de domain errors sem necessidade.

## Decisão 4: Unicidade de `label` — checagem no service (como `rooms`), não só a constraint do banco

**Decision**: O service confere `findByLabel` antes do `UPDATE` e devolve
`SelectionProcessLabelAlreadyExistsError` (409) se outro processo já usa o `label` pedido;
mantém como rede de segurança o mesmo padrão de `RoomsService.update` — capturar
`UNIQUE constraint failed` na escrita e traduzir para o mesmo erro, cobrindo a corrida entre
a checagem e o `UPDATE`.

**Rationale**: Mesmo padrão já usado em `RoomsService` (FEAT-0011) para `ROOM_NAME_ALREADY_EXISTS`
— consistência de erro previsível (mensagem clara antes de tentar o `UPDATE`, sem depender só
da mensagem crua do SQLite) e mesma defesa contra corrida.

**Alternatives considered**: Deixar só a constraint do banco estourar e traduzir sempre na
captura do erro — rejeitado por ser o único caminho, que devolveria erro genérico "unique
constraint" numa via de código a mais longe da rota; a checagem prévia responde mais rápido no
caminho comum (sem conflito).

## Decisão 5: Reaproveitar `SelectionProcessNotFoundError` já existente

**Decision**: `id` inexistente (FR-005) usa `SelectionProcessNotFoundError`
(`api/src/core/errors/checkin-errors.ts`), já usado por `exports.routes.ts`, em vez de criar
uma classe de erro nova.

**Rationale**: Princípio de reuso do projeto (R3/R4 já aplicados em features anteriores) — a
classe já existe, já está mapeada para `404` em pelo menos uma rota, e o significado é
idêntico ("processo seletivo com este id não existe").

**Alternatives considered**: Nova classe `SelectionProcessAdminNotFoundError` — rejeitada por
duplicar um conceito que já existe no domínio, sem diferença semântica.

## Decisão 6: `SelectionProcessRepository` ganha `update()`, sem repositório novo

**Decision**: O método de escrita entra em `SelectionProcessRepository`
(`api/src/repositories/selection-process.repository.ts`), que já tem `findById`/`findByLabel`/
`listAll`. Um `SelectionProcessAdminService` novo (mirror de `RoomsService`) concentra a regra
de negócio de escrita (checagem de unicidade, tradução de erro).

**Rationale**: O repositório já é o dono do SQL de `selection_processes` — dividir leitura e
escrita entre dois repositórios do mesmo domínio quebraria a convenção de uma classe por
tabela já usada em todo o projeto (`RoomsRepository`, `ExportsRepository` etc.).

**Alternatives considered**: Colocar a lógica de update diretamente na rota — rejeitado, viola
a Arquitetura em Camadas do projeto (rota → service → repository) usada em toda feature
anterior.
