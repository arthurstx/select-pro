# Research: Cadastro de salas

## R1 — Onde vive o cálculo de hosts/limite de grupos

**Decision**: função pura `deriveRoomCapacity(size: number): { hostCount: number; maxGroups: number }`
em `shared/src/schemas/room.schema.ts`, consumida tanto pela API (monta a
response) quanto pelo front (prévia ao vivo no formulário, mockup Stitch:
"Esta sala comporta X host(s) e até Y grupos" enquanto o admin digita).

**Rationale**: o mockup já pressupõe cálculo no cliente, sem round-trip a
cada tecla. Se a regra existisse só no backend, o front teria que reimplementar
as faixas para a prévia — exatamente a duplicação que o Princípio I da
constitution proíbe para contratos, e que aqui se aplica à mesma lógica por
analogia: uma fórmula, um lugar, os dois lados importam de `shared`.

**Alternatives considered**: calcular só no backend e a prévia do front fazer
uma chamada de API a cada mudança de capacidade — rejeitado, UX pior (delay
perceptível) para nenhum ganho de consistência.

## R2 — Unicidade de nome

**Decision**: `CREATE UNIQUE INDEX idx_rooms_name ON rooms(name)` na migration
`0009`. O service consulta antes de inserir (mensagem de erro específica), e o
índice único é a rede de segurança contra corrida — mesmo padrão de
`idx_signup_requests_pending_email` na FEAT-0008.

**Rationale**: `rooms` está vazia hoje (órfã desde a `0001`), então adicionar
o índice é seguro e imediato — não é o caso de alterar uma tabela com dados
reais.

## R3 — Exclusão bloqueada por grupos vinculados

**Decision**: nenhuma mudança de schema. `groups.room_id REFERENCES rooms(id)
ON DELETE RESTRICT` já existe desde a `0001` — o `DELETE` falha sozinho, e o
service só precisa traduzir a violação em `ROOM_HAS_GROUPS` (mesmo padrão de
`parseUniqueConstraint`, mas para uma violação de foreign key).

**Rationale**: a restrição já está no banco por acidente de uma migration
antiga nunca usada — aproveitá-la é mais simples e mais seguro do que
reimplementar a checagem em código (uma corrida entre "checar se tem grupos"
e "excluir" ficaria aberta se a checagem fosse só na aplicação).

## R4 — Onde a rota mora

**Decision**: prefixo novo `/rooms`, router `rooms.routes.ts` próprio (não
dentro de `auth.*` nem de nenhum outro). CORS dedicado em `index.ts`, mesmo
padrão de `/candidates/*` (permite `GET/POST/PUT/DELETE`), com
`maintenanceGuard` próprio.

**Rationale**: sala não é conceito de identidade nem de dashboard — é a
primeira feature de um domínio novo ("infraestrutura do processo seletivo").
Não faz sentido pendurar em nenhum router existente.

## R5 — CHECK de capacidade já existe

**Decision**: nenhuma migration nova para validar `size > 0` — `CHECK (size >
0)` já está na tabela desde a `0001`. `CreateRoomSchema`/`UpdateRoomSchema`
validam isso primeiro via Zod (mensagem amigável); o `CHECK` do banco é
defesa em profundidade, não deve disparar em uso normal.
