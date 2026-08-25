import { z } from "zod";

import type { MemberStatus } from "./database.schema";

// Membro da CIMATEC jr, como ele existe no banco da tec (Supabase).
// Único acoplamento da aplicação ao schema de um sistema externo (FEAT-0003, seção 8.1).

/** Valores esperados, não garantidos: `status` é TEXT livre sem CHECK na origem. */
export const MemberStatusSchema = z.enum([
    "active",
    "inactive",
    "trainee",
]) satisfies z.ZodType<MemberStatus>;

/**
 * Todo status que a aplicação sabe interpretar (FEAT-0008, D3). Não confundir
 * com "quem pode entrar sem aprovação" — isso é `requiresApproval`. Um status
 * fora desta lista (incluindo os removidos `alumni`/`on_leave`) é tratado
 * como não reconhecido, nunca lança exceção (FR-002).
 */
export const RECOGNIZED_MEMBER_STATUSES = [
    "active",
    "inactive",
    "trainee",
] as const satisfies readonly MemberStatus[];

/**
 * Recebe `string | null` (não `MemberStatus`): a coluna é TEXT livre e
 * nullable na origem. Type predicate para que `null` desapareça do tipo após
 * a checagem.
 */
export function isRecognizedMemberStatus(
    status: string | null,
): status is MemberStatus {
    return (
        status !== null &&
        (RECOGNIZED_MEMBER_STATUSES as readonly string[]).includes(status)
    );
}

/**
 * `false` só para `"active"` — quem cria conta sem aprovação (FEAT-0008,
 * FR-003). `"inactive"` (pós-júnior) e `"trainee"` entram em fila de
 * aprovação (FR-004). Assume `status` já reconhecido — chamar depois de
 * `isRecognizedMemberStatus`.
 */
export function requiresApproval(status: MemberStatus): boolean {
    return status !== "active";
}

/**
 * Quem pode ser o avaliador "âncora" de um grupo com um trainee (feature 012,
 * FR-017) — um trainee sozinho não conta como avaliador válido. `"active"` e
 * `"inactive"` (pós-júnior) qualificam; `"trainee"` não. Nomeada pelo que a
 * regra decide, não pelo valor comparado — com `"inactive"` significando
 * pós-júnior, uma comparação de string solta se leria ao contrário.
 */
export function isEligibleToAnchorTrainee(status: MemberStatus): boolean {
    return status !== "trainee";
}

/** Shape de uma linha de `members` na resposta do PostgREST — entrada não confiável. */
export const TecMemberSchema = z.object({
    /** uuid na origem — o que `member_profiles.member_id` guarda. */
    id: z.string().uuid(),

    /** Alias de `name` — ver `TEC_MEMBER_SELECT`. */
    full_name: z.string(),
    email: z.string(),
    phone: z.string(),

    /** Alias de `birth_data` — ver `TEC_MEMBER_SELECT`. */
    birth_date: z.string().nullable(),

    /** TEXT livre na origem, sem corresponder aos enums da aplicação. */
    course: z.string(),
    semester: z.number().int(),
    gender: z.string(),
    ethnicity: z.string(),

    /**
     * Cru, não `MemberStatusSchema`: um status desconhecido não pode
     * derrubar o parse do membro inteiro (isso viraria 503 em vez de 403 —
     * ver `isEligibleMemberStatus`). Nullable pelo mesmo motivo: a coluna é
     * NULLABLE em produção.
     */
    status: z.string().nullable(),

    manager: z.boolean(),
    created_at: z.string(),

    /** Alias de `update_at` (typo na origem), nullable: linha nunca editada vem sem valor. */
    updated_at: z.string().nullable(),
});
export type TecMember = z.infer<typeof TecMemberSchema>;

/**
 * Colunas pedidas ao PostgREST (`?select=...`). Três aliases (`nosso:deles`)
 * traduzem nomes divergentes da origem — dois por typo (`birth_data`,
 * `update_at`) — mantendo a tradução só aqui, e não espalhada por
 * `member_profiles`, o service e `/auth/me`. Sem o alias certo, o PostgREST
 * devolve 400 e o cadastro vira 503 para todo mundo.
 */
export const TEC_MEMBER_SELECT = [
    "id",
    "full_name:name",
    "email",
    "phone",
    "birth_date:birth_data",
    "course",
    "semester",
    "gender",
    "ethnicity",
    "status",
    "manager",
    "created_at",
    "updated_at:update_at",
].join(",");
