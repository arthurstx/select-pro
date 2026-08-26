# Phase 0 Research: Descrição de necessidades especiais

Nenhum `NEEDS CLARIFICATION` ficou pendente no Technical Context do plan — a stack e os
padrões já existem no projeto. Este documento registra as decisões técnicas tomadas a
partir do código já existente (não escolhas de tecnologia nova).

## Decision: padrão de campo condicional no Zod

**Decision**: replicar o padrão já usado para `referralSourceOther` em `ReferralStepSchema`
(`shared/src/schemas/candidate.schema.ts`, linhas 130-149): um objeto "Fields" plano (sem
efeitos) com o campo novo `optional()`, e uma função `superRefine` separada e nomeada que
adiciona o issue no path do campo condicional quando a condição não é satisfeita. O schema
"Step" exportado é `Fields.superRefine(fn)`. No schema agregado (`RegisterRequestSchema`),
faz-se `.merge(Fields)` (não `.merge(Step)`, pois `ZodEffects` não tem `.merge`) e encadeia
`.superRefine(fn)` de novo no final, junto dos demais refinements já existentes.

**Rationale**: é o único precedente exato de "campo texto obrigatório condicionado a outro
campo do mesmo objeto" no schema de inscrição. Reusar a mesma forma mantém o arquivo
consistente e evita reinventar uma segunda convenção para o mesmo problema.

**Alternatives considered**: `z.discriminatedUnion` no boolean — rejeitado por exigir
reestruturar `AvailabilityStepSchema` e todo `RegisterRequestSchema` em uma union, quebrando
a composição atual por `.merge()` de cada etapa do wizard; custo de refactor desproporcional
ao ganho.

## Decision: migration aditiva, sem rebuild de tabela

**Decision**: `ALTER TABLE candidate_applications ADD COLUMN special_needs_description TEXT;`
— coluna nullable, sem `CHECK`, sem `DEFAULT`.

**Rationale**: D1/SQLite permite `ADD COLUMN` sem tocar em `UNIQUE`/`CHECK`/`FK` existentes.
A tabela `candidate_applications` não tem nenhuma dessas constraints envolvendo a coluna
nova, então o procedimento pesado de copiar-filhos/dropar/reconstruir (Princípio III, usado
nas migrations `0004` e `0007`) não se aplica aqui — confirmado revisando
`api/migrations/0007-candidate-edition-uniqueness.sql`, que já é a versão vigente da tabela.
Sem `CHECK` de tamanho no banco: a validação de 500 caracteres já é responsabilidade do Zod
(mesmo padrão de `referral_source_other`, que também não tem `CHECK` de tamanho no SQL).

**Alternatives considered**: `CHECK (length(special_needs_description) <= 500)` no banco —
rejeitado por duplicar uma regra que já vive no Zod (Princípio I: contrato compartilhado é a
fonte da verdade; regra de tamanho pertence ao schema, não ao SQL) e por introduzir um erro
de constraint do D1 que precisaria ser mapeado empiricamente (regra do projeto: mensagens de
erro de constraint são verificadas com `wrangler d1 execute --local`, não assumidas) sem
necessidade real.

## Decision: nível de exposição do campo nas respostas da API

**Decision**: `specialNeedsDescription` aparece em `CandidateApplicationDetailSchema`
(detalhe de UM candidato) para qualquer papel que já acessa esse detalhe hoje — mesmo nível
do boolean `specialNeeds`. Não aparece em `DashboardTotalsSchema` (agregado),
`DashboardCandidateItemSchema` (listagem) nem `CandidateCheckinItemSchema` (check-in) — TEXT
não entra nem como coluna, o repository não lê a coluna do banco nessas três queries.

**Rationale**: é a Assumption já registrada na spec, e o "não ler no repository" replica o
mecanismo comprovado em produção para `gender`/`ethnicity` (`api/src/repositories/
dashboard.repository.ts`, flag `includeDemographics`): a garantia de não vazamento é
estrutural (dado nunca sai do banco para essas superfícies), não uma omissão feita na borda
(um filtro de resposta que alguém pode esquecer de aplicar).

**Alternatives considered**: aplicar a mesma restrição de `role === ADMIN` usada para
gender/ethnicity — rejeitado pela Assumption documentada na spec (necessidade especial é
dado operacional relevante para host/avaliador no dia do evento, diferente de demografia
usada só para métricas).
