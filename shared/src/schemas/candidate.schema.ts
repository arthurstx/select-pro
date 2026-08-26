import { z } from "zod";

import type { Course, Ethnicity, Gender, ReferralSource, Semester } from "./database.schema";
import { toE164 } from "./phone.schema";

// Enums — espelham as CHECK constraints de `candidates` (api/migrations/0001-schema.sql).

/** `course` não tem CHECK no banco (FEAT-0001 v3.1) — este schema é o único validador. */
export const CourseSchema = z.enum(
    [
        "eng-computacao",
        "eng-civil",
        "eng-mecanica",
        "eng-quimica",
        "eng-producao",
        "eng-automacao",
        "eng-eletrica",
        "arquitetura",
    ],
    { errorMap: () => ({ message: "Selecione um curso" }) },
) satisfies z.ZodType<Course>;

export const COURSE_LABELS: Record<Course, string> = {
    "eng-computacao": "Engenharia de Computação",
    "eng-civil": "Engenharia Civil",
    "eng-mecanica": "Engenharia Mecânica",
    "eng-quimica": "Engenharia Química",
    "eng-producao": "Engenharia de Produção",
    "eng-automacao": "Engenharia de Automação",
    "eng-eletrica": "Engenharia Elétrica",
    arquitetura: "Arquitetura e Urbanismo",
};

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

export const GenderSchema = z.enum(["masculino", "feminino", "outro"], {
    errorMap: () => ({ message: "Selecione um gênero" }),
}) satisfies z.ZodType<Gender>;

/** Os rótulos não mudaram na FEAT-0006 — só as chaves deixaram de ser abreviadas. */
export const GENDER_LABELS: Record<Gender, string> = {
    masculino: "Masculino",
    feminino: "Feminino",
    outro: "Outro",
};

export const EthnicitySchema = z.enum(["branca", "preta", "parda", "amarela", "indigena", "nao-informado"], {
    errorMap: () => ({ message: "Selecione uma opção" }),
}) satisfies z.ZodType<Ethnicity>;

export const ETHNICITY_LABELS: Record<Ethnicity, string> = {
    branca: "Branca",
    preta: "Preta",
    parda: "Parda",
    amarela: "Amarela",
    indigena: "Indígena",
    "nao-informado": "Prefiro não informar",
};

export const ReferralSourceSchema = z.enum(["instagram", "linkedin", "campus", "indicacao", "outros"], {
    errorMap: () => ({ message: "Selecione uma opção" }),
}) satisfies z.ZodType<ReferralSource>;

export const REFERRAL_SOURCE_LABELS: Record<ReferralSource, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    campus: "Campus (Presencial)",
    indicacao: "Indicação",
    outros: "Outros",
};

/**
 * Valida e **normaliza para E.164** (FEAT-0006, seção 4.3).
 *
 * A normalização vive aqui, no schema, e não no service: assim front e API
 * usam exatamente o mesmo código, e a checagem prévia de duplicidade passa a
 * comparar valores canônicos. Antes disso ela errava por diferença de
 * máscara — `(71) 98888-7777` e `71988887777` eram duas linhas distintas que
 * passavam pelo `UNIQUE`.
 *
 * Não há mais regex de formato: `toE164` usa `libphonenumber-js/max`, que
 * cobre tudo que a regex cobria e mais o que ela não tinha como saber — DDD
 * inexistente, celular que não começa com 9, número repetido. A regex antiga
 * aceitava `(00) 00000-0000`.
 *
 * O `transform` é idempotente: o E.164 que sai daqui é aceito de volta na
 * entrada, então a API revalidar o que o front já normalizou é no-op.
 */
const PhoneSchema = z.string().transform((value, ctx) => {
    const normalized = toE164(value);

    if (!normalized) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Informe um telefone válido com DDD",
        });
        return z.NEVER;
    }

    return normalized;
});

// POST /candidate/register (FEAT-0001 v3.0, seção 8.2) — um schema por etapa
// do wizard, compostos no schema de request completo.

export const PersonalDataStepSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Email inválido"),
    phone: PhoneSchema,
    course: CourseSchema,
    semester: SemesterSchema,
    gender: GenderSchema,
});
export type PersonalDataStep = z.infer<typeof PersonalDataStepSchema>;

const ReferralStepFields = z.object({
    referralSource: ReferralSourceSchema,
    referralSourceOther: z.string().trim().max(100, "Máximo de 100 caracteres").optional(),
});

const requireOtherWhenOutros = (
    data: { referralSource: ReferralSource; referralSourceOther?: string },
    ctx: z.RefinementCtx,
) => {
    if (data.referralSource === "outros" && !data.referralSourceOther) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["referralSourceOther"],
            message: "Conte pra gente como você conheceu",
        });
    }
};

export const ReferralStepSchema = ReferralStepFields.superRefine(requireOtherWhenOutros);
export type ReferralStep = z.infer<typeof ReferralStepSchema>;

export const MejStepSchema = z.object({
    mejAcknowledged: z.boolean().refine((value) => value === true, {
        message: "É necessário confirmar que assistiu ao vídeo",
    }),
});
export type MejStep = z.infer<typeof MejStepSchema>;

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

const AvailabilityStepFields = z.object({
    saturdayRestriction: z.boolean({ errorMap: () => ({ message: "Selecione uma opção" }) }),
    specialNeeds: z.boolean({ errorMap: () => ({ message: "Selecione uma opção" }) }),
    /**
     * Condicional a `specialNeeds` (FEAT-0014) — obrigatório quando `true`, ignorado quando
     * `false` (o service força `null` na gravação independentemente do que chegar aqui).
     * Mesma forma de `referralSourceOther`: campo `optional()`, obrigatoriedade real via
     * `superRefine` abaixo.
     */
    specialNeedsDescription: z.string().trim().max(500, "Máximo de 500 caracteres").optional(),
    ethnicity: EthnicitySchema,
});

const requireDescriptionWhenSpecialNeeds = (
    data: { specialNeeds: boolean; specialNeedsDescription?: string },
    ctx: z.RefinementCtx,
) => {
    if (data.specialNeeds && !data.specialNeedsDescription) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["specialNeedsDescription"],
            message: "Descreva a necessidade especial",
        });
    }
};

export const AvailabilityStepSchema = AvailabilityStepFields.superRefine(requireDescriptionWhenSpecialNeeds);
export type AvailabilityStep = z.infer<typeof AvailabilityStepSchema>;

export const RegisterRequestSchema = PersonalDataStepSchema.merge(ReferralStepFields)
    .merge(MejStepSchema)
    .merge(AboutStepSchema)
    .merge(AvailabilityStepFields)
    .superRefine(requireOtherWhenOutros)
    .superRefine(requireDescriptionWhenSpecialNeeds);
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** `createdAt` vem do D1 como `"YYYY-MM-DD HH:MM:SS"`, não ISO-8601. */
export const RegisterResponseSchema = z.object({
    data: z.object({
        id: z.string().uuid(),
        status: z.literal("registered"),
        name: z.string(),
        email: z.string().email(),
        createdAt: z.string(),
    }),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// Códigos de erro — cenários E1-E6 de FEAT-0001 v3.0 (seção 5).

export const CandidateErrorCode = {
    EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED", // E1, E5
    PHONE_ALREADY_REGISTERED: "PHONE_ALREADY_REGISTERED", // E2, E5
    INVALID_EMAIL: "INVALID_EMAIL", // E3
    INVALID_PHONE: "INVALID_PHONE", // E4
} as const;

export type CandidateErrorCode = (typeof CandidateErrorCode)[keyof typeof CandidateErrorCode];
