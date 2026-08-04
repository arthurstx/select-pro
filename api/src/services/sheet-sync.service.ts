import { COURSE_LABELS, ETHNICITY_LABELS, GENDER_LABELS, REFERRAL_SOURCE_LABELS } from "shared";

import type { CellValue, SheetsClient } from "../lib/google-sheets";
import { logger } from "../lib/logger";
import type { CandidateWithApplicationRow, CandidateRepository } from "../repositories/candidates.repository";

const SHEET_TAB = "Inscricoes";

/** Só o cabeçalho, para validar que estamos na planilha certa antes de escrever (E4). */
const HEADER_RANGE = `${SHEET_TAB}!A1:O1`;
/** Coluna de ids a partir da linha 2 — a 1 é o cabeçalho e não é um id. */
const IDS_RANGE = `${SHEET_TAB}!A2:A`;
/** Intervalo do append; a API acrescenta depois da última linha preenchida. */
const APPEND_RANGE = `${SHEET_TAB}!A:O`;

/**
 * Cabeçalho esperado, na ordem exata da seção 8.2 da FEAT-0002.
 *
 * Colunas novas entram **no fim**: as linhas já escritas nunca são reescritas,
 * então inserir no meio desalinha todo o histórico.
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
] as const;

export interface SheetSyncConfig {
    /** Reflete a var `MAINTENANCE_MODE` do Worker. */
    maintenanceMode: boolean;
}

export type SheetSyncResult =
    | { status: "skipped"; reason: "maintenance" }
    | { status: "up-to-date" }
    | { status: "appended"; count: number };

const yesNo = (value: number): string => (value ? "Sim" : "Não");

/**
 * Converte uma inscrição na linha da planilha (FEAT-0002, seção 8.2).
 *
 * Os rótulos vêm de `shared`, os mesmos mapas que o wizard usa — a planilha
 * mostra "Engenharia de Computação", nunca `eng-computacao`. O fallback para o
 * próprio slug importa em `course`: é o único enum sem CHECK no banco (removido
 * na FEAT-0001 v3.1), então um valor fora do mapa é possível, e mostrá-lo cru é
 * melhor que escrever "undefined" na célula.
 */
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
    ];
}

/**
 * Espelha as inscrições do D1 numa planilha do Google (FEAT-0002).
 *
 * Não guarda estado: a cada execução descobre o que já foi enviado lendo a
 * coluna de ids da própria planilha. Isso torna o job idempotente (rodar duas
 * vezes não duplica), auto-recuperável (linha apagada volta) e dispensa
 * qualquer migration — reconstruir `candidates` no D1 é operação de risco
 * (ver migration 0004 e `CONTEXT.md`).
 */
export class SheetSyncService {
    constructor(
        private readonly candidates: CandidateRepository,
        private readonly sheets: SheetsClient,
        private readonly config: SheetSyncConfig,
    ) {}

    async run(): Promise<SheetSyncResult> {
        // O bloqueio de manutenção do fluxo de inscrição é um middleware em
        // `/candidate/*` e não alcança o handler agendado. Sem esta checagem, o
        // cron seria a única coisa lendo o banco no meio de uma migration que
        // reconstrói tabelas (FEAT-0002, E7).
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

    /**
     * Aborta se a aba ou o cabeçalho não forem os esperados.
     *
     * Escrever em posição errada numa planilha compartilhada é o único dano
     * irreversível que este job consegue causar — a API não tem desfazer. Diante
     * de qualquer sinal de que a planilha não é a certa, não escrever sai sempre
     * mais barato que escrever errado (FEAT-0002, E4).
     */
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

        // Linhas em branco no meio da coluna chegam como array vazio.
        return new Set(rows.map(([id]) => String(id ?? "")).filter((id) => id !== ""));
    }
}
