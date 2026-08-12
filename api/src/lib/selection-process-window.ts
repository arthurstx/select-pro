// Regra de calendário do processo seletivo (FEAT-0005, seção 4.1). Vive em
// código porque a criação da edição é sob demanda (seção 4.1.1) — não há
// mais tarefa nem CRUD que a materialize a partir de outro lugar.
//
// Janelas semestrais, sem sobreposição, cobrindo o ano inteiro: jan-jul
// (`AAAA.1`) e ago-dez (`AAAA.2`). Mudar esse calendário é mudar esta função
// e as linhas já semeadas pela migration — ver FEAT-0005, seção 13.

export interface SelectionProcessWindow {
    label: string;
    startsAt: string;
    endsAt: string;
}

/** Formata `YYYY-MM-DD` a partir de ano/mês/dia (mês 1-indexado), sem passar por `Date` (evita fuso). */
function isoDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Resolve a edição correspondente a uma data. `now` deve ser um instante em
 * UTC (mesmo fuso de `candidates.created_at`, que é `CURRENT_TIMESTAMP` do
 * SQLite) — ver seção 8.1.
 */
export function selectionProcessWindowFor(now: Date): SelectionProcessWindow {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1; // 1-12

    if (month <= 7) {
        return {
            label: `${year}.1`,
            startsAt: isoDate(year, 1, 1),
            endsAt: `${isoDate(year, 7, 31)} 23:59:59`,
        };
    }

    return {
        label: `${year}.2`,
        startsAt: isoDate(year, 8, 1),
        endsAt: `${isoDate(year, 12, 31)} 23:59:59`,
    };
}
