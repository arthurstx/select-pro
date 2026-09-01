# Quickstart: validação ponta a ponta da 018 (revisada)

Pré-requisitos: `npm install`. Sem migration nova.

```bash
npm run dev --workspace=api
```

## Cenário 1 — organizar online não apaga presencial (US1, FR-001, SC-001)

```bash
curl -X POST http://localhost:8787/groups/organize/presencial -H "Authorization: Bearer <admin>"
# guarda os ids de grupo presencial retornados

curl -X POST http://localhost:8787/groups/organize/online -H "Authorization: Bearer <admin>"

curl http://localhost:8787/groups -H "Authorization: Bearer <admin>"
# Esperado: os grupos presenciais da primeira chamada continuam lá, intactos
```

## Cenário 2 — organizar online só separa candidatos, sem sala/avaliador (US1, FR-002)

```bash
curl -X POST http://localhost:8787/groups/organize/online -H "Authorization: Bearer <admin>"
# Esperado: 200, cada grupo com modality="online", room=null, evaluators=[]
```

## Cenário 3 — avaliador entra num grupo online por conta própria (US2, FR-003)

```bash
curl -X POST http://localhost:8787/groups/online/<groupId>/join -H "Authorization: Bearer <avaliador>"
# Esperado: 200, o avaliador aparece em data.evaluators do grupo
```

## Cenário 4 — entrar em outro grupo online move, não duplica (US2, FR-004)

```bash
curl -X POST http://localhost:8787/groups/online/<outroGroupId>/join -H "Authorization: Bearer <avaliador>"
# Esperado: 200; GET /groups mostra o avaliador só no grupo novo, sumiu do anterior
```

## Cenário 5 — avaliador sai do grupo online (US2, FR-005)

```bash
curl -X DELETE http://localhost:8787/groups/online/me -H "Authorization: Bearer <avaliador>"
# Esperado: 204; GET /groups não mostra mais esse avaliador em nenhum grupo online
```

## Cenário 6 — gestão atribui avaliador manualmente (US3, FR-006)

```bash
curl -X PUT http://localhost:8787/groups/online/<groupId>/evaluators/<userId> \
  -H "Authorization: Bearer <admin>"
# userId sem grupo nenhum ainda, groupId é online
# Esperado: 200, { data: <grupo> } com o avaliador já dentro
```

## Cenário 7 — host não aparece rotulado como host num grupo online (Edge case, FR-007)

Com um usuário que É host da edição (FEAT-0009) entrando num grupo online (cenário 3):

```bash
curl http://localhost:8787/groups -H "Authorization: Bearer <admin>"
# Esperado: no grupo online, esse avaliador aparece com role="avaliador", nunca "host"
```

## Cenário 8 — avaliador de grupo online consegue avaliar (FR-009)

```bash
curl -X PUT http://localhost:8787/evaluations/<candidateId> \
  -H "Authorization: Bearer <avaliador-do-grupo-online>" -H "Content-Type: application/json" \
  -d '{"scores": {...}, "overallColor": "GREEN"}'
# Esperado: 200 — mesmo fluxo já usado para candidato presencial
```

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `group-organization.test.ts` (as duas funções puras, separadas), `group.service.test.ts`
(organize por modalidade, join/leave/assign, escopo do `replaceOrganization`),
`group.routes.test.ts` (rotas novas e a estendida), `evaluation.service.test.ts`/
`evaluation.routes.test.ts` (sem mudança de comportamento — reconfirma que continuam passando).
