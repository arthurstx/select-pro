# Quickstart: validar a feature 025

**Feature**: 025 | **Fase**: 1

Como provar que a feature funciona de ponta a ponta. Detalhes de shape estão em [`contracts/groups-evaluators.md`](contracts/groups-evaluators.md); estados de grupo, em [`data-model.md`](data-model.md).

## Pré-requisitos

- `npm install` na raiz (workspaces linkados).
- Uma edição corrente com candidatos presenciais com check-in feito.
- Salas cadastradas (senão a organização para em `NO_ROOMS_AVAILABLE`, antes de chegar no que interessa).
- **Nenhuma migration a aplicar** — esta feature não toca o schema.

## Rodar

```bash
npm run dev --workspace=api
```

```bash
npm run dev --workspace=front
```

## Suítes automatizadas

```bash
npm test --workspace=shared
```

```bash
npm test --workspace=api
```

```bash
npm test --workspace=front
```

O que cada uma precisa cobrir:

| Suíte | Alvo |
|---|---|
| `shared` | `classifyPresencialGroup` distingue `sem_avaliador` de `fora_do_ideal`, inclusive num grupo de 6 candidatos com 0 avaliadores (hoje os dois caem no mesmo estado) |
| `api` — `group-organization.test.ts` | pool menor que a quantidade de grupos deixa grupos identificavelmente descobertos; pool maior que 2×grupos deixa gente de fora, de forma determinística |
| `api` — `group.service.test.ts` | `organizePresencial` com zero avaliadores recusa **e não altera** a organização existente; `previewPresencial` no mesmo cenário responde normalmente |
| `api` — `group.routes.test.ts` | `PUT /groups/{groupId}/evaluators/{userId}` atribui alguém **sem grupo de origem** (hoje `EVALUATOR_NOT_ALLOCATED`) e funciona em grupo presencial; `organize` devolve 409 `NO_EVALUATORS_PRESENT` |

## Cenários manuais

### C1 — Grupo descoberto é impossível de não ver (FR-001, FR-002)
Check-in de ~12 candidatos presenciais, 2 salas comuns, **1 único avaliador** com check-in de membro.

Abrir "Simular grupos". Esperado: dois grupos, um deles com badge de erro própria (distinta de "fora do ideal"), o nome dele citado no resumo do topo e um alerta "1 grupo sem avaliador". Clicar em "Aprovar" abre confirmação nomeando o grupo; recusar não grava nada, aceitar grava.

### C2 — Quem ficou de fora, e a troca (FR-003, FR-004)
Com mais avaliadores presentes que o alvo (ex.: 6 presentes para 2 grupos de 6 candidatos, alvo 4).

Esperado: lista "fora da organização" com os 2 excedentes. Em um avaliador alocado, "Trocar por…" oferece **só avaliadores** de fora — nenhum host. Trocar, aprovar, e entrar no sistema como o avaliador que entrou: `/painel/minhas-avaliacoes` mostra o grupo, e o que saiu vê a mensagem de "ainda não foi alocado".

### C3 — Papéis não se cruzam (FR-004)
Em um **host** alocado, "Trocar por…" oferece só hosts de fora. Trocar o host de uma sala com 2 grupos e conferir depois de aprovar: o host que entrou aparece **nos dois grupos** da sala, e o que saiu, em nenhum. É o cenário que a Decisão 2 do `research.md` protege — se aparecer em um grupo só, a implementação usou a primitiva errada.

### C4 — Desmarcado não volta pela troca (FR-003)
Desmarcar um avaliador no seletor do topo. Esperado: ele **não** aparece na lista de "fora da organização" nem em nenhum "Trocar por…". Remarcar no seletor re-simula e ele volta a concorrer.

### C5 — A troca pode descobrir um grupo, e avisa na hora (FR-004)
Num grupo com 1 avaliador só, trocá-lo por alguém de fora **não** é bloqueado. Esperado: o grupo passa a exibir o erro do FR-001 no mesmo instante e entra na contagem que dispara a confirmação ao aprovar.

### C6 — Zero avaliadores recusa a escrita, não a prévia (FR-008)
Desmarcar **todos** os avaliadores. Esperado: a prévia continua renderizando e **os checkboxes continuam lá** (é o ponto da Decisão 6 — dá para remarcar); "Aprovar" fica desabilitado com o motivo visível. Forçando a chamada direta do `POST /groups/organize/presencial` com lista vazia: 409 `NO_EVALUATORS_PRESENT`, e a organização anterior intacta.

### C7 — Falha parcial é reportada como tal (FR-009)
Fazer uma troca, abrir o DevTools e bloquear as requisições de ajuste (`PUT`/`PATCH .../evaluators/...`), então aprovar.

Esperado: mensagem confirmando que os grupos **foram** organizados e nomeando o ajuste que não passou; o modal **não fecha**. Hoje o comportamento é o oposto — toast dizendo "Não foi possível organizar os grupos" (falso, foi gravado) e o modal fechando.

### C8 — O aviso não se repete (FR-007)
Uma sala com 2 grupos de 6 candidatos. Esperado: **uma** linha agregada ("2.1.2 tem 2 grupos de 6 candidatos"), não duas linhas dizendo "1 grupo".

### C9 — O alerta sobrevive à prévia (FR-006)
Depois de aprovar com um grupo descoberto, ir para `/painel/grupos/presencial`. Esperado: o card daquele grupo carrega o mesmo destaque de erro.
