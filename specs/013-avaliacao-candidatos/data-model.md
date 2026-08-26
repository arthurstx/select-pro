# Data Model — FEAT-0013 Avaliação dos candidatos

## Tabelas (migration `0015-candidate-evaluation.sql`)

Recria `evaluations` e substitui `metrics` (dropada, sem uso — research.md D-tech1).

```sql
CREATE TABLE evaluations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  overall_color TEXT NOT NULL CHECK (overall_color IN ('RED', 'YELLOW', 'GREEN')),
  feedback     TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT,

  UNIQUE (user_id, candidate_id)  -- FR-004: reenviar edita, nunca duplica
);

CREATE INDEX idx_evaluations_candidate ON evaluations(candidate_id);

CREATE TABLE evaluation_scores (
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion     TEXT NOT NULL CHECK (criterion IN (
    'raciocinio_logico', 'trabalho_equipe', 'lideranca', 'proatividade', 'comunicacao'
  )),
  score TEXT NOT NULL,  -- ver nota abaixo

  PRIMARY KEY (evaluation_id, criterion)
);
```

`score` é `INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5)` (a linha acima tem `TEXT` só por
limitação de destaque de sintaxe deste documento — a migration real usa `INTEGER`).

`ON DELETE RESTRICT` em `evaluations.user_id`: mesma postura de `candidate_checkins.checked_in_by`
(FEAT-0005) — apagar um usuário não pode apagar em silêncio quem avaliou o quê.
`ON DELETE CASCADE` em `evaluations.candidate_id`/`evaluation_scores.evaluation_id`: se um
candidato for removido (não existe rota para isso hoje, mas a FK precisa de uma política),
suas avaliações não ficam órfãs.

`metrics` (`id, type, score`) é removida sem substituta — não sobra nenhum consumidor dela
(research.md D-tech1); os "tipos de métrica" viram o enum fixo `criterion` acima.

## Entidades (domínio)

- **Avaliação**: liga um avaliador/host (`user_id`) a um candidato (`candidate_id`), com uma
  cor geral e um comentário opcional. No máximo uma por par (FR-004) — `UNIQUE` garante isso
  no banco, não só na lógica da aplicação.
- **Nota por critério**: uma das 5 notas (0-5) de uma avaliação, num dos 5 critérios fixos.
  Sempre as 5 presentes numa avaliação válida (FR-002) — a validação de "todas as 5 vieram"
  é do contrato Zod (`shared`), não do banco (`evaluation_scores` sozinha não impede uma
  avaliação com só 3 notas gravadas; é o service que grava as 5 atomicamente, `db.batch`).
- **Veredito**: `pendente | aprovado | reprovado`, nunca persistido — calculado a partir das
  avaliações do candidato a cada leitura (research.md D-tech4).
- **Pontuação ponderada**: número 0-5, calculado por `deriveWeightedScore` (`shared`) a
  partir das 5 notas de uma avaliação e dos pesos fixos dos critérios. Também calculável
  agregada por candidato (média das pontuações ponderadas de todas as avaliações que
  recebeu) — exibida ao admin (FR-012), nunca ao veredito.

## Critérios e pesos (fixos, `shared/src/schemas/evaluation.schema.ts`)

| Chave (`criterion`) | Rótulo | Peso |
|---|---|---|
| `raciocinio_logico` | Raciocínio lógico e resolução de problemas | 25% |
| `trabalho_equipe` | Trabalho em equipe | 25% |
| `lideranca` | Liderança | 20% |
| `proatividade` | Proatividade | 15% |
| `comunicacao` | Comunicação e argumentação | 15% |

`deriveWeightedScore(scores: Record<EvaluationCriterion, number>): number` — soma de
`score * peso` sobre os 5 critérios, resultado em 0-5 (mesma escala das notas individuais,
já que os pesos somam 100%).

## Fluxo de elegibilidade (FR-003, research.md D-tech3)

`EvaluationService.submit(userId, candidateId, ...)`:

1. `GroupRepository.findEvaluatorGroup(userId, processId)` → grupo do avaliador, ou erro
   `NOT_IN_ANY_GROUP` se ele não está alocado a nenhum grupo presencial da edição corrente.
2. `GroupRepository.findCandidateGroup(candidateId, processId)` → grupo do candidato, ou
   erro `CANDIDATE_NOT_IN_ANY_GROUP` se ele não está alocado.
3. Se os dois grupos não forem o mesmo `id` → erro `CANDIDATE_NOT_IN_EVALUATOR_GROUP`.
4. `db.batch`: upsert em `evaluations` (`ON CONFLICT (user_id, candidate_id) DO UPDATE`) +
   substituição atômica das 5 linhas de `evaluation_scores` (delete + insert, mais simples
   que 5 upserts individuais e sempre atômico dentro do mesmo `batch`).

## Fluxo de veredito (FR-006, research.md D-tech4)

```
evaluations do candidato
  → algum overall_color === 'RED'?  → "reprovado"  (D2, não espera D6)
  → total < 2?                      → "pendente"   (D6)
  → senão                            → "aprovado"
```

## Contrato de resposta (ver `contracts/evaluation-api.md` para os schemas Zod completos)

```
MyGroupCandidate {
  id: string
  name: string
  evaluationCount: number       // FR-005 — nunca quem, só quantos
  myEvaluation: {                // null se o avaliador logado ainda não avaliou
    scores: Record<EvaluationCriterion, number>
    overallColor: "RED" | "YELLOW" | "GREEN"
    feedback: string | null
  } | null
}

AdminCandidateSummary {
  id: string
  name: string
  evaluationCount: number
  verdict: "pendente" | "aprovado" | "reprovado"
  weightedScore: number | null   // null sem nenhuma avaliação ainda
}

AdminCandidateDetail {
  id: string
  name: string
  verdict: "pendente" | "aprovado" | "reprovado"
  evaluations: [{
    evaluatorName: string
    scores: Record<EvaluationCriterion, number>
    overallColor: "RED" | "YELLOW" | "GREEN"
    feedback: string | null
    weightedScore: number
  }]
}
```
