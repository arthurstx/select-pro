# Contrato: sem endpoint novo

"Simular grupos" é cálculo puro no front (research.md, Decisão 1) — sem rota HTTP nova, sem
mudança de shape em nenhum endpoint existente.

## `POST /groups/organize/presencial` (FEAT-0012/0018) — comportamento muda, contrato não

Continua devolvendo `OrganizeResultResponseSchema` — mesmo shape. O que muda é só a
composição dos grupos formados (tamanho 3-5, avaliadores por prioridade, hosts excluídos —
spec.md FR-003 a FR-007), não a estrutura da resposta.

## `GET /candidates?attendance=presencial&status=presentes` (FEAT-0005/0015/0019) — reaproveitado, sem mudança

A tela de simulação usa `totalCandidates` da resposta já existente desse endpoint pra saber
quantos candidatos presenciais estão presentes agora — nenhum parâmetro novo, nenhuma mudança
de shape.
