import { z } from "zod";

import type { Course, Ethnicity, Gender, ReferralSource, Semester } from "./database.schema";

// ============================================================
// Enums — espelham as CHECK constraints de `candidates` (ver
// api/migrations/0001-schema.sql) e os tipos de database.schema.ts.
// `satisfies` garante que os dois não divirjam silenciosamente.
// ============================================================

/**
 * Diferente dos outros enums deste arquivo, `course` não é espelhado por um
 * CHECK no banco (FEAT-0001 v3.1, seção 8.1) — este schema é o único validador.
 * Para adicionar um curso, basta incluí-lo aqui, em `Course` e em
 * `COURSE_LABELS`; não é preciso migration.
 */
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

/**
 * Nome por extenso de cada curso, para exibição. Vive aqui — e não no
 * componente de formulário — porque todo consumidor que precise renderizar um
 * curso (wizard, painel admin, export, email) deve ler o mesmo mapa: o slug é
 * o que trafega e é persistido, este é o texto que o usuário lê.
 *
 * O `Record<Course, string>` obriga o compilador a cobrar a entrada nova sempre
 * que um curso for adicionado a `Course`.
 *
 * O mesmo vale para `GENDER_LABELS`, `ETHNICITY_LABELS` e
 * `REFERRAL_SOURCE_LABELS` abaixo: os três nasceram dentro de componentes do
 * wizard e vieram para cá na FEAT-0002, quando a sincronização com a planilha
 * do Google passou a precisar exatamente dos mesmos rótulos.
 */
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

export const GenderSchema = z.enum(["mascu", "fem", "outro"], {
    errorMap: () => ({ message: "Selecione um gênero" }),
}) satisfies z.ZodType<Gender>;

export const GENDER_LABELS: Record<Gender, string> = {
    mascu: "Masculino",
    fem: "Feminino",
    outro: "Outro",
};

/** Padrão IBGE + opção de recusa (FEAT-0001 v2.0, seção 8.1). */
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

/** Aceita telefone BR com ou sem DDI/DDD formatado (ex: "(71) 98888-7777", "71988887777", "+55 71 8888-7777"). */
const PHONE_REGEX = /^(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

// ============================================================
// POST /candidate/register (FEAT-0001 v3.0, seção 8.2)
//
// O wizard do front-end (FEAT-0001-UI v3.0) captura esses dados em 6 etapas,
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
const ReferralStepFields = z.object({
    referralSource: ReferralSourceSchema,
    /**
     * Texto livre de "de onde conheceu" (FEAT-0001 v3.0, seção 8.2). Opcional no
     * shape porque as demais origens não o enviam; a obrigatoriedade condicional
     * (só em `outros`) vem de `requireOtherWhenOutros`.
     */
    referralSourceOther: z.string().trim().max(100, "Máximo de 100 caracteres").optional(),
});

/**
 * `.superRefine()` devolve um ZodEffects, que não pode entrar num `.merge()` —
 * por isso a regra condicional é uma função reaproveitada pelo schema da etapa
 * isolada e pelo payload completo, em vez de fazer parte do objeto.
 */
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

export const RegisterRequestSchema = PersonalDataStepSchema.merge(ReferralStepFields)
    .merge(MejStepSchema)
    .merge(AboutStepSchema)
    .merge(AvailabilityStepSchema)
    .superRefine(requireOtherWhenOutros);
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * `createdAt` é o `created_at` da linha do D1 (`CURRENT_TIMESTAMP`), que o
 * SQLite devolve como `"YYYY-MM-DD HH:MM:SS"` — não ISO-8601 com `T`/`Z`.
 * Tipado como string simples de propósito: `.datetime()` prometeria um formato
 * que o banco não entrega.
 */
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

// ============================================================
// Códigos de erro — mapeiam os cenários E1-E6 de FEAT-0001 v3.0 (seção 5).
// EMAIL/PHONE_ALREADY_REGISTERED cobrem dois pontos de detecção do mesmo
// conflito: a checagem prévia (E1/E2) e a constraint `unique` do insert (E5).
// ============================================================

export const CandidateErrorCode = {
    EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED", // E1, E5
    PHONE_ALREADY_REGISTERED: "PHONE_ALREADY_REGISTERED", // E2, E5
    INVALID_EMAIL: "INVALID_EMAIL", // E3
    INVALID_PHONE: "INVALID_PHONE", // E4
} as const;

export type CandidateErrorCode = (typeof CandidateErrorCode)[keyof typeof CandidateErrorCode];
