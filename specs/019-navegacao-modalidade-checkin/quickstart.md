# Quickstart: validação ponta a ponta da 019

Pré-requisitos: `npm install`. Sem migration nova.

```bash
npm run dev --workspace=api
```

## Cenário 1 — filtro de modalidade (FR-001, SC-001)

```bash
curl "http://localhost:8787/candidates?attendance=presencial" -H "Authorization: Bearer <token>"
# Esperado: 200, items só com candidatos presenciais; totalCandidates/attendanceSummary
# refletem só o recorte presencial

curl "http://localhost:8787/candidates?attendance=online" -H "Authorization: Bearer <token>"
# Esperado: 200, items só com candidatos online
```

## Cenário 2 — cache não mistura modalidades (research.md, Decisão 2)

Repetir o cenário 1 duas vezes seguidas para a mesma modalidade (cache hit na segunda) e
depois trocar de modalidade — o resultado da segunda chamada não pode vir do cache da
primeira.

## Cenário 3 — telas do front

Abrir `/painel/check-in/presencial` e `/painel/check-in/online` — cada uma mostra só a
modalidade correspondente, com busca/status/curso funcionando normalmente dentro do recorte.

## Cenário 4 — redirect (FR-005)

```bash
curl -I http://localhost:3000/painel/check-in
# Esperado: redirect para /painel/check-in/presencial
```

## Cenário 5 — navegação (FR-006/FR-007)

Abrir o painel — a sidebar mostra "Presencial" e "Online" como grupos expansíveis, cada um
com Grupos + Check-in da própria modalidade; os demais itens continuam soltos.

## Testes automatizados

```bash
npm run test --workspace=api
```

Cobre: `checkin.service.test.ts`/`checkin.routes.test.ts` (filtro novo, cache por chave).
