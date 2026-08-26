# Quickstart — FEAT-0012 Organização automática de grupos

Validação manual via `wrangler dev` + `curl` (mesmo formato usado nas specs anteriores).
Requer um usuário admin autenticado (`ADMIN_TOKEN` = cookie/JWT válido) e:
- uma edição corrente (`selection_processes` cobrindo a data de hoje);
- ao menos uma sala cadastrada (FEAT-0011);
- candidatos com check-in feito (FEAT-0005), mistura de gênero e de `saturday_restriction`;
- avaliadores/hosts com check-in de membro feito (FEAT-0010).

## Cenário 1 — organizar do zero

```bash
curl -X POST http://localhost:8787/groups/organize \
  -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: `200`, `data.groups` não vazio, todo candidato presente aparece em exatamente
um grupo, nenhum grupo presencial ou online tem exatamente 1 mulher, grupos presenciais têm
`room` preenchido e `evaluators` (quando houver avaliador presente na mesma sala), grupos
online têm `room: null` e `evaluators: []`.

## Cenário 2 — visualizar sem reorganizar

```bash
curl http://localhost:8787/groups -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: `200`, mesmo conteúdo do Cenário 1 (nada mudou).

## Cenário 3 — reorganizar descarta o anterior

Marcar check-in de mais um candidato, repetir o `POST /groups/organize` do Cenário 1.

**Esperado**: `200`, a nova organização inclui o candidato recém-chegado; IDs de grupo são
novos (a organização anterior foi substituída, FR-011).

## Cenário 4 — mover candidato manualmente

```bash
curl -X PATCH http://localhost:8787/groups/<groupIdDestino>/candidates/<candidateId> \
  -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: `200`, `data.warning: null` no caso comum; grupo de origem perde o candidato,
grupo de destino ganha.

## Cenário 5 — mover candidato violando D1

Mover um candidato de forma que o grupo de origem ou destino fique com exatamente 1 mulher.

**Esperado**: `200` (não bloqueado), `data.warning: "GENDER_RULE_VIOLATED"`.

## Cenário 6 — mover entre modalidades é bloqueado

```bash
curl -X PATCH http://localhost:8787/groups/<groupIdOnline>/candidates/<candidateIdPresencial> \
  -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: `409 GROUP_MODALITY_MISMATCH`.

## Cenário 7 — sem sala cadastrada, com candidatos presenciais presentes

Remover/não cadastrar nenhuma sala, garantir ao menos um candidato presente com
`saturday_restriction = false`.

```bash
curl -X POST http://localhost:8787/groups/organize -H "Cookie: $ADMIN_TOKEN"
```

**Esperado**: `409 NO_ROOMS_AVAILABLE`.

## Cenário 8 — nenhum candidato presente

Sem nenhum check-in de candidato feito na edição corrente.

**Esperado**: `409 NO_CANDIDATES_PRESENT`.

## Cenário 9 — sem processo corrente

Sem nenhuma `selection_processes` cobrindo a data de hoje.

**Esperado**: `409 NO_ACTIVE_SELECTION_PROCESS`, em todas as 4 rotas.
