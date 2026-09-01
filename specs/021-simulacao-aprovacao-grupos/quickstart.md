# Quickstart: validação ponta a ponta da 021

Pré-requisitos: `npm install`. Sem migration nova.

## Cenário 1 — preview não persiste nada (US1, FR-010, SC-001)

```bash
curl http://localhost:8787/groups -H "Authorization: Bearer <admin>"   # estado antes
curl -X POST http://localhost:8787/groups/preview/presencial -H "Authorization: Bearer <admin>"
curl http://localhost:8787/groups -H "Authorization: Bearer <admin>"   # estado depois — idêntico
```

## Cenário 2 — aprovar aplica exatamente o que a prévia mostrou (US1, FR-011, SC-002)

```bash
curl -X POST http://localhost:8787/groups/preview/presencial \
  -H "Authorization: Bearer <admin>" -H "Content-Type: application/json" \
  -d '{"evaluatorUserIds": ["<id1>"]}'
# anota o resultado

curl -X POST http://localhost:8787/groups/organize/presencial \
  -H "Authorization: Bearer <admin>" -H "Content-Type: application/json" \
  -d '{"evaluatorUserIds": ["<id1>"]}'
# Esperado: mesma distribuição de candidatos/avaliadores por sala do preview
```

## Cenário 3 — host aparece em todos os grupos da mesma sala

Com uma sala de D5 >50 (2+ grupos) e hosts presentes suficientes: conferir que o mesmo
`userId` de host aparece em `evaluators` de TODOS os grupos daquela sala (mesmo `room.id`).

## Cenário 4 — limpar organização (US2, FR-001)

```bash
curl -X DELETE http://localhost:8787/groups/presencial -H "Authorization: Bearer <admin>"
curl http://localhost:8787/groups -H "Authorization: Bearer <admin>"
# Esperado: nenhum grupo presencial; grupos online (se houver) continuam
```

## Cenário 5 — gender/memberStatus nas respostas (US3/US4)

```bash
curl http://localhost:8787/groups -H "Authorization: Bearer <admin>"
# Esperado: data.groups[].candidates[].gender e data.groups[].evaluators[].memberStatus presentes
```

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `group-organization.test.ts` (distribuição de hosts por sala),
`group.service.test.ts`/`group.routes.test.ts` (preview, clear, evaluatorUserIds, gender/
memberStatus no shape).
