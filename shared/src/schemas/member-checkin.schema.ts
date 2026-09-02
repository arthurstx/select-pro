import { z } from "zod";

import { EvaluatorRoleSchema } from "./evaluator.schema";
import { SelectionProcessSummarySchema } from "./checkin.schema";

// Check-in de membros — avaliadores/hosts da edição corrente (FEAT-0010,
// US1/US2). Espelha o par estado-atual/histórico de `checkin.schema.ts`
// (candidatos, FEAT-0005), mas para o outro lado da mesa. `EvaluatorRoleSchema`
// e `SelectionProcessSummarySchema` são reaproveitados, não redeclarados
// (Princípio I).

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

/**
 * Um avaliador/host da edição corrente, com estado de presença.
 * Sem paginação: uma edição tem dezenas de pessoas, não milhares
 * (plan.md, Technical Context).
 */
export const MemberCheckinItemSchema = z.object({
    userId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: EvaluatorRoleSchema,
    /** `null` = ausente. Mesma convenção de `CandidateCheckinItem.checkedInAt`. */
    checkedInAt: z.string().nullable(),
});
export type MemberCheckinItem = z.infer<typeof MemberCheckinItemSchema>;

/** FR-006 — resumo "X de Y presentes" da edição corrente. */
export const MemberCheckinSummarySchema = z.object({
    total: z.number().int(),
    checkedIn: z.number().int(),
});
export type MemberCheckinSummary = z.infer<typeof MemberCheckinSummarySchema>;

export const MemberCheckinListResponseSchema = z.object({
    data: z.object({
        process: SelectionProcessSummarySchema,
        items: z.array(MemberCheckinItemSchema),
        summary: MemberCheckinSummarySchema,
    }),
});
export type MemberCheckinListResponse = z.infer<typeof MemberCheckinListResponseSchema>;

/**
 * `PUT /member-checkins/{id}/checkin`. Igual ao `CheckinResponseSchema` de
 * candidato: devolve o estado resultante — em marcação repetida (idempotente),
 * o `checkedInAt` é o da confirmação original.
 */
export const MemberCheckinResponseSchema = z.object({
    data: z.object({
        userId: z.string().uuid(),
        checkedInAt: z.string(),
    }),
});
export type MemberCheckinResponse = z.infer<typeof MemberCheckinResponseSchema>;

// ------------------------------------------------------------
// Erros
// ------------------------------------------------------------

// FR-008 (sem processo corrente) reaproveita `CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS`
// diretamente nas rotas — não duplicado aqui.
export const MemberCheckinErrorCode = {
    /**
     * FR-009 — edição corrente existe, mas ninguém foi atribuído como
     * avaliador/host nela ainda (FEAT-0009). Distinto de "sem processo
     * corrente": aqui a edição existe, só não tem elegíveis (Edge Cases da spec).
     */
    NO_EVALUATORS_IN_EDITION: "NO_EVALUATORS_IN_EDITION",
} as const;
export type MemberCheckinErrorCode = (typeof MemberCheckinErrorCode)[keyof typeof MemberCheckinErrorCode];
