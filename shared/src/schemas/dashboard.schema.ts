import { z } from "zod";

import {
    CourseSchema,
    EthnicitySchema,
    GenderSchema,
    ReferralSourceSchema,
    SemesterSchema,
} from "./candidate.schema";
import { SelectionProcessSummarySchema } from "./checkin.schema";
import { PaginationMetaSchema, PaginationQuerySchema } from "./pagination.schema";

// Dashboard de inscrições (FEAT-0007). Ver também `checkin.schema.ts`
// (`SelectionProcessSummarySchema`, `CheckinErrorCode`) e
// `pagination.schema.ts`.
//
// A particularidade desta feature: é a primeira em que o PAPEL muda o corpo
// da resposta, e não só o acesso. Os campos restritos a `admin` são
// `.optional()` aqui e vêm AUSENTES para `avaliador` — nunca vazios, nunca
// nulos. Um array vazio diria "não há dado"; ausência diz "não é para você",
// e é o que permite ao front reagir à forma do payload em vez de consultar o
// papel (FEAT-0007-UI, seção 8).

// ------------------------------------------------------------
// Recorte de edição
// ------------------------------------------------------------

/**
 * `all` é um valor de domínio, não um `process_id` vazio (FEAT-0007, seção
 * 4.1). Parâmetro ausente = edição corrente; `all` = todas. Sem essa
 * distinção sobraria um terceiro estado ambíguo — `process_id=` — que
 * ninguém sabe ler.
 */
export const ALL_EDITIONS = "all";

export const ProcessScopeSchema = z.union([z.literal(ALL_EDITIONS), z.string().uuid()], {
    errorMap: () => ({ message: "Informe o id de uma edição ou `all`" }),
});
export type ProcessScope = z.infer<typeof ProcessScopeSchema>;

/** `by_edition` só muda algo com `process_id=all`; numa edição só, é equivalente a `sum`. */
export const DashboardMetricsModeSchema = z.enum(["sum", "by_edition"]);
export type DashboardMetricsMode = z.infer<typeof DashboardMetricsModeSchema>;

/**
 * Data pura (`AAAA-MM-DD`), não timestamp. O `regex` sozinho aceitaria
 * `2026-02-31`; o `refine` exige que a data exista de fato, comparando com o
 * que o `Date` devolve depois de normalizar.
 */
const DateOnlySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD")
    .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, "Data inexistente");

/**
 * E4 — intervalo invertido. Comparação lexicográfica basta porque
 * `AAAA-MM-DD` ordena igual à data que representa.
 *
 * Exportado além de aplicado no `superRefine` abaixo porque a UI precisa da
 * MESMA regra antes de montar a query (FEAT-0007-UI, seção 6): ela impede
 * aplicar em vez de deixar a API devolver `400`.
 */
export function isInvertedDateRange(range: { from?: string; to?: string }): boolean {
    return !!range.from && !!range.to && range.from > range.to;
}

// ------------------------------------------------------------
// Requests
// ------------------------------------------------------------

/** `GET /dashboard/metrics` (FEAT-0007, seção 8.2). */
export const DashboardMetricsQuerySchema = z.object({
    process_id: ProcessScopeSchema.optional(),
    mode: DashboardMetricsModeSchema.default("sum"),
});
export type DashboardMetricsQuery = z.infer<typeof DashboardMetricsQuerySchema>;

/**
 * Ordenação da listagem por data de inscrição. `recent` é o default de
 * sempre (FEAT-0007, seção 4.3, "mais recente para a mais antiga") — o
 * parâmetro só existe para inverter isso sob pedido de quem olha a tabela.
 */
export const DashboardCandidatesSortSchema = z.enum(["recent", "oldest"]);
export type DashboardCandidatesSort = z.infer<typeof DashboardCandidatesSortSchema>;

/** `GET /dashboard/candidates` (FEAT-0007, seção 8.2). Busca é só por `name`, como no check-in. */
export const DashboardCandidatesQuerySchema = PaginationQuerySchema.extend({
    process_id: ProcessScopeSchema.optional(),
    search: z.string().trim().min(1).optional(),
    /** Inclusive. */
    from: DateOnlySchema.optional(),
    /** Inclusive até o fim do dia — senão "de 12/08 a 12/08" não devolveria nada. */
    to: DateOnlySchema.optional(),
    sort: DashboardCandidatesSortSchema.default("recent"),
}).superRefine((query, ctx) => {
    if (isInvertedDateRange(query)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["to"],
            message: "A data final não pode ser anterior à inicial",
        });
    }
});
export type DashboardCandidatesQuery = z.infer<typeof DashboardCandidatesQuerySchema>;

// ------------------------------------------------------------
// Responses — métricas
// ------------------------------------------------------------

/**
 * União discriminada em vez de `process` opcional: com `kind = "all"` o campo
 * não existe, e o tipo diz isso. É a mesma decisão de "ausente ≠ vazio"
 * aplicada ao recorte.
 */
export const DashboardScopeSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("edition"), process: SelectionProcessSummarySchema }),
    z.object({ kind: z.literal("all") }),
]);
export type DashboardScope = z.infer<typeof DashboardScopeSchema>;

const EditionCountSchema = z.object({
    process: SelectionProcessSummarySchema,
    count: z.number().int().min(0),
});
export type EditionCount = z.infer<typeof EditionCountSchema>;

/**
 * As chaves são os SLUGS, não os rótulos — `eng-computacao`, não "Engenharia
 * de Computação". Os mapas de rótulo já existem em `candidate.schema.ts` e
 * são aplicados na exibição; devolver rótulo pela API duplicaria a tradução.
 *
 * `byEdition` só aparece com `mode=by_edition`, e é o que alimenta o
 * comparativo da UI.
 */
const distributionOf = <K extends z.ZodTypeAny>(key: K) =>
    z.array(
        z.object({
            key,
            count: z.number().int().min(0),
            byEdition: z.array(EditionCountSchema).optional(),
        }),
    );

export const DashboardTotalsSchema = z.object({
    candidates: z.number().int().min(0),
    /** Quantos cursos distintos aparecem no recorte. */
    coursesRepresented: z.number().int().min(0),
    /** Quantos cursos existem — o denominador de "8 de 8". */
    coursesTotal: z.number().int().min(0),
    specialNeeds: z.number().int().min(0),
    saturdayRestriction: z.number().int().min(0),
});
export type DashboardTotals = z.infer<typeof DashboardTotalsSchema>;

export const DashboardMetricsSchema = z.object({
    scope: DashboardScopeSchema,
    totals: DashboardTotalsSchema,
    byCourse: distributionOf(CourseSchema),
    bySemester: distributionOf(SemesterSchema),
    byReferralSource: distributionOf(ReferralSourceSchema),
    /**
     * Uma inscrição por dia (`AAAA-MM-DD`), para todo papel — data de
     * inscrição não é dado demográfico. Ao contrário das demais
     * distribuições, os dias SEM inscrição entram com `count: 0`: o gráfico
     * de linha que consome isto precisa do intervalo contínuo para mostrar
     * queda de ritmo, não só picos (FEAT-0007-UI, seção 5.1). O
     * preenchimento vai do primeiro ao último dia com QUALQUER inscrição no
     * recorte — nunca até "hoje", ou uma edição encerrada ganharia uma
     * cauda de zeros sem significado.
     */
    byDay: distributionOf(z.string()),
    /** Só para `admin` — ausente para `avaliador`, ver nota do topo. */
    byGender: distributionOf(GenderSchema).optional(),
    /**
     * Só para `admin`, e apenas no total geral: etnia NUNCA é cruzada com
     * curso ou semestre (FEAT-0007, seção 9). Em turma pequena o cruzamento
     * reidentifica pessoa; o agregado, não.
     */
    byEthnicity: distributionOf(EthnicitySchema).optional(),
});
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

export const DashboardMetricsResponseSchema = z.object({ data: DashboardMetricsSchema });
export type DashboardMetricsResponse = z.infer<typeof DashboardMetricsResponseSchema>;

// ------------------------------------------------------------
// Responses — listagem
// ------------------------------------------------------------

/**
 * Deliberadamente SEM `gender` e `ethnicity`, para qualquer papel: demografia
 * existe aqui como estatística agregada, não como coluna de tabela. E sem
 * `experience`/`motivation` — 1500 caracteres × 25 linhas por página, para
 * nada (FEAT-0007, seção 8.1).
 */
export const DashboardCandidateItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    /** E.164 desde a FEAT-0006 — formatado na exibição por `formatPhone`. */
    phone: z.string(),
    course: CourseSchema,
    semester: z.number().int(),
    createdAt: z.string(),
    /**
     * Em cada item, não só no topo: com `process_id=all` a mesma pessoa
     * aparece em edições diferentes, e sem isto as duas linhas seriam
     * indistinguíveis. É a recandidatura que a FEAT-0006 destravou.
     */
    process: SelectionProcessSummarySchema,
});
export type DashboardCandidateItem = z.infer<typeof DashboardCandidateItemSchema>;

export const DashboardCandidatesResponseSchema = z.object({
    data: z.object({
        items: z.array(DashboardCandidateItemSchema),
        pagination: PaginationMetaSchema,
    }),
});
export type DashboardCandidatesResponse = z.infer<typeof DashboardCandidatesResponseSchema>;

// ------------------------------------------------------------
// Responses — detalhe
// ------------------------------------------------------------

export const CandidateApplicationDetailSchema = z.object({
    referralSource: ReferralSourceSchema,
    /**
     * `null` quando a origem não é `outros`. Aqui nulo é a resposta certa:
     * a pergunta foi feita e não se aplica — diferente da ausência de
     * `demographics`, que significa "não é para você".
     */
    referralSourceOther: z.string().nullable(),
    experience: z.string(),
    motivation: z.string(),
    saturdayRestriction: z.boolean(),
    specialNeeds: z.boolean(),
    /**
     * `null` quando `specialNeeds = false` OU quando `true` mas o candidato é anterior à
     * FEAT-0014 (legado, sem descrição gravada) — mesma convenção de "ausente = null" de
     * `referralSourceOther`. Sem gate por papel: mesmo nível de acesso do boolean
     * `specialNeeds`, não o nível restrito de `demographics` (ver spec 014, Assumptions).
     */
    specialNeedsDescription: z.string().nullable(),
});
export type CandidateApplicationDetail = z.infer<typeof CandidateApplicationDetailSchema>;

export const CandidateDemographicsSchema = z.object({
    gender: GenderSchema,
    ethnicity: EthnicitySchema,
});
export type CandidateDemographics = z.infer<typeof CandidateDemographicsSchema>;

export const CandidateDetailSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    course: CourseSchema,
    semester: z.number().int(),
    createdAt: z.string(),
    /** A edição da inscrição vem no corpo: o detalhe não é filtrado por recorte. */
    process: SelectionProcessSummarySchema,
    application: CandidateApplicationDetailSchema,
    /** Só para `admin` — mesma regra de `byGender`/`byEthnicity`. */
    demographics: CandidateDemographicsSchema.optional(),
});
export type CandidateDetail = z.infer<typeof CandidateDetailSchema>;

export const CandidateDetailResponseSchema = z.object({ data: CandidateDetailSchema });
export type CandidateDetailResponse = z.infer<typeof CandidateDetailResponseSchema>;

// ------------------------------------------------------------
// Responses — edições
// ------------------------------------------------------------

/**
 * `GET /dashboard/editions` — o catálogo que alimenta o seletor de edição.
 *
 * Existe porque as outras três rotas apenas CONSOMEM `process_id`; nenhuma o
 * enumera, e sem esta lista o front saberia qual é a corrente mas não teria o
 * uuid da anterior. Alternativa descartada: derivar o label pela regra de
 * calendário no cliente, o que duplicaria a regra e faria aparecer no seletor
 * edições que nunca existiram.
 */
export const SelectionProcessListResponseSchema = z.object({
    data: z.object({
        /** Da mais recente para a mais antiga. */
        editions: z.array(SelectionProcessSummarySchema),
        /** Resolvida sob demanda, então está sempre presente em `editions`. */
        current: SelectionProcessSummarySchema,
    }),
});
export type SelectionProcessListResponse = z.infer<typeof SelectionProcessListResponseSchema>;
