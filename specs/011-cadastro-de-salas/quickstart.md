# Quickstart: validação ponta a ponta da 011

Pré-requisitos: `npm install`, migration `0009-rooms-unique-name.sql`
aplicada localmente.

```bash
npm run dev --workspace=api
```

Precisa de um token de admin — mesmo padrão de teste usado no restante do
projeto (`signAccessToken` com `role: "admin"`).

## Cenário 1 — cadastro nas 3 faixas (US1)

```bash
curl -X POST http://localhost:8787/rooms -H "Authorization: Bearer <admin>" \
  -H "Content-Type: application/json" -d '{"name":"2.2.1","size":40}'
# Esperado: 201, hostCount=1, maxGroups=2

curl -X POST http://localhost:8787/rooms -H "Authorization: Bearer <admin>" \
  -H "Content-Type: application/json" -d '{"name":"3.1.5","size":65}'
# Esperado: 201, hostCount=2, maxGroups=3

curl -X POST http://localhost:8787/rooms -H "Authorization: Bearer <admin>" \
  -H "Content-Type: application/json" -d '{"name":"Auditório","size":120}'
# Esperado: 201, hostCount=2, maxGroups=4
```

## Cenário 2 — fronteiras exatas (edge case)

`size:50` → `hostCount=1, maxGroups=2`. `size:51` → `hostCount=2, maxGroups=3`.
`size:80` → `hostCount=2, maxGroups=3`. `size:81` → `hostCount=2, maxGroups=4`.

## Cenário 3 — nome duplicado (FR-005)

Repetir o cadastro de `"2.2.1"`: esperado `409` `ROOM_NAME_ALREADY_EXISTS`.

## Cenário 4 — edição muda a faixa (US2)

```bash
curl -X PUT http://localhost:8787/rooms/<id-da-2.2.1> -H "Authorization: Bearer <admin>" \
  -H "Content-Type: application/json" -d '{"name":"2.2.1","size":60}'
# Esperado: 200, hostCount=2, maxGroups=3 (mudou de faixa)
```

## Cenário 5 — exclusão bloqueada por grupo vinculado (US3, FR-009)

Sem a feature 012, não há como popular `groups` de verdade — o teste
automatizado insere uma linha em `groups` direto via SQL para simular o
vínculo, depois tenta `DELETE /rooms/:id` e espera `409 ROOM_HAS_GROUPS`.

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `room.schema.test.ts` (se `deriveRoomCapacity` for testado em
isolamento em `shared/`), `rooms.service.test.ts`, `rooms.routes.test.ts`.
