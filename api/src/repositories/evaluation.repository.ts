import type { EvaluationColor, EvaluationCriterion, EvaluationScores } from "shared";

export interface StoredEvaluation {
    id: string;
    user_id: string;
    candidate_id: string;
    overall_color: EvaluationColor;
    feedback: string | null;
}

export interface EvaluationScoreRow {
    evaluation_id: string;
    criterion: EvaluationCriterion;
    score: number;
}

export interface EvaluationWithEvaluatorRow {
    id: string;
    evaluator_name: string;
    overall_color: EvaluationColor;
    feedback: string | null;
}

const CRITERIA: EvaluationCriterion[] = [
    "raciocinio_logico",
    "trabalho_equipe",
    "lideranca",
    "proatividade",
    "comunicacao",
];

/**
 * `evaluations` (uma linha por par avaliador/candidato) + `evaluation_scores` (uma linha
 * por critério). Elegibilidade (FR-003) é responsabilidade de `GroupRepository`
 * (FEAT-0012, reaproveitado pelo service) — nada aqui sabe sobre grupos.
 */
export class EvaluationRepository {
    constructor(private readonly db: D1Database) {}

    async findByEvaluatorAndCandidate(userId: string, candidateId: string): Promise<StoredEvaluation | null> {
        return this.db
            .prepare(
                `SELECT id, user_id, candidate_id, overall_color, feedback
                   FROM evaluations
                  WHERE user_id = ? AND candidate_id = ?`,
            )
            .bind(userId, candidateId)
            .first<StoredEvaluation>();
    }

    async getScores(evaluationId: string): Promise<EvaluationScoreRow[]> {
        const { results } = await this.db
            .prepare(`SELECT evaluation_id, criterion, score FROM evaluation_scores WHERE evaluation_id = ?`)
            .bind(evaluationId)
            .all<EvaluationScoreRow>();

        return results ?? [];
    }

    /**
     * Cria ou substitui a avaliação inteira (FR-004 — reenviar edita, nunca duplica).
     * `evaluations` faz upsert por `UNIQUE (user_id, candidate_id)`; `evaluation_scores` é
     * sempre delete+insert das 5 linhas — mais simples que 5 upserts individuais e
     * igualmente atômico dentro do mesmo `db.batch`.
     */
    async upsert(input: {
        userId: string;
        candidateId: string;
        scores: EvaluationScores;
        overallColor: EvaluationColor;
        feedback: string | null;
    }): Promise<StoredEvaluation> {
        const existing = await this.findByEvaluatorAndCandidate(input.userId, input.candidateId);
        const id = existing?.id ?? crypto.randomUUID();

        const upsertEvaluation = this.db
            .prepare(
                `INSERT INTO evaluations (id, user_id, candidate_id, overall_color, feedback)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (user_id, candidate_id)
                 DO UPDATE SET overall_color = excluded.overall_color, feedback = excluded.feedback, updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(id, input.userId, input.candidateId, input.overallColor, input.feedback);

        const deleteScores = this.db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id = ?`).bind(id);

        const insertScores = CRITERIA.map((criterion) =>
            this.db
                .prepare(`INSERT INTO evaluation_scores (evaluation_id, criterion, score) VALUES (?, ?, ?)`)
                .bind(id, criterion, input.scores[criterion]),
        );

        await this.db.batch([upsertEvaluation, deleteScores, ...insertScores]);

        return {
            id,
            user_id: input.userId,
            candidate_id: input.candidateId,
            overall_color: input.overallColor,
            feedback: input.feedback,
        };
    }

    async countForCandidate(candidateId: string): Promise<number> {
        const row = await this.db
            .prepare(`SELECT COUNT(*) AS n FROM evaluations WHERE candidate_id = ?`)
            .bind(candidateId)
            .first<{ n: number }>();

        return row?.n ?? 0;
    }

    /** Uma avaliação por linha, com nome do avaliador — detalhe do admin (FR-008). */
    async listForCandidate(candidateId: string): Promise<EvaluationWithEvaluatorRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT e.id, u.name AS evaluator_name, e.overall_color, e.feedback
                   FROM evaluations e
                   INNER JOIN users u ON u.id = e.user_id
                  WHERE e.candidate_id = ?`,
            )
            .bind(candidateId)
            .all<EvaluationWithEvaluatorRow>();

        return results ?? [];
    }

    /**
     * Toda avaliação recebida por qualquer um dos `candidateIds` — usado para calcular
     * veredito e pontuação ponderada de todos os candidatos da listagem do admin em duas
     * queries só (esta + `listScoresForEvaluations`), sem N+1 por candidato (FR-007/FR-012).
     */
    async listEvaluationsForCandidates(
        candidateIds: string[],
    ): Promise<{ id: string; candidate_id: string; overall_color: EvaluationColor }[]> {
        if (candidateIds.length === 0) return [];

        const placeholders = candidateIds.map(() => "?").join(",");
        const { results } = await this.db
            .prepare(`SELECT id, candidate_id, overall_color FROM evaluations WHERE candidate_id IN (${placeholders})`)
            .bind(...candidateIds)
            .all<{ id: string; candidate_id: string; overall_color: EvaluationColor }>();

        return results ?? [];
    }

    async listScoresForEvaluations(evaluationIds: string[]): Promise<EvaluationScoreRow[]> {
        if (evaluationIds.length === 0) return [];

        const placeholders = evaluationIds.map(() => "?").join(",");
        const { results } = await this.db
            .prepare(`SELECT evaluation_id, criterion, score FROM evaluation_scores WHERE evaluation_id IN (${placeholders})`)
            .bind(...evaluationIds)
            .all<EvaluationScoreRow>();

        return results ?? [];
    }
}
