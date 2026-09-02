import type { EvaluatorRole } from "shared";

/** Linha da listagem — avaliador/host (mesmo `JOIN` de `EvaluatorsRepository.listWithRole`) com estado de presença. */
export interface MemberWithCheckinRow {
    user_id: string;
    name: string;
    email: string;
    role: EvaluatorRole;
    /** `null` = ausente. */
    checked_in_at: string | null;
}

export interface MemberCheckinRow {
    id: string;
    user_id: string;
    process_id: string;
    checked_in_by: string;
    checked_in_at: string;
}

/**
 * Espelha `CheckinRepository` (candidatos, FEAT-0005), mas para
 * avaliador/host: mesma técnica de `db.batch` + `WHERE changes() > 0` para
 * garantir que marcação/desmarcação idempotente não duplique evento.
 *
 * `listWithCheckin` reaproveita a mesma definição de "quem está atribuído à
 * edição corrente" que `EvaluatorsRepository.listWithRole` já usa
 * (research.md D2, FEAT-0010) — `LEFT JOIN member_checkins` no lugar de
 * `edition_hosts` some com o estado de presença.
 */
export class MemberCheckinRepository {
    constructor(private readonly db: D1Database) {}

    async listWithCheckin(processId: string): Promise<MemberWithCheckinRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT u.id AS user_id, u.name, u.email,
                        CASE WHEN eh.user_id IS NOT NULL THEN 'host' ELSE 'avaliador' END AS role,
                        mc.checked_in_at
                   FROM users u
                   INNER JOIN member_profiles p ON p.user_id = u.id
                   LEFT JOIN edition_hosts eh ON eh.user_id = u.id AND eh.process_id = ?
                   LEFT JOIN member_checkins mc ON mc.user_id = u.id AND mc.process_id = ?
                  WHERE u.role_id = 'avaliador' AND u.deactivated_at IS NULL
                  ORDER BY u.name ASC`,
            )
            .bind(processId, processId)
            .all<MemberWithCheckinRow>();

        return results ?? [];
    }

    /** Usado para validar `userId` antes de marcar/desmarcar (mesmo motivo do FK-check de `EvaluatorsRepository.findByUserId`). */
    async isEligible(processId: string, userId: string): Promise<boolean> {
        const row = await this.db
            .prepare(
                `SELECT 1
                   FROM users u
                   INNER JOIN member_profiles p ON p.user_id = u.id
                  WHERE u.id = ? AND u.role_id = 'avaliador' AND u.deactivated_at IS NULL`,
            )
            .bind(userId)
            .first();

        return row !== null;
    }

    async upsertCheckin(input: { userId: string; processId: string; checkedInBy: string }): Promise<MemberCheckinRow> {
        const id = crypto.randomUUID();
        const eventId = crypto.randomUUID();

        const insertCheckin = this.db
            .prepare(
                `INSERT INTO member_checkins (id, user_id, process_id, checked_in_by)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT (user_id, process_id) DO NOTHING`,
            )
            .bind(id, input.userId, input.processId, input.checkedInBy);

        const insertEvent = this.db
            .prepare(
                `INSERT INTO member_checkin_events (id, user_id, process_id, action, actor_id)
                 SELECT ?, ?, ?, 'marcou', ?
                  WHERE changes() > 0`,
            )
            .bind(eventId, input.userId, input.processId, input.checkedInBy);

        await this.db.batch([insertCheckin, insertEvent]);

        const row = await this.findCheckin(input.userId, input.processId);
        if (!row) {
            throw new Error("upsertCheckin: linha ausente após o batch de marcação");
        }
        return row;
    }

    async removeCheckin(input: { userId: string; processId: string; actorId: string }): Promise<void> {
        const eventId = crypto.randomUUID();

        const deleteCheckin = this.db
            .prepare("DELETE FROM member_checkins WHERE user_id = ? AND process_id = ?")
            .bind(input.userId, input.processId);

        const insertEvent = this.db
            .prepare(
                `INSERT INTO member_checkin_events (id, user_id, process_id, action, actor_id)
                 SELECT ?, ?, ?, 'desmarcou', ?
                  WHERE changes() > 0`,
            )
            .bind(eventId, input.userId, input.processId, input.actorId);

        await this.db.batch([deleteCheckin, insertEvent]);
    }

    async findCheckin(userId: string, processId: string): Promise<MemberCheckinRow | null> {
        return this.db
            .prepare("SELECT * FROM member_checkins WHERE user_id = ? AND process_id = ?")
            .bind(userId, processId)
            .first<MemberCheckinRow>();
    }
}
