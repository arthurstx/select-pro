import { z } from "zod";

import type { CandidateRow, Course, Gender, Semester } from "./database.schema";

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

/** Aceita telefone BR com ou sem DDI/DDD formatado (ex: "(71) 98888-7777", "71988887777", "+55 71 8888-7777"). */
const PHONE_REGEX = /^(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

// ============================================================
// POST /candidate/pre-register (FEAT-0001, seção 8.2)
// ============================================================

export const PreRegisterRequestSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Email inválido"),
    phone: z.string().regex(PHONE_REGEX, "Telefone inválido"),
    course: CourseSchema,
    semester: SemesterSchema,
    gender: GenderSchema,
});
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
    candidate: Pick<CandidateRow, "name" | "email" | "phone" | "course" | "semester" | "gender">;
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
