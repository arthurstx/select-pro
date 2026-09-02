import { z } from "zod";

import { CourseSchema } from "./candidate.schema";
import { isInvertedDateRange, ProcessScopeSchema } from "./dashboard.schema";

// Exportação de candidatos em CSV (FEAT-0016). Ver `dashboard.schema.ts`
// (`ProcessScopeSchema`, `isInvertedDateRange` — mesmo vocabulário de recorte
// e o mesmo E4 de intervalo invertido, não duplicados aqui) e
// `candidate.schema.ts` (os mapas de rótulo usados para traduzir as colunas).
//
// Diferente de todo outro contrato do projeto, a RESPOSTA desta rota não é
// JSON — é `text/csv`. Por isso não há um `...ResponseSchema` aqui: o
// contrato de fato da resposta são as colunas abaixo, documentadas também em
// `specs/012-exportacao-csv-candidatos/contracts/export.md`.

// ------------------------------------------------------------
// Request
// ------------------------------------------------------------

/**
 * A checagem de formato (`regex`) e a de existência (`refine`) SEMPRE rodam
 * as duas, mesmo quando a primeira já falhou — é assim que o Zod encadeia
 * checks de `ZodString` (não há short-circuit). Por isso o `refine` precisa
 * tolerar entrada fora do formato: `new Date("31-08-2026T00:00:00.000Z")` não
 * é `Invalid Date` (o `Date` do V8 aceita formatos fora do ISO), mas pode
 * devolver algo cujo `.toISOString()` lança `RangeError` para outras
 * entradas — daí o `isNaN(getTime())` antes de chamar `.toISOString()`.
 */
const DateOnlySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD")
    .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Data inexistente");

/**
 * `GET /exports/candidates`. Sem paginação — a exportação sempre devolve o
 * recorte inteiro (spec, seção "Assumptions").
 *
 * `include_sensitive` chega como string na query (`"true"`/`"false"`), nunca
 * boolean nativo — é assim que toda query HTTP chega. Default `"false"`:
 * ausência do parâmetro nunca inclui gênero/etnia por acidente (FR-004).
 */
export const ExportCandidatesQuerySchema = z
    .object({
        process_id: ProcessScopeSchema.optional(),
        search: z.string().trim().min(1).optional(),
        /** Inclusive. */
        from: DateOnlySchema.optional(),
        /** Inclusive até o fim do dia. */
        to: DateOnlySchema.optional(),
        /** Mesmo filtro da tabela do painel (FEAT-0015) — exportar deve refletir o recorte visível na tela. */
        course: CourseSchema.optional(),
        include_sensitive: z
            .enum(["true", "false"])
            .default("false")
            .transform((value) => value === "true"),
    })
    .superRefine((query, ctx) => {
        if (isInvertedDateRange(query)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["to"],
                message: "A data final não pode ser anterior à inicial",
            });
        }
    });
export type ExportCandidatesQuery = z.infer<typeof ExportCandidatesQuerySchema>;

// ------------------------------------------------------------
// Erros
// ------------------------------------------------------------

/**
 * Só reexporta o vocabulário — o `code` de fato usado na rota é
 * `CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND` (reaproveitado, ver
 * `api/src/core/errors/checkin-errors.ts`). Este enum existe só para o front
 * (se um dia consumir esta rota) ter um nome de domínio de export, sem
 * importar de `checkin.schema.ts` para ler um erro de export.
 */
export const ExportErrorCode = {
    SELECTION_PROCESS_NOT_FOUND: "SELECTION_PROCESS_NOT_FOUND",
} as const;
export type ExportErrorCode = (typeof ExportErrorCode)[keyof typeof ExportErrorCode];

// ------------------------------------------------------------
// Colunas do CSV — o contrato "de fato" da resposta
// ------------------------------------------------------------

/**
 * Sempre presentes, nesta ordem, com cabeçalho em português (mesma convenção
 * de rótulo de `COURSE_LABELS` etc.). SEM `experience`/`motivation` (texto
 * longo, fora de escopo nesta versão — spec, "Assumptions") e SEM
 * `genero`/`etnia` (só entram via `EXPORT_SENSITIVE_CSV_COLUMNS`, abaixo).
 */
export const EXPORT_CSV_COLUMNS = [
    "id",
    "nome",
    "email",
    "telefone",
    "curso",
    "semestre",
    "edicao",
    "data_inscricao",
    "origem_divulgacao",
    "origem_divulgacao_outro",
    "restricao_sabado",
    "necessidades_especiais",
] as const;
export type ExportCsvColumn = (typeof EXPORT_CSV_COLUMNS)[number];

/**
 * Só entram no arquivo quando `include_sensitive=true` (spec, US2/FR-004) —
 * extensão ao CSV da mesma decisão de privacidade já em vigor no
 * dashboard/check-in (gênero/etnia omitidos de toda listagem, para qualquer
 * papel). `telefone` deliberadamente NÃO está aqui — ver spec, "Assumptions".
 */
export const EXPORT_SENSITIVE_CSV_COLUMNS = ["genero", "etnia"] as const;
export type ExportSensitiveCsvColumn = (typeof EXPORT_SENSITIVE_CSV_COLUMNS)[number];
