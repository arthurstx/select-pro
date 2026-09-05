import { z } from "zod";

import type { MemberStatus } from "./database.schema";

// Membro da CIMATEC jr, como ele existe no banco da tec (Supabase).
// Único acoplamento da aplicação ao schema de um sistema externo (FEAT-0003, seção 8.1).

/**
 * Valores esperados, não garantidos: `status` é TEXT livre sem CHECK na
 * origem (Supabase da tec). `post_junior` era gravado como `inactive` até a
 * emenda de 2026-09-04 da FEAT-0008 (o nome antigo lia como "desligado", o
 * oposto do que significava — ver `specs/008-member-status-approval/research.md`,
 * R6/R7). A partir dessa emenda, a Supabase só devolve `active`; `trainee` e
 * `post_junior` passam a ser auto-declarados no cadastro, nunca lidos de lá.
 */
export const MemberStatusSchema = z.enum([
    "active",
    "post_junior",
    "trainee",
]) satisfies z.ZodType<MemberStatus>;

/**
 * Todo status que a aplicação sabe interpretar (FEAT-0008, D3). Um status
 * fora desta lista (incluindo os removidos `alumni`/`on_leave`, e o legado
 * `inactive` pré-rename) é tratado como não reconhecido, nunca lança exceção
 * (FR-002). No caminho da Supabase isso é proposital mesmo após o rename —
 * ver `isRecognizedMemberStatus` vs. `normalizeStoredMemberStatus` abaixo.
 */
export const RECOGNIZED_MEMBER_STATUSES = [
    "active",
    "post_junior",
    "trainee",
] as const satisfies readonly MemberStatus[];

/**
 * Recebe `string | null` (não `MemberStatus`): a coluna é TEXT livre e
 * nullable na origem. Type predicate para que `null` desapareça do tipo após
 * a checagem.
 *
 * Usar apenas no caminho da Supabase (`register()` da trilha Efetivo). Um
 * `inactive` legado vindo de lá NÃO deve ser traduzido — desde a emenda de
 * 2026-09-04 esse caminho só reconhece `active`; qualquer outro valor é
 * recusado (FR-001-B). Para ler status já gravados no NOSSO D1, usar
 * `normalizeStoredMemberStatus`.
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
 * Status que uma pessoa pode declarar de si mesma no cadastro auto-declarado
 * (FEAT-0008, emenda 2026-09-04). `active` fica fora de propósito: é o único
 * valor que cria conta sem aprovação, e só nasce da consulta à Supabase — se
 * ele entrasse aqui, o payload da trilha auto-declarada poderia escaloná-lo.
 */
export const SelfDeclaredMemberStatusSchema = z.enum(["trainee", "post_junior"], {
    errorMap: () => ({ message: "Selecione seu vínculo com a CIMATEC jr" }),
});
export type SelfDeclaredMemberStatus = z.infer<typeof SelfDeclaredMemberStatusSchema>;

/** Rótulos em PT-BR para os 3 status — substitui os Records duplicados que existiam em cada tela do front (avaliadores, fila de solicitações, tela de decisão). */
export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
    active: "Efetivo",
    post_junior: "Pós-júnior",
    trainee: "Trainee",
};

/**
 * `member_profiles.member_id` é `NOT NULL UNIQUE` e guarda o uuid da tec.
 * Quem se auto-declara nunca teve esse uuid — ganha um sintético com este
 * prefixo, para (a) nunca colidir com um uuid real da Supabase e (b)
 * sinalizar a origem sem precisar de uma coluna nova (`selfDeclared` no
 * contrato é derivado disso, ver `auth.schema.ts`).
 */
export const SELF_DECLARED_MEMBER_ID_PREFIX = "self:";

export function newSelfDeclaredMemberId(): string {
    return `${SELF_DECLARED_MEMBER_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isSelfDeclaredMemberId(memberId: string): boolean {
    return memberId.startsWith(SELF_DECLARED_MEMBER_ID_PREFIX);
}

/**
 * Traduz o legado pré-migration-0016 (`inactive`) na leitura de linhas do
 * NOSSO D1 (`member_profiles.status`, `signup_requests.member_status`) —
 * NÃO no caminho da Supabase, onde `inactive` deve continuar sendo
 * rejeitado (ver `isRecognizedMemberStatus`). Existe para que a ordem entre
 * a migration 0016 e o deploy do Worker não importe: um valor `inactive`
 * ainda gravado (staging não migrado, banco local esquecido) não vira 500 —
 * ver `specs/008-member-status-approval/research.md`, R7.
 *
 * Devolve `null` para qualquer valor que não seja um `MemberStatus`
 * reconhecido nem o legado `inactive` — dado corrompido, decisão de cada
 * chamador (tipicamente lançar, nunca dar fallback silencioso).
 */
export function normalizeStoredMemberStatus(raw: string): MemberStatus | null {
    const value = raw === "inactive" ? "post_junior" : raw;
    const parsed = MemberStatusSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/**
 * Quem pode ser o avaliador "âncora" de um grupo com um trainee (feature 012,
 * FR-017) — um trainee sozinho não conta como avaliador válido. `"active"` e
 * `"post_junior"` qualificam; `"trainee"` não. Nomeada pelo que a
 * regra decide, não pelo valor comparado — com `"post_junior"` sendo o nome
 * correto desde a emenda de 2026-09-04 (antes, `"inactive"`), uma comparação
 * de string solta ainda seria menos clara que a intenção nomeada.
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
