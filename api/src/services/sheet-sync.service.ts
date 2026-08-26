import { COURSE_LABELS, ETHNICITY_LABELS, GENDER_LABELS, REFERRAL_SOURCE_LABELS } from "shared";

import type { CellValue, SheetsClient } from "../lib/google-sheets";
import { logger } from "../lib/logger";
import type { CandidateWithApplicationRow, CandidateRepository } from "../repositories/candidates.repository";

const SHEET_TAB = "Inscricoes";

const HEADER_RANGE = `${SHEET_TAB}!A1:P1`;
const IDS_RANGE = `${SHEET_TAB}!A2:A`;
const APPEND_RANGE = `${SHEET_TAB}!A:P`;

/**
 * Colunas novas entram no fim — linhas já escritas nunca são reescritas.
 *
 * `special_needs_description` (FEAT-0014) foi adicionada ao final por essa
 * mesma regra. Decisão de escopo (sem como confirmar com o Arthur em tempo
 * real): a descrição segue para a planilha junto do boolean que já ia — é a
 * mesma sensibilidade (dado de saúde) e o mesmo público (a comissão, que já
 * recebe "Necessidades especiais: Sim/Não" aqui). Revisar se a planilha
 * algum dia tiver um público mais amplo do que a comissão organizadora.
 */
export const SHEET_HEADER = [
    "id",
    "Data de inscrição",
    "Nome",
    "Email",
    "Telefone",
    "Curso",
    "Semestre",
    "Gênero",
    "Cor/Etnia",
    "Como conheceu",
    "Como conheceu (descrição)",
    "Experiências e skills",
    "Motivação",
    "Restrição aos sábados",
    "Necessidades especiais",
    "Necessidades especiais (descrição)",
] as const;

export interface SheetSyncConfig {
    maintenanceMode: boolean;
}

export type SheetSyncResult =
    | { status: "skipped"; reason: "maintenance" }
    | { status: "up-to-date" }
    | { status: "appended"; count: number };

const yesNo = (value: number): string => (value ? "Sim" : "Não");

/** Rótulos vêm de `shared`, os mesmos mapas do wizard. Fallback ao slug cru se fora do mapa. */
function toSheetRow(row: CandidateWithApplicationRow): CellValue[] {
    return [
        row.id,
        row.created_at,
        row.name,
        row.email,
        row.phone,
        COURSE_LABELS[row.course] ?? row.course,
        row.semester,
        GENDER_LABELS[row.gender] ?? row.gender,
        ETHNICITY_LABELS[row.ethnicity] ?? row.ethnicity,
        REFERRAL_SOURCE_LABELS[row.referral_source] ?? row.referral_source,
        row.referral_source_other ?? "",
        row.experience,
        row.motivation,
        yesNo(row.saturday_restriction),
        yesNo(row.special_needs),
        row.special_needs_description ?? "",
    ];
}

/**
 * Espelha as inscrições do D1 numa planilha do Google (FEAT-0002). Sem
 * estado: descobre o que já foi enviado lendo a coluna de ids da própria
 * planilha (idempotente, auto-recuperável).
 */
export class SheetSyncService {
    constructor(
        private readonly candidates: CandidateRepository,
        private readonly sheets: SheetsClient,
        private readonly config: SheetSyncConfig,
    ) {}

    async run(): Promise<SheetSyncResult> {
        // O bloqueio de manutenção de `/candidate/*` não alcança o handler agendado.
        if (this.config.maintenanceMode) {
            logger.warn("sheet_sync.skipped_maintenance", {});
            return { status: "skipped", reason: "maintenance" };
        }

        await this.assertHeader();

        const alreadySynced = await this.readSyncedIds();
        const all = await this.candidates.listAllWithApplication();
        const missing = all.filter((row) => !alreadySynced.has(row.id));

        if (missing.length === 0) {
            logger.info("sheet_sync.up_to_date", { total: all.length });
            return { status: "up-to-date" };
        }

        await this.sheets.appendRows(APPEND_RANGE, missing.map(toSheetRow));
        logger.info("sheet_sync.appended", { count: missing.length, total: all.length });

        return { status: "appended", count: missing.length };
    }

    /** Aborta se a aba/cabeçalho não forem os esperados — escrever errado numa planilha compartilhada é irreversível. */
    private async assertHeader(): Promise<void> {
        const [header = []] = await this.sheets.readValues(HEADER_RANGE);

        const matches =
            header.length === SHEET_HEADER.length &&
            SHEET_HEADER.every((expected, index) => header[index] === expected);

        if (!matches) {
            logger.error("sheet_sync.header_mismatch", { found: header });
            throw new Error(
                `Cabeçalho da aba "${SHEET_TAB}" não confere com o esperado (FEAT-0002, seção 8.2) — nada foi escrito`,
            );
        }
    }

    private async readSyncedIds(): Promise<Set<string>> {
        const rows = await this.sheets.readValues(IDS_RANGE);

        return new Set(rows.map(([id]) => String(id ?? "")).filter((id) => id !== ""));
    }
}
