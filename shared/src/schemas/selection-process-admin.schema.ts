import { z } from "zod";

// Correção de processos seletivos (FEAT-0017). `selection_processes` existe
// desde a `0006-candidate-checkin.sql`, com `label UNIQUE`; esta feature só
// adiciona um caminho de escrita (listar + corrigir), sem coluna nova.
//
// Schema com nome próprio (`SelectionProcessAdmin*`), separado do
// `SelectionProcessSummarySchema` já existente em `checkin.schema.ts`
// (`{id, label}`, usado só no seletor de edição do dashboard) — este shape
// inclui `starts_at`/`ends_at`, que aquele não expõe.

export const SelectionProcessAdminSummarySchema = z.object({
    id: z.string().uuid(),
    label: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
});
export type SelectionProcessAdminSummary = z.infer<typeof SelectionProcessAdminSummarySchema>;

export const SelectionProcessAdminListResponseSchema = z.object({
    data: z.array(SelectionProcessAdminSummarySchema),
});
export type SelectionProcessAdminListResponse = z.infer<typeof SelectionProcessAdminListResponseSchema>;

export const SelectionProcessAdminResponseSchema = z.object({
    data: SelectionProcessAdminSummarySchema,
});
export type SelectionProcessAdminResponse = z.infer<typeof SelectionProcessAdminResponseSchema>;

/**
 * `PUT` substitui os três campos juntos (mesmo padrão de `UpdateRoomSchema`,
 * FEAT-0011) — a tela sempre pré-carrega os três antes de editar. FR-003:
 * `starts_at` precisa ser estritamente anterior a `ends_at`; validado aqui
 * via `.superRefine`, não no service (research.md, Decisão 3) — é uma regra
 * de forma do payload, sem depender de estado do banco.
 */
export const UpdateSelectionProcessAdminSchema = z
    .object({
        label: z.string().trim().min(1, "Informe o rótulo do processo seletivo"),
        starts_at: z.string().trim().min(1, "Informe a data de início"),
        ends_at: z.string().trim().min(1, "Informe a data de fim"),
    })
    .superRefine((value, ctx) => {
        if (value.starts_at >= value.ends_at) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "A data de início deve ser anterior à data de fim",
                path: ["starts_at"],
            });
        }
    });
export type UpdateSelectionProcessAdminDTO = z.infer<typeof UpdateSelectionProcessAdminSchema>;

/**
 * Só o erro novo desta feature. `id` inexistente reaproveita
 * `SelectionProcessNotFoundError`/`CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND`,
 * já existentes (research.md, Decisão 5) — não duplicado aqui.
 */
export const SelectionProcessAdminErrorCode = {
    SELECTION_PROCESS_LABEL_ALREADY_EXISTS: "SELECTION_PROCESS_LABEL_ALREADY_EXISTS",
} as const;
export type SelectionProcessAdminErrorCode =
    (typeof SelectionProcessAdminErrorCode)[keyof typeof SelectionProcessAdminErrorCode];
