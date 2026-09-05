import { z } from "zod";

import type { MemberStatus } from "./database.schema";

// Membro da CIMATEC jr, como ele existe no banco da tec (Supabase).
// Único acoplamento da aplicação ao schema de um sistema externo (FEAT-0003, seção 8.1).

/**
 * Valores esperados, não garantidos: como o status é gravado no NOSSO D1
 * (`member_profiles.status`/`signup_requests.member_status`), TEXT livre sem
 * CHECK. `post_junior` era gravado como `inactive` até a emenda de
 * 2026-09-04 da FEAT-0008 (o nome antigo lia como "desligado", o oposto do
 * que significava — ver `specs/008-member-status-approval/research.md`,
 * R6/R7).
 *
 * Emenda 2026-09-05: o "banco da verdade" (Supabase/ERP) não tem mais coluna
 * de status — `TecMemberSchema` não traz `status` nenhum. Todo membro
 * encontrado em `members` é tratado como `active` (`register()` grava esse
 * valor fixo em `member_profiles.status`); `trainee`/`post_junior` continuam
 * só auto-declarados no cadastro (nunca lidos de lá).
 */
export const MemberStatusSchema = z.enum([
    "active",
    "post_junior",
    "trainee",
]) satisfies z.ZodType<MemberStatus>;

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
 * NOSSO D1 (`member_profiles.status`, `signup_requests.member_status`). Desde
 * a emenda 2026-09-05, o caminho da Supabase não lê mais `status` nenhum
 * (`TecMemberSchema` não tem esse campo — `register()` grava `"active"` fixo,
 * ver `auth.service.ts`), então esta função só se aplica ao NOSSO D1. Existe
 * para que a ordem entre a migration 0016 e o deploy do Worker não importe:
 * um valor `inactive` ainda gravado (staging não migrado, banco local
 * esquecido) não vira 500 — ver `specs/008-member-status-approval/research.md`, R7.
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

    full_name: z.string(),

    /** Alias de `institutional_email` — ver `TEC_MEMBER_SELECT`. */
    email: z.string(),
    phone: z.string(),
    birth_date: z.string().nullable(),

    /** TEXT livre na origem, sem corresponder aos enums da aplicação. */
    course: z.string(),
    semester: z.number().int(),

    /**
     * A origem também tem `sex` (mesmo enum) — não pedido em
     * `TEC_MEMBER_SELECT`. `gender` é o único campo que a aplicação usa pra
     * D1 (regra de balanceamento de grupos, `group-organization.ts`).
     */
    gender: z.string(),

    /** Alias de `color` — ver `TEC_MEMBER_SELECT`. Nome interno mantido por compatibilidade com `member_profiles.ethnicity`. */
    ethnicity: z.string(),

    created_at: z.string(),
    updated_at: z.string().nullable(),
});
export type TecMember = z.infer<typeof TecMemberSchema>;

/**
 * Colunas pedidas ao PostgREST (`?select=...`). Emenda 2026-09-05 (ERP
 * novo): `full_name`/`birth_date`/`updated_at` já nascem com o nome certo na
 * origem, sem precisar mais de alias (os dois typos antigos, `birth_data` e
 * `update_at`, não existem nesse schema). Dois aliases continuam
 * necessários — `email`/`ethnicity` são os nomes que o resto da aplicação
 * usa (`member_profiles`, o service, `/auth/me`); a origem chama essas
 * colunas de `institutional_email`/`color`. `status` e `manager` saíram da
 * origem — não são mais pedidos (ver `MemberStatusSchema`, docstring).
 */
export const TEC_MEMBER_SELECT = [
    "id",
    "full_name",
    "email:institutional_email",
    "phone",
    "birth_date",
    "course",
    "semester",
    "gender",
    "ethnicity:color",
    "created_at",
    "updated_at",
].join(",");
