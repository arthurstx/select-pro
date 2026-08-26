import { z } from "zod";

import { MemberStatusSchema } from "./member.schema";

// Papel de host por edição do processo seletivo (FEAT-0009, D4).
// `edition_hosts` é tabela-de-fatos: a existência da linha (process_id, user_id)
// É o cargo, sem coluna de estado — ver data-model.md R1.

export const EvaluatorRoleSchema = z.enum(["avaliador", "host"]);
export type EvaluatorRole = z.infer<typeof EvaluatorRoleSchema>;

export const EvaluatorRoleFilterSchema = z.enum(["all", "avaliador", "host"]).default("all");
export type EvaluatorRoleFilter = z.infer<typeof EvaluatorRoleFilterSchema>;

export const SetEvaluatorRoleSchema = z.object({
    role: EvaluatorRoleSchema,
});
export type SetEvaluatorRoleDTO = z.infer<typeof SetEvaluatorRoleSchema>;

export const EvaluatorSummarySchema = z.object({
    userId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    memberStatus: MemberStatusSchema,
    role: EvaluatorRoleSchema,
});
export type EvaluatorSummary = z.infer<typeof EvaluatorSummarySchema>;

export const EvaluatorListResponseSchema = z.object({
    data: z.array(EvaluatorSummarySchema),
});
export type EvaluatorListResponse = z.infer<typeof EvaluatorListResponseSchema>;

export const EvaluatorResponseSchema = z.object({
    data: EvaluatorSummarySchema,
});
export type EvaluatorResponse = z.infer<typeof EvaluatorResponseSchema>;

/**
 * Só um código: `userId` do `PUT .../role` que não corresponde a nenhum
 * avaliador com conta ativa (id inexistente, admin, ou membro desativado).
 * Não descoberto no planejamento original — apareceu ao implementar a rota.
 */
export const EvaluatorErrorCode = {
    EVALUATOR_NOT_FOUND: "EVALUATOR_NOT_FOUND",
} as const;
export type EvaluatorErrorCode = (typeof EvaluatorErrorCode)[keyof typeof EvaluatorErrorCode];
