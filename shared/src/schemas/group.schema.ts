import { z } from "zod";

import { AttendanceSchema } from "./checkin.schema";
import { EvaluatorRoleSchema } from "./evaluator.schema";

// Organização automática de grupos (FEAT-0012). `groups`, `group_evaluators` e
// `group_candidates` — órfãs desde `0001-schema.sql` — passam a ser usadas
// pela primeira vez aqui (data-model.md, migration 0014).

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

export const GroupModalitySchema = z.enum(["presencial", "online"]);
export type GroupModality = z.infer<typeof GroupModalitySchema>;

/**
 * Sem `gender` — mesma postura de `CandidateCheckinItemSchema` (FEAT-0005):
 * dado sensível de inscrição, nunca exposto por pessoa numa listagem comum.
 * O algoritmo usa gênero só internamente (D1); uma violação chega ao front
 * como o aviso `GENDER_RULE_VIOLATED`, nunca identificando quem.
 */
export const GroupCandidateSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    attendance: AttendanceSchema,
});
export type GroupCandidate = z.infer<typeof GroupCandidateSchema>;

export const GroupEvaluatorSchema = z.object({
    userId: z.string().uuid(),
    name: z.string(),
    role: EvaluatorRoleSchema,
});
export type GroupEvaluator = z.infer<typeof GroupEvaluatorSchema>;

/** `room: null` sempre que `modality === "online"` (FR-007) — nunca as duas coisas. */
export const GroupSummarySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    modality: GroupModalitySchema,
    room: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
    candidates: z.array(GroupCandidateSchema),
    /** Sempre `[]` para `modality === "online"` (FR-007) — sem alocação automática nesta versão. */
    evaluators: z.array(GroupEvaluatorSchema),
});
export type GroupSummary = z.infer<typeof GroupSummarySchema>;

/** `GET /groups` e `data.groups` do `POST /groups/organize`. */
export const GroupListResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
    }),
});
export type GroupListResponse = z.infer<typeof GroupListResponseSchema>;

/** FR-013 — só `POST /groups/organize` calcula esse número; `GET /groups` sempre devolve `0`. */
export const OrganizeResultResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema),
        unallocatedCandidateCount: z.number().int(),
    }),
});
export type OrganizeResultResponse = z.infer<typeof OrganizeResultResponseSchema>;

/**
 * `PATCH .../candidates/{id}` e `PATCH .../evaluators/{id}`. `warning` é
 * `"GENDER_RULE_VIOLATED"` quando o movimento deixa algum dos dois grupos
 * envolvidos com exatamente 1 mulher (FR-010) — aviso, não bloqueio: o corpo
 * ainda é `200`.
 */
export const MoveResultResponseSchema = z.object({
    data: z.object({
        groups: z.array(GroupSummarySchema).length(2),
        warning: z.literal("GENDER_RULE_VIOLATED").nullable(),
    }),
});
export type MoveResultResponse = z.infer<typeof MoveResultResponseSchema>;

export const GroupErrorCode = {
    /** `POST /groups/organize` sem nenhum candidato com check-in feito na edição. */
    NO_CANDIDATES_PRESENT: "NO_CANDIDATES_PRESENT",
    /** `POST /groups/organize` com candidato presencial presente e nenhuma sala cadastrada. */
    NO_ROOMS_AVAILABLE: "NO_ROOMS_AVAILABLE",
    /** `groupId` do `PATCH` não existe na edição corrente. */
    GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
    /** `candidateId` do `PATCH .../candidates/{id}` não está alocado a nenhum grupo da edição corrente. */
    CANDIDATE_NOT_ALLOCATED: "CANDIDATE_NOT_ALLOCATED",
    /** `userId` do `PATCH .../evaluators/{id}` não está alocado a nenhum grupo da edição corrente. */
    EVALUATOR_NOT_ALLOCATED: "EVALUATOR_NOT_ALLOCATED",
    /** Mover entre grupo presencial e online — invariante rígida (FR-003), sempre bloqueado. */
    GROUP_MODALITY_MISMATCH: "GROUP_MODALITY_MISMATCH",
} as const;
export type GroupErrorCode = (typeof GroupErrorCode)[keyof typeof GroupErrorCode];
