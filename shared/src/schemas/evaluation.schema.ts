import { z } from "zod";

// Avaliação dos candidatos (FEAT-0013). `evaluations`/`evaluation_scores` (migration 0015)
// substituem `evaluations`/`metrics` — órfãs e com design errado desde `0001-schema.sql`.

// ------------------------------------------------------------
// Critérios e pesos — fixos nesta versão (spec.md, Assumptions)
// ------------------------------------------------------------

export const EvaluationCriterionSchema = z.enum([
    "raciocinio_logico",
    "trabalho_equipe",
    "lideranca",
    "proatividade",
    "comunicacao",
]);
export type EvaluationCriterion = z.infer<typeof EvaluationCriterionSchema>;

export const EvaluationColorSchema = z.enum(["RED", "YELLOW", "GREEN"]);
export type EvaluationColor = z.infer<typeof EvaluationColorSchema>;

export const EvaluationVerdictSchema = z.enum(["pendente", "aprovado", "reprovado"]);
export type EvaluationVerdict = z.infer<typeof EvaluationVerdictSchema>;

/** Soma 100% — data-model.md. Ordem aqui é a ordem de exibição no formulário/detalhe. */
export const CRITERION_WEIGHTS: Record<EvaluationCriterion, number> = {
    raciocinio_logico: 0.25,
    trabalho_equipe: 0.25,
    lideranca: 0.2,
    proatividade: 0.15,
    comunicacao: 0.15,
};

export const CRITERION_LABELS: Record<EvaluationCriterion, string> = {
    raciocinio_logico: "Raciocínio lógico e resolução de problemas",
    trabalho_equipe: "Trabalho em equipe",
    lideranca: "Liderança",
    proatividade: "Proatividade",
    comunicacao: "Comunicação e argumentação",
};

/**
 * FR-012. Pontuação de referência para o admin comparar candidatos — nunca decide veredito
 * (isso é `computeVerdict`, exclusivamente D2/D6). Escala 0-5, igual às notas individuais,
 * já que os pesos somam 100%.
 */
export function deriveWeightedScore(scores: Record<EvaluationCriterion, number>): number {
    return Object.entries(CRITERION_WEIGHTS).reduce(
        (total, [criterion, weight]) => total + scores[criterion as EvaluationCriterion] * weight,
        0,
    );
}

// ------------------------------------------------------------
// Requests
// ------------------------------------------------------------

const ScoresSchema = z.object({
    raciocinio_logico: z.number().int().min(0).max(5),
    trabalho_equipe: z.number().int().min(0).max(5),
    lideranca: z.number().int().min(0).max(5),
    proatividade: z.number().int().min(0).max(5),
    comunicacao: z.number().int().min(0).max(5),
});
export type EvaluationScores = z.infer<typeof ScoresSchema>;

/** `PUT /evaluations/candidates/{candidateId}` — FR-002. */
export const SubmitEvaluationSchema = z.object({
    scores: ScoresSchema,
    overallColor: EvaluationColorSchema,
    feedback: z.string().trim().min(1).optional(),
});
export type SubmitEvaluationDTO = z.infer<typeof SubmitEvaluationSchema>;

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

const EvaluationDetailSchema = z.object({
    scores: ScoresSchema,
    overallColor: EvaluationColorSchema,
    feedback: z.string().nullable(),
});

/** `GET /evaluations/my-group` — FR-001/FR-005. `myEvaluation: null` = ainda não avaliado. */
export const MyGroupCandidateSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    evaluationCount: z.number().int(),
    myEvaluation: EvaluationDetailSchema.nullable(),
});
export type MyGroupCandidate = z.infer<typeof MyGroupCandidateSchema>;

export const MyGroupResponseSchema = z.object({
    data: z.object({
        groupName: z.string(),
        candidates: z.array(MyGroupCandidateSchema),
    }),
});
export type MyGroupResponse = z.infer<typeof MyGroupResponseSchema>;

/** Resposta do `PUT` — mesmo shape do `myEvaluation` de cima. */
export const SubmitEvaluationResponseSchema = z.object({
    data: EvaluationDetailSchema,
});
export type SubmitEvaluationResponse = z.infer<typeof SubmitEvaluationResponseSchema>;

/** `GET /evaluations/admin/candidates` — FR-007/FR-012. */
export const AdminCandidateSummarySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    evaluationCount: z.number().int(),
    verdict: EvaluationVerdictSchema,
    /** `null` sem nenhuma avaliação ainda. */
    weightedScore: z.number().nullable(),
});
export type AdminCandidateSummary = z.infer<typeof AdminCandidateSummarySchema>;

export const AdminCandidatesListResponseSchema = z.object({
    data: z.object({
        candidates: z.array(AdminCandidateSummarySchema),
    }),
});
export type AdminCandidatesListResponse = z.infer<typeof AdminCandidatesListResponseSchema>;

/** `GET /evaluations/admin/candidates/{id}` — FR-008. Sem isolamento aqui: é a visão do admin. */
export const AdminEvaluationDetailSchema = z.object({
    evaluatorName: z.string(),
    scores: ScoresSchema,
    overallColor: EvaluationColorSchema,
    feedback: z.string().nullable(),
    weightedScore: z.number(),
});
export type AdminEvaluationDetail = z.infer<typeof AdminEvaluationDetailSchema>;

export const AdminCandidateDetailResponseSchema = z.object({
    data: z.object({
        id: z.string().uuid(),
        name: z.string(),
        verdict: EvaluationVerdictSchema,
        evaluations: z.array(AdminEvaluationDetailSchema),
    }),
});
export type AdminCandidateDetailResponse = z.infer<typeof AdminCandidateDetailResponseSchema>;

// `CANDIDATE_NOT_FOUND` é reaproveitado de `CheckinErrorCode` (FEAT-0005) — não duplicado aqui.
export const EvaluationErrorCode = {
    /** Avaliador logado não está alocado a nenhum grupo presencial da edição corrente. */
    NOT_IN_ANY_GROUP: "NOT_IN_ANY_GROUP",
    /** Candidato existe, mas não está no mesmo grupo do avaliador (FR-003). */
    CANDIDATE_NOT_IN_EVALUATOR_GROUP: "CANDIDATE_NOT_IN_EVALUATOR_GROUP",
} as const;
export type EvaluationErrorCode = (typeof EvaluationErrorCode)[keyof typeof EvaluationErrorCode];
