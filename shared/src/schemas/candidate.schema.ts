import { z } from "zod";

import type { CandidateApplicationRow, CandidateRow, Course, Ethnicity, Gender, ReferralSource, Semester } from "./database.schema";

// ============================================================
// Enums — espelham as CHECK constraints de `candidates` (ver
// api/migrations/0001-schema.sql) e os tipos de database.schema.ts.
// `satisfies` garante que os dois não divirjam silenciosamente.
// ============================================================

export const CourseSchema = z.enum(
    ["eng-comp", "eng-civil", "eng-mecani", "eng-quimica", "eng-prod", "eng-automação", "eng-eletri", "arqui"],
    { errorMap: () => ({ message: "Selecione um curso" }) },
) satisfies z.ZodType<Course>;

export const SemesterSchema = z.union(
    [
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
        z.literal(7),
        z.literal(8),
        z.literal(9),
        z.literal(10),
    ],
    { errorMap: () => ({ message: "Selecione um semestre" }) },
) satisfies z.ZodType<Semester>;

export const GenderSchema = z.enum(["mascu", "fem", "outro"], {
    errorMap: () => ({ message: "Selecione um gênero" }),
}) satisfies z.ZodType<Gender>;

/** Padrão IBGE + opção de recusa (FEAT-0001 v2.0, seção 8.1). */
export const EthnicitySchema = z.enum(["branca", "preta", "parda", "amarela", "indigena", "nao-informado"], {
    errorMap: () => ({ message: "Selecione uma opção" }),
}) satisfies z.ZodType<Ethnicity>;

export const ReferralSourceSchema = z.enum(["instagram", "linkedin", "campus", "indicacao", "outros"], {
    errorMap: () => ({ message: "Selecione uma opção" }),
}) satisfies z.ZodType<ReferralSource>;

/** Aceita telefone BR com ou sem DDI/DDD formatado (ex: "(71) 98888-7777", "71988887777", "+55 71 8888-7777"). */
const PHONE_REGEX = /^(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

// ============================================================
// POST /candidate/pre-register (FEAT-0001 v2.0, seção 8.2)
//
// O wizard do front-end (FEAT-0001-UI v2.0) captura esses dados em 6 etapas,
// mas só envia tudo de uma vez no fim (etapa 6) — por isso o schema é
// quebrado em um pedaço por etapa (usado com `zodResolver` em cada form) e
// depois composto no schema de request completo, único ponto de verdade
// tanto para o front quanto para o backend.
// ============================================================

/** Etapa 1 — Dados Pessoais. */
export const PersonalDataStepSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Email inválido"),
    phone: z.string().regex(PHONE_REGEX, "Telefone inválido"),
    course: CourseSchema,
    semester: SemesterSchema,
    gender: GenderSchema,
});
export type PersonalDataStep = z.infer<typeof PersonalDataStepSchema>;

/** Etapa 2 — Como conheceu o processo seletivo. */
export const ReferralStepSchema = z.object({
    referralSource: ReferralSourceSchema,
});
export type ReferralStep = z.infer<typeof ReferralStepSchema>;

/**
 * Etapa 3 — Movimento EJ. `z.boolean().refine` (em vez de `z.literal(true)`)
 * mantém o tipo inferido como `boolean` — necessário para o checkbox
 * controlado do front (que passa por um estado `false` antes de marcado) —
 * enquanto a validação segue barrando o avanço se não estiver marcado.
 */
export const MejStepSchema = z.object({
    mejAcknowledged: z.boolean().refine((value) => value === true, {
        message: "É necessário confirmar que assistiu ao vídeo",
    }),
});
export type MejStep = z.infer<typeof MejStepSchema>;

/** Etapa 4 — Sobre você. Limites refletidos nos contadores de caracteres da UI. */
export const AboutStepSchema = z.object({
    experience: z
        .string()
        .min(1, "Conte um pouco sobre suas experiências")
        .max(1000, "Máximo de 1000 caracteres"),
    motivation: z
        .string()
        .min(1, "Conte sua motivação")
        .max(500, "Máximo de 500 caracteres"),
});
export type AboutStep = z.infer<typeof AboutStepSchema>;

/** Etapa 5 — Disponibilidade e Diversidade. */
export const AvailabilityStepSchema = z.object({
    saturdayRestriction: z.boolean({ errorMap: () => ({ message: "Selecione uma opção" }) }),
    specialNeeds: z.boolean({ errorMap: () => ({ message: "Selecione uma opção" }) }),
    ethnicity: EthnicitySchema,
});
export type AvailabilityStep = z.infer<typeof AvailabilityStepSchema>;

export const PreRegisterRequestSchema = PersonalDataStepSchema.merge(ReferralStepSchema)
    .merge(MejStepSchema)
    .merge(AboutStepSchema)
    .merge(AvailabilityStepSchema);
export type PreRegisterRequest = z.infer<typeof PreRegisterRequestSchema>;

export const PreRegisterResponseSchema = z.object({
    data: z.object({
        pendingId: z.string().uuid(),
        message: z.string(),
        expiresAt: z.string().datetime(),
    }),
});
export type PreRegisterResponse = z.infer<typeof PreRegisterResponseSchema>;

// ============================================================
// POST /candidate/confirm-otc (FEAT-0001, seção 8.2)
// ============================================================

/** Formato do OTC: 6 dígitos numéricos (FEAT-0001 seção 9, decisão #3 do prompt de implementação). */
export const OtcCodeSchema = z
    .string()
    .length(6, "O código deve ter 6 dígitos")
    .regex(/^\d{6}$/, "O código deve conter apenas números");

export const ConfirmOtcRequestSchema = z.object({
    pendingId: z.string().uuid(),
    code: OtcCodeSchema,
});
export type ConfirmOtcRequest = z.infer<typeof ConfirmOtcRequestSchema>;

export const ConfirmOtcResponseSchema = z.object({
    data: z.object({
        id: z.string().uuid(),
        status: z.literal("confirmed"),
        name: z.string(),
        email: z.string().email(),
        updatedAt: z.string().datetime(),
    }),
});
export type ConfirmOtcResponse = z.infer<typeof ConfirmOtcResponseSchema>;

// ============================================================
// Códigos de erro — mapeiam os cenários E1-E10 de FEAT-0001 (seção 5).
// Reaproveitados entre pre-register e confirm-otc: o mesmo código de
// domínio (ex: EMAIL_ALREADY_REGISTERED) pode ocorrer em E1 (pre-register)
// ou E10 (confirm-otc), diferenciados pelo endpoint e pelo `field`.
// ============================================================

export const CandidateErrorCode = {
    EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED", // E1, E10
    PHONE_ALREADY_REGISTERED: "PHONE_ALREADY_REGISTERED", // E2, E10
    INVALID_EMAIL: "INVALID_EMAIL", // E3
    INVALID_PHONE: "INVALID_PHONE", // E4
    OTC_NOT_FOUND: "OTC_NOT_FOUND", // E5 (expirado ou nunca existiu)
    INVALID_OTC: "INVALID_OTC", // E6
    INVALID_OTC_TYPE: "INVALID_OTC_TYPE", // E7
    TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS", // E9
} as const;

export type CandidateErrorCode = (typeof CandidateErrorCode)[keyof typeof CandidateErrorCode];

// ============================================================
// Entidade transitória — vive apenas no KV (FEAT-0001, seção 8.1).
// Não é um contrato HTTP (nunca é enviada ao/pelo cliente), mas fica em
// `shared` porque reaproveita os tipos de candidato/domínio já definidos
// aqui, evitando redefinir os mesmos enums no backend.
// ============================================================

export type OtcType = "confirm-email" | "reset-password";

export interface PendingRegistration {
    candidate: Pick<CandidateRow, "name" | "email" | "phone" | "course" | "semester" | "gender" | "ethnicity">;
    /** Novo em v2.0 — respostas do questionário (etapas 2-5 do wizard, FEAT-0001-UI v2.0). */
    application: Omit<CandidateApplicationRow, "id" | "candidate_id" | "created_at" | "updated_at">;
    otc: {
        /** Nunca armazenar o código em texto plano — apenas o hash. */
        code_hash: string;
        type: OtcType;
        attempts: number;
        max_attempts: number;
        /** Deve ser idêntico ao TTL da chave no KV — única fonte de verdade sobre expiração. */
        expires_at: string;
    };
    created_at: string;
}
