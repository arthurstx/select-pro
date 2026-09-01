# Contrato: filtro de modalidade no check-in

## `GET /candidates` — query param novo

`attendance`: `"online" | "presencial"`, opcional. Ausente = todos (comportamento atual,
sem mudança de compatibilidade — cliente antigo continua funcionando igual).

Quando informado, filtra `items`, `pagination.total`, `totalCandidates` e `attendanceSummary`
para o recorte da modalidade — os quatro, não só a lista (research.md, Decisão 1).

Sem mudança de shape de resposta (`ListCandidatesResponseSchema`), sem novo código de erro.

## Rotas de front

Sem endpoint novo — as duas telas (`/painel/check-in/presencial`, `/painel/check-in/online`)
chamam o mesmo `GET /candidates`, só fixando `attendance` no client.
