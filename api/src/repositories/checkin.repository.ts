import type {
  CandidateCheckinRow,
  CheckinStatusFilter,
  Course,
  NewCandidateCheckin,
  NewCheckinEvent,
} from "shared";

/** Linha da listagem paginada — join de `candidates` com `candidate_checkins` (FEAT-0005, seção 8.3). */
export interface CandidateWithCheckinRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: Course;
  semester: number;
  /** `null` = ausente. */
  checked_in_at: string | null;
  /** FEAT-0010, US3 (D7). `1`/`0` — SQLite não tem boolean nativo. */
  saturday_restriction: number;
}

export interface ListCandidatesParams {
  processId: string;
  startsAt: string;
  endsAt: string;
  search?: string;
  status: CheckinStatusFilter;
  /** FEAT-0015. `undefined` = todos os cursos. */
  course?: Course;
  page: number;
  perPage: number;
}

/** Escapa `%`/`_` do termo de busca antes de envolvê-lo em wildcards — sem isso, buscar por "50%" vira "tudo". */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class CheckinRepository {
  constructor(private readonly db: D1Database) {}

  // ------------------------------------------------------------
  // Listagem (FEAT-0005, seção 4.2 / 8.3)
  // ------------------------------------------------------------

  /**
   * Busca, filtro de status e paginação na mesma consulta — filtrar depois,
   * sobre uma página já recortada, faria `total` mentir (FEAT-0005, seção 4.2).
   */
  async listCandidates(
    params: ListCandidatesParams,
  ): Promise<{ items: CandidateWithCheckinRow[]; total: number; attendance: { online: number; presencial: number } }> {
    const conditions: string[] = ["c.created_at BETWEEN ? AND ?"];
    const bindings: unknown[] = [params.startsAt, params.endsAt];

    if (params.search) {
      conditions.push("LOWER(c.name) LIKE ? ESCAPE '\\'");
      bindings.push(`%${escapeLikeTerm(params.search.toLowerCase())}%`);
    }

    if (params.status === "presentes") {
      conditions.push("cc.checked_in_at IS NOT NULL");
    } else if (params.status === "ausentes") {
      conditions.push("cc.checked_in_at IS NULL");
    }

    if (params.course) {
      conditions.push("c.course = ?");
      bindings.push(params.course);
    }

    const whereClause = conditions.join(" AND ");
    // LEFT JOIN, não INNER: em produção toda inscrição nasce com questionário
    // no mesmo `db.batch` (FEAT-0001), mas usar INNER aqui excluiria
    // silenciosamente qualquer candidato sem `candidate_applications` —
    // `COALESCE(..., 0)` trata a ausência como "sem restrição" em vez de
    // sumir da lista.
    const joinClause = `FROM candidates c
                          LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                          LEFT JOIN candidate_checkins cc
                            ON cc.candidate_id = c.id AND cc.process_id = ?`;

    const listStatement = this.db
      .prepare(
        `SELECT c.id, c.name, c.email, c.phone, c.course, c.semester, cc.checked_in_at,
                COALESCE(a.saturday_restriction, 0) AS saturday_restriction
           ${joinClause}
          WHERE ${whereClause}
          ORDER BY c.created_at ASC, c.id ASC
          LIMIT ? OFFSET ?`,
      )
      .bind(params.processId, ...bindings, params.perPage, (params.page - 1) * params.perPage);

    const countStatement = this.db
      .prepare(`SELECT COUNT(*) AS total ${joinClause} WHERE ${whereClause}`)
      .bind(params.processId, ...bindings);

    // FEAT-0010, US3: soma sobre TODO o conjunto filtrado (mesmo WHERE do
    // count acima), não só a página — mesma semântica de `pagination.total`.
    const attendanceStatement = this.db
      .prepare(
        `SELECT
            COALESCE(SUM(CASE WHEN cc.checked_in_at IS NOT NULL AND COALESCE(a.saturday_restriction, 0) = 1 THEN 1 ELSE 0 END), 0) AS online,
            COALESCE(SUM(CASE WHEN cc.checked_in_at IS NOT NULL AND COALESCE(a.saturday_restriction, 0) = 0 THEN 1 ELSE 0 END), 0) AS presencial
           ${joinClause}
          WHERE ${whereClause}`,
      )
      .bind(params.processId, ...bindings);

    const [listResult, countResult, attendanceResult] = await this.db.batch<
      CandidateWithCheckinRow | { total: number } | { online: number; presencial: number }
    >([listStatement, countStatement, attendanceStatement]);

    const items = (listResult.results ?? []) as CandidateWithCheckinRow[];
    const total = ((countResult.results?.[0] as { total: number } | undefined)?.total) ?? 0;
    const attendanceRow = attendanceResult.results?.[0] as { online: number; presencial: number } | undefined;

    return {
      items,
      total,
      attendance: { online: attendanceRow?.online ?? 0, presencial: attendanceRow?.presencial ?? 0 },
    };
  }

  // ------------------------------------------------------------
  // Marcar / desmarcar (FEAT-0005, seção 4.3 / 4.4)
  //
  // Estado + evento são atômicos num único `db.batch`, sem SELECT prévio: o
  // segundo INSERT só grava quando `changes()` do primeiro indica uma
  // mudança real — E4/E5 (repetição idempotente) não geram evento. Padrão
  // verificado empiricamente contra D1 local antes de ser adotado aqui.
  // ------------------------------------------------------------

  async upsertCheckin(input: {
    candidateId: string;
    processId: string;
    checkedInBy: string;
  }): Promise<CandidateCheckinRow> {
    const checkin: NewCandidateCheckin = {
      id: crypto.randomUUID(),
      candidate_id: input.candidateId,
      process_id: input.processId,
      checked_in_by: input.checkedInBy,
    };
    const event: NewCheckinEvent = {
      id: crypto.randomUUID(),
      candidate_id: input.candidateId,
      process_id: input.processId,
      action: "marcou",
      actor_id: input.checkedInBy,
    };

    const insertCheckin = this.db
      .prepare(
        `INSERT INTO candidate_checkins (id, candidate_id, process_id, checked_in_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (candidate_id, process_id) DO NOTHING`,
      )
      .bind(checkin.id, checkin.candidate_id, checkin.process_id, checkin.checked_in_by);

    const insertEvent = this.db
      .prepare(
        `INSERT INTO checkin_events (id, candidate_id, process_id, action, actor_id)
         SELECT ?, ?, ?, 'marcou', ?
          WHERE changes() > 0`,
      )
      .bind(event.id, event.candidate_id, event.process_id, event.actor_id);

    await this.db.batch([insertCheckin, insertEvent]);

    const row = await this.findCheckin(input.candidateId, input.processId);
    if (!row) {
      throw new Error("upsertCheckin: linha ausente após o batch de marcação");
    }
    return row;
  }

  async removeCheckin(input: { candidateId: string; processId: string; actorId: string }): Promise<void> {
    const eventId = crypto.randomUUID();

    const deleteCheckin = this.db
      .prepare("DELETE FROM candidate_checkins WHERE candidate_id = ? AND process_id = ?")
      .bind(input.candidateId, input.processId);

    const insertEvent = this.db
      .prepare(
        `INSERT INTO checkin_events (id, candidate_id, process_id, action, actor_id)
         SELECT ?, ?, ?, 'desmarcou', ?
          WHERE changes() > 0`,
      )
      .bind(eventId, input.candidateId, input.processId, input.actorId);

    await this.db.batch([deleteCheckin, insertEvent]);
  }

  async findCheckin(candidateId: string, processId: string): Promise<CandidateCheckinRow | null> {
    return this.db
      .prepare("SELECT * FROM candidate_checkins WHERE candidate_id = ? AND process_id = ?")
      .bind(candidateId, processId)
      .first<CandidateCheckinRow>();
  }
}
