# Phase 0 Research: Check-in de membros

Nenhum `NEEDS CLARIFICATION` restou no Technical Context — a feature reaproveita padrões já
validados em produção neste monorepo. Este documento registra as decisões e por que a
alternativa mais simples de cada uma foi ou não escolhida.

## D1. Esquema de dados do check-in de membro

**Decision**: duas tabelas novas, espelhando exatamente `candidate_checkins` +
`checkin_events` (migration `0006`): `member_checkins` (estado atual, existência da linha =
presença, `UNIQUE (user_id, process_id)`) e `member_checkin_events` (histórico append-only,
`action CHECK IN ('marcou', 'desmarcou')`).

**Rationale**: é o único par de tabelas do projeto que já resolve exatamente este problema
(presença por edição + auditoria), testado e em produção desde a FEAT-0005. Divergir do
padrão exigiria justificar por que o caso de membro é diferente do de candidato — não é.

**Alternatives considered**:
- *Reaproveitar `candidate_checkins` com uma coluna `subject_type`*: rejeitada — misturaria
  duas FKs opcionais (`candidate_id`/`user_id`) na mesma tabela, quebrando o `NOT NULL
  REFERENCES` que hoje garante integridade referencial simples. Custo maior que duas tabelas
  pequenas e claras.
- *Coluna de estado (`present: boolean`) em vez de existência de linha*: rejeitada pelo mesmo
  motivo que a 0006 já rejeitou — "único fato, única fonte" evita que estado e evento
  divirjam.

## D2. Quem pode ter check-in

**Decision**: mesma fonte que a FEAT-0009 já usa para a lista de avaliadores/hosts da edição
corrente (`EvaluatorsRepository.listWithRole(processId)` — `users` com `role_id =
'avaliador'`, `deactivated_at IS NULL`, cargo anotado via `LEFT JOIN edition_hosts`).

**Rationale**: reaproveita a mesma definição de "quem está atribuído à edição corrente" que
já rege o papel de host — evita duas fontes de verdade sobre a mesma pergunta ("quem avalia
nesta edição").

**Alternatives considered**: consulta própria em `member-checkin.repository.ts` duplicando o
`JOIN` — rejeitada pelo Princípio I em espírito (não duplicar o que já existe), mesmo sendo
um SQL e não um schema Zod.

## D3. Resumo "X de Y" (FR-006)

**Decision**: calculado no service a partir da mesma query (`COUNT(*)` total vs. `COUNT(*)
WHERE checked_in_at IS NOT NULL`), devolvido como campo agregado na resposta do `GET` —
mesmo padrão de agregação que `dashboard.service.ts` já usa para os totais do dashboard.

**Rationale**: lista de dezenas de itens (não milhares) — computar em SQL numa única query é
mais simples que introduzir cache ou endpoint separado, e o dashboard já estabelece o
precedente de expor total + subtotal juntos numa resposta.

**Alternatives considered**: endpoint `/member-checkins/summary` separado — rejeitado por
overhead: o front já busca a lista completa para renderizar (sem paginação), então o resumo
sai de graça da mesma resposta.

## D4. Sinalização online/presencial do candidato (US3)

**Decision**: `CandidateCheckinItemSchema` (em `checkin.schema.ts`) ganha um campo derivado
`attendance: "online" | "presencial" | null` (`null` = ausente, mesma convenção de
`checkedInAt`), calculado no service a partir de `saturday_restriction` já presente em
`candidates`/`applications` — sem tocar a tabela. A query de listagem (`CheckinRepository.listCandidates`)
já faz `JOIN` com `candidates`; basta selecionar `saturday_restriction` junto e mapear no
service (`saturday_restriction=1` → `"online"`, senão `"presencial"`, só quando `checked_in_at`
não é nulo).

**Rationale**: cumpre FR-010 ("sem introduzir nenhum campo novo de estado no candidato") —
o dado já existe desde a inscrição; é projeção, não persistência.

**Alternatives considered**: expor `saturdayRestriction: boolean` cru e deixar o front
decidir o rótulo — rejeitado porque o mapeamento (`true` → "online") é regra de negócio (D7
do backlog), não apresentação; pertence ao contrato/service, não ao componente React.

## D5. Autorização

**Decision**: `requireRole(ROLES.ADMIN)` nas rotas novas — mais restritivo que o check-in de
candidato atual (`ADMIN` + `AVALIADOR`), seguindo o padrão que a FEAT-0009 já estabeleceu
para o painel de avaliadores (FR-007 da spec 009, reafirmado como FR-007 desta spec).

**Rationale**: o próprio avaliador não confirma o próprio check-in pelo app (Assumption da
spec) — só o admin, presencialmente. Abrir para `AVALIADOR` permitiria que qualquer
avaliador marcasse presença de qualquer colega, o que a spec explicitamente não pede.

**Alternatives considered**: permitir que o host da edição também marque check-in dos
avaliadores (delegação operacional no dia do evento) — não descartado como ideia futura, mas
fora do escopo desta spec (nenhum FR pede isso); revisitar como ampliação, não retrabalho.
