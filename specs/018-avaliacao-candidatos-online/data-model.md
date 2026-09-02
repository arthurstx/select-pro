# Data Model: Prosel online — grupos e avaliação independentes do presencial

Nenhuma tabela nova, nenhuma coluna nova, nenhuma migration — igual à versão anterior desta
spec. A mudança é inteiramente de comportamento: como e quando as linhas de `groups`/
`group_candidates`/`group_evaluators` são escritas e lidas.

## `groups` — escopo de organização por `modality`

| Antes desta feature | Depois desta feature |
|---|---|
| Uma única operação (`organize`) forma presencial e online juntos, e `replaceOrganization` apaga TODOS os grupos do processo antes de reinserir. | Duas operações independentes (`organize/presencial`, `organize/online`); cada uma apaga e reinsere só os grupos da própria `modality`. |

## `group_evaluators` — como o vínculo nasce, por modalidade

| Modalidade | Antes | Depois |
|---|---|---|
| Presencial | Round-robin automático na organização | Sem mudança — continua automático |
| Online | Nunca escrito (organizeOnline sempre `[]`) | Escrito só por ação humana: self-service (avaliador) ou atribuição manual (admin) — nunca pela organização em si |

## Leitura de `role` (host vs avaliador) passa a depender da modalidade

`role` de um avaliador num grupo já era **derivado**, não uma coluna (LEFT JOIN com
`edition_hosts`, `group.repository.ts:196`). A regra de derivação ganha uma condição a mais:

```
role = (modality == 'presencial' AND existe linha em edition_hosts) ? 'host' : 'avaliador'
```

Sem coluna nova — só a query de leitura muda.

## Sem novas entidades, sem nova state machine

Grupo, avaliador/host, candidato e o vínculo entre eles continuam sendo exatamente as mesmas
entidades da FEAT-0012/0013. O veredito de avaliação (D2 veto + D6 mínimo de 2) continua
calculado na leitura, sem nenhuma lógica nova — passa a se aplicar a candidatos online no
momento em que eles passam a ter avaliações registradas, via o novo mecanismo de alocação de
avaliador (self-service/manual em vez de automático).
