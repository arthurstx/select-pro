import {
    CRITERION_WEIGHTS,
    deriveWeightedScore,
    type AdminCandidateSummary,
    type AdminCandidateDetailResponse,
    type EvaluationColor,
    type EvaluationScores,
    type MyGroupCandidate,
    type SubmitEvaluationDTO,
} from "shared";

import { type Either, left, right } from "../core/either";
import { CandidateNotFoundError, NoActiveSelectionProcessError } from "../core/errors/checkin-errors";
import { CandidateNotInEvaluatorGroupError, NotInAnyGroupError } from "../core/errors/evaluation-errors";
import { logger } from "../lib/logger";
import type { CandidateRepository } from "../repositories/candidates.repository";
import type { EvaluationRepository, EvaluationScoreRow } from "../repositories/evaluation.repository";
import type { GroupRepository } from "../repositories/group.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { computeVerdict } from "./evaluation-verdict";

type MyGroupResult = { groupName: string; candidates: MyGroupCandidate[] };
type SubmitResult = { scores: EvaluationScores; overallColor: EvaluationColor; feedback: string | null };

export type MyGroupError = NoActiveSelectionProcessError | NotInAnyGroupError;
export type SubmitError = NoActiveSelectionProcessError | CandidateNotFoundError | NotInAnyGroupError | CandidateNotInEvaluatorGroupError;
export type AdminListError = NoActiveSelectionProcessError;
export type AdminDetailError = NoActiveSelectionProcessError | CandidateNotFoundError;

/** Orquestra `GroupRepository` (FEAT-0012, reaproveitado para elegibilidade) + `EvaluationRepository`. */
export class EvaluationService {
    constructor(
        private readonly evaluations: EvaluationRepository,
        private readonly groups: GroupRepository,
        private readonly candidates: CandidateRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    /** FR-001 — candidatos do grupo do avaliador logado, sem expor a avaliação de terceiros (FR-005). */
    async myGroup(userId: string, now: Date = new Date()): Promise<Either<MyGroupError, MyGroupResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const group = await this.groups.findEvaluatorGroup(userId, process.id);
        if (!group) return left(new NotInAnyGroupError());

        const allocations = await this.groups.listCandidateAllocationsForGroup(group.id);

        const candidates: MyGroupCandidate[] = [];
        for (const allocation of allocations) {
            const [count, mine] = await Promise.all([
                this.evaluations.countForCandidate(allocation.candidate_id),
                this.evaluations.findByEvaluatorAndCandidate(userId, allocation.candidate_id),
            ]);

            const myEvaluation = mine
                ? {
                      scores: scoresFromRows(await this.evaluations.getScores(mine.id)),
                      overallColor: mine.overall_color,
                      feedback: mine.feedback,
                  }
                : null;

            candidates.push({ id: allocation.candidate_id, name: allocation.name, evaluationCount: count, myEvaluation });
        }

        return right({ groupName: group.name, candidates });
    }

    /** FR-002/FR-003/FR-004 — cria ou substitui a avaliação do avaliador logado sobre `candidateId`. */
    async submit(
        userId: string,
        candidateId: string,
        dto: SubmitEvaluationDTO,
        now: Date = new Date(),
    ): Promise<Either<SubmitError, SubmitResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const candidate = await this.candidates.findById(candidateId);
        if (!candidate) return left(new CandidateNotFoundError());

        const evaluatorGroup = await this.groups.findEvaluatorGroup(userId, process.id);
        if (!evaluatorGroup) return left(new NotInAnyGroupError());

        const candidateGroup = await this.groups.findCandidateGroup(candidateId, process.id);
        if (!candidateGroup || candidateGroup.id !== evaluatorGroup.id) {
            return left(new CandidateNotInEvaluatorGroupError());
        }

        const feedback = dto.feedback ?? null;
        const stored = await this.evaluations.upsert({
            userId,
            candidateId,
            scores: dto.scores,
            overallColor: dto.overallColor,
            feedback,
        });

        logger.info("evaluation.submit.completed", { userId, candidateId });

        return right({ scores: dto.scores, overallColor: stored.overall_color, feedback: stored.feedback });
    }

    /** FR-007/FR-012 — todos os candidatos presentes da edição, com veredito e pontuação de referência. */
    async adminList(now: Date = new Date()): Promise<Either<AdminListError, AdminCandidateSummary[]>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const presentCandidates = await this.groups.listPresentCandidates(process.id);
        const candidateIds = presentCandidates.map((c) => c.id);

        const evaluationRows = await this.evaluations.listEvaluationsForCandidates(candidateIds);
        const evaluationIds = evaluationRows.map((e) => e.id);
        const scoreRows = await this.evaluations.listScoresForEvaluations(evaluationIds);

        const weightedByEvaluation = weightedScoresByEvaluation(scoreRows);

        const summaries: AdminCandidateSummary[] = presentCandidates.map((candidate) => {
            const own = evaluationRows.filter((e) => e.candidate_id === candidate.id);
            const colors = own.map((e) => e.overall_color);
            const weights = own.map((e) => weightedByEvaluation.get(e.id)).filter((v): v is number => v !== undefined);

            return {
                id: candidate.id,
                name: candidate.name,
                evaluationCount: own.length,
                verdict: computeVerdict(colors),
                weightedScore: weights.length > 0 ? average(weights) : null,
            };
        });

        return right(summaries);
    }

    /** FR-008 — detalhe de todas as avaliações de um candidato, com autor (sem isolamento — visão do admin). */
    async adminDetail(candidateId: string, now: Date = new Date()): Promise<Either<AdminDetailError, AdminCandidateDetailResponse["data"]>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);

        const candidate = await this.candidates.findById(candidateId);
        if (!candidate) return left(new CandidateNotFoundError());

        const evaluationRows = await this.evaluations.listForCandidate(candidateId);
        const evaluationIds = evaluationRows.map((e) => e.id);
        const scoreRows = await this.evaluations.listScoresForEvaluations(evaluationIds);
        const weightedByEvaluation = weightedScoresByEvaluation(scoreRows);

        const evaluations = evaluationRows.map((row) => ({
            evaluatorName: row.evaluator_name,
            scores: scoresFromRows(scoreRows.filter((s) => s.evaluation_id === row.id)),
            overallColor: row.overall_color,
            feedback: row.feedback,
            weightedScore: weightedByEvaluation.get(row.id) ?? 0,
        }));

        return right({
            id: candidate.id,
            name: candidate.name,
            verdict: computeVerdict(evaluationRows.map((e) => e.overall_color)),
            evaluations,
        });
    }

    // ------------------------------------------------------------

    /** Mesmo padrão de `checkin.service.ts`/`group.service.ts` — `resolveCurrent()` não deveria lançar, mas a guarda existe. */
    private async resolveCurrentProcess(now: Date): Promise<Either<NoActiveSelectionProcessError, { id: string }>> {
        try {
            const process = await this.processes.resolveCurrent(now);
            return right(process);
        } catch (err) {
            logger.error("evaluation.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }
}

function scoresFromRows(rows: EvaluationScoreRow[]): EvaluationScores {
    const scores = {} as EvaluationScores;
    for (const row of rows) {
        scores[row.criterion] = row.score;
    }
    return scores;
}

function weightedScoresByEvaluation(scoreRows: EvaluationScoreRow[]): Map<string, number> {
    const byEvaluation = new Map<string, EvaluationScoreRow[]>();
    for (const row of scoreRows) {
        const list = byEvaluation.get(row.evaluation_id) ?? [];
        list.push(row);
        byEvaluation.set(row.evaluation_id, list);
    }

    const result = new Map<string, number>();
    for (const [evaluationId, rows] of byEvaluation) {
        // Só calcula quando as 5 notas estão presentes — `upsert` sempre grava as 5 juntas,
        // então uma avaliação incompleta aqui indicaria um bug de gravação, não um estado válido.
        if (rows.length === Object.keys(CRITERION_WEIGHTS).length) {
            result.set(evaluationId, deriveWeightedScore(scoresFromRows(rows)));
        }
    }

    return result;
}

function average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
