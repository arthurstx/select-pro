import { z } from "zod";

import { CourseSchema } from "./candidate.schema";
import { PaginationMetaSchema, PaginationQuerySchema } from "./pagination.schema";

// Check-in de candidatos (FEAT-0005). Ver também `pagination.schema.ts`
// (genérico) e `database.schema.ts` (Row types).

// ------------------------------------------------------------
// Requests
// ------------------------------------------------------------

export const CheckinStatusFilterSchema = z.enum(["todos", "presentes", "ausentes"]);
export type CheckinStatusFilter = z.infer<typeof CheckinStatusFilterSchema>;

/**
 * `GET /candidates` (FEAT-0005, seção 8.2; filtro por curso na FEAT-0015).
 * Busca é só por `name` — sem CPF/matrícula no domínio. `course` ausente =
 * todos os cursos; reusa `CourseSchema` (mesmo validador do domínio,
 * Princípio I) em vez de um enum próprio.
 */
export const ListCandidatesQuerySchema = PaginationQuerySchema.extend({
    search: z.string().trim().min(1).optional(),
    status: CheckinStatusFilterSchema.default("todos"),
    course: CourseSchema.optional(),
});
export type ListCandidatesQuery = z.infer<typeof ListCandidatesQuerySchema>;

// ------------------------------------------------------------
// Responses
// ------------------------------------------------------------

export const SelectionProcessSummarySchema = z.object({
    id: z.string().uuid(),
    label: z.string(),
});
export type SelectionProcessSummary = z.infer<typeof SelectionProcessSummarySchema>;

/**
 * Item da listagem. Deliberadamente SEM `gender` nem `ethnicity` — dado
 * sensível de inscrição, e esta tela é aberta num celular na porta de um
 * evento (FEAT-0005, seção 8.3). `phone` sai como está, sem formato
 * garantido — não padronizado até a spec seguinte.
 */
export const CandidateCheckinItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    course: CourseSchema,
    semester: z.number().int(),
    /** `null` = ausente. Não existe campo `present` separado — um único fato, uma única fonte. */
    checkedInAt: z.string().nullable(),
});
export type CandidateCheckinItem = z.infer<typeof CandidateCheckinItemSchema>;

export const ListCandidatesResponseSchema = z.object({
    data: z.object({
        process: SelectionProcessSummarySchema,
        items: z.array(CandidateCheckinItemSchema),
        pagination: PaginationMetaSchema,
    }),
});
export type ListCandidatesResponse = z.infer<typeof ListCandidatesResponseSchema>;

/**
 * `PUT /candidates/{id}/checkin` e `DELETE .../checkin` (implícito via 204)
 * devolvem o estado resultante, não o efeito. Em E4 (presença já
 * confirmada), `checkedInAt` é o da confirmação ORIGINAL — quem chegou
 * primeiro é quem fica registrado.
 */
export const CheckinResponseSchema = z.object({
    data: z.object({
        candidateId: z.string().uuid(),
        checkedInAt: z.string(),
    }),
});
export type CheckinResponse = z.infer<typeof CheckinResponseSchema>;

// Códigos de erro — cenários E1-E10 de FEAT-0005 (seção 5). `INSUFFICIENT_ROLE`
// (E9) não mora aqui: é o primeiro código de autorização do projeto e vive em
// `AuthErrorCode`, junto dos demais códigos de acesso.

export const CheckinErrorCode = {
    CANDIDATE_NOT_FOUND: "CANDIDATE_NOT_FOUND", // E1
    NO_ACTIVE_SELECTION_PROCESS: "NO_ACTIVE_SELECTION_PROCESS", // E2 — guarda de invariante, não configuração faltando
    CANDIDATE_NOT_IN_ACTIVE_PROCESS: "CANDIDATE_NOT_IN_ACTIVE_PROCESS", // E3
    /**
     * FEAT-0007 (E3): `process_id` que não corresponde a nenhuma edição.
     * Mora aqui, e não num enum novo, porque é do domínio de processo
     * seletivo — vizinho de `NO_ACTIVE_SELECTION_PROCESS`, apesar do nome
     * deste enum. Um enum novo com um código só seria pior.
     */
    SELECTION_PROCESS_NOT_FOUND: "SELECTION_PROCESS_NOT_FOUND",
} as const;

export type CheckinErrorCode = (typeof CheckinErrorCode)[keyof typeof CheckinErrorCode];
