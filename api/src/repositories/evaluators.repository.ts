import type { EvaluatorRole } from "shared";

export type EvaluatorRow = {
    user_id: string;
    name: string;
    email: string;
    memberStatus: string;
    role: EvaluatorRole;
};

/**
 * `avaliador` = `INNER JOIN member_profiles`: todo usuário com `role_id =
 * 'avaliador'` nasce com perfil no mesmo `db.batch` (FEAT-0003/FEAT-0008) —
 * não existe avaliador sem perfil. Cargo anotado via `LEFT JOIN
 * edition_hosts`: host se existir linha na edição pedida, avaliador se não.
 */
export class EvaluatorsRepository {
    constructor(private readonly db: D1Database) {}

    async listWithRole(processId: string): Promise<EvaluatorRow[]> {
        const { results } = await this.db
            .prepare(
                `SELECT u.id AS user_id, u.name, u.email, p.status AS memberStatus,
                        CASE WHEN eh.user_id IS NOT NULL THEN 'host' ELSE 'avaliador' END AS role
                   FROM users u
                   INNER JOIN member_profiles p ON p.user_id = u.id
                   LEFT JOIN edition_hosts eh ON eh.user_id = u.id AND eh.process_id = ?
                  WHERE u.role_id = 'avaliador' AND u.deactivated_at IS NULL
                  ORDER BY u.name ASC`,
            )
            .bind(processId)
            .all<EvaluatorRow>();

        return results ?? [];
    }

    /** Usado depois de `markHost`/`unmarkHost` para devolver o `EvaluatorSummary` atualizado de uma pessoa. */
    async findByUserId(processId: string, userId: string): Promise<EvaluatorRow | null> {
        return this.db
            .prepare(
                `SELECT u.id AS user_id, u.name, u.email, p.status AS memberStatus,
                        CASE WHEN eh.user_id IS NOT NULL THEN 'host' ELSE 'avaliador' END AS role
                   FROM users u
                   INNER JOIN member_profiles p ON p.user_id = u.id
                   LEFT JOIN edition_hosts eh ON eh.user_id = u.id AND eh.process_id = ?
                  WHERE u.id = ? AND u.role_id = 'avaliador' AND u.deactivated_at IS NULL`,
            )
            .bind(processId, userId)
            .first<EvaluatorRow>();
    }

    async markHost(processId: string, userId: string): Promise<void> {
        await this.db
            .prepare(
                `INSERT OR IGNORE INTO edition_hosts (id, process_id, user_id)
                      VALUES (?, ?, ?)`,
            )
            .bind(crypto.randomUUID(), processId, userId)
            .run();
    }

    async unmarkHost(processId: string, userId: string): Promise<void> {
        await this.db
            .prepare("DELETE FROM edition_hosts WHERE process_id = ? AND user_id = ?")
            .bind(processId, userId)
            .run();
    }
}
