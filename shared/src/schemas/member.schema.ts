import { z } from "zod";

import type { MemberStatus } from "./database.schema";

// Membro da CIMATEC jr, como ele existe no banco da tec (Supabase).
// Único acoplamento da aplicação ao schema de um sistema externo (FEAT-0003, seção 8.1).

/** Valores esperados, não garantidos: `status` é TEXT livre sem CHECK na origem. */
export const MemberStatusSchema = z.enum([
    "active",
    "inactive",
    "alumni",
    "on_leave",
]) satisfies z.ZodType<MemberStatus>;

/**
 * Quem pode criar conta. `on_leave` e `alumni` ficam de fora nesta versão
 * (FEAT-0003, seção 10, pergunta 3).
 */
export const ELIGIBLE_MEMBER_STATUSES = ["active"] as const satisfies readonly MemberStatus[];

export type EligibleMemberStatus = (typeof ELIGIBLE_MEMBER_STATUSES)[number];

/**
 * Recebe `string | null` (não `MemberStatus`): a coluna é TEXT livre e
 * nullable na origem. Type predicate para que `null` desapareça do tipo após
 * a checagem.
 */
export function isEligibleMemberStatus(
    status: string | null,
): status is EligibleMemberStatus {
    return (
        status !== null &&
        (ELIGIBLE_MEMBER_STATUSES as readonly string[]).includes(status)
    );
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
