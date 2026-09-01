# Quickstart: Recomendações e Simulação de Grupos (Presencial + Online)

Pré-requisitos: edição com candidatos presenciais e online com check-in feito, pelo menos uma
sala cadastrada, alguns avaliadores/hosts com check-in de membro feito (mesmo setup já usado
pra validar FEAT-0020/0021).

## US1 — Diagnóstico de déficit de host

1. Marque poucos avaliadores como host (ou nenhum) e faça check-in de mais candidatos
   presenciais do que 1-2 salas pequenas comportam com folga.
2. Abra `/painel/grupos/presencial` → "Simular grupos".
3. Esperado: aviso "faltam N host(s)" com nomes destacados na lista de avaliadores como
   sugestão de promoção.
4. Promova um dos avaliadores sugeridos pelo botão já existente ("Promover a host").
5. Esperado: o aviso recalcula (deficit diminui ou some).

## US2 — Diagnóstico de desvio do ideal

1. Na mesma prévia, com uma mistura de grupos (alguns de 3, alguns de 4-5).
2. Esperado: cada grupo mostra sua classificação (ideal/aceitável/fora do ideal); cada sala
   mostra se o host bate com `deriveRoomCapacity`; resumo no topo lista os desvios (ou confirma
   que está tudo dentro do ideal, se for o caso).

## US3 — Painel de cenários

1. Na mesma prévia, com QUALQUER quantidade de candidatos presentes.
2. Esperado: um bloco com mais de um cenário de referência (não só o total atual) — poucos,
   médio, muitos candidatos — e, se os recursos presentes não bastarem pro ideal, uma frase
   explicando por quê e a alternativa mais próxima.

## US4 — Simulação online

1. Faça check-in de candidatos online (sem organizar ainda).
2. Abra `/painel/grupos/online` → "Simular grupos".
3. Esperado: modal mostra prévia de candidatos por grupo, sem nenhum avaliador (a atribuição
   continua manual, depois de aprovar) e sem alterar a organização real (confirme com
   `GET /groups` ou recarregando a tela — nada mudou).
4. Feche sem aprovar → confirme que nada mudou.
5. Reabra, aprove → confirme que os grupos reais aparecem na tela exatamente como a prévia
   mostrou.
6. Repita o processo com avaliadores já atribuídos aos grupos online atuais (self-service ou
   atribuição manual) → confirme que o modal avisa, antes de aprovar, que essas atribuições
   serão perdidas.

## Verificação automatizada

- `shared`: `npm run test --workspace=shared` cobre `classifyPresencialGroup`,
  `calculateHostDeficit` e o comportamento de `derivePresencialGroupCount` sem `maxGroups`
  (usado agora também pelo online).
- `api`: `npm run test --workspace=api` cobre `GroupService.previewOnline`,
  `organizeOnlineGroups` reescrito, e a rota `POST /groups/preview/online`
  (`group.service.test.ts`, `group-organization.test.ts`, `group.routes.test.ts`).
- `front`: `npx tsc --noEmit -p front/tsconfig.json`, `npm run build --workspace=front`,
  `npx eslint` nos arquivos alterados — sem teste automatizado de UI neste projeto (verificação
  manual segue os passos acima).
