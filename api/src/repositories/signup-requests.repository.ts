import type {
    NewSignupApprovalToken,
    NewSignupRequest,
    SignupRequestRow,
    SignupRequestStatus,
} from "shared";

/** Solicitação + validade do token que resolveu o hash (`GET .../by-token/:token`). */
export interface SignupRequestWithTokenExpiry extends SignupRequestRow {
    token_expires_at: string;
}

export class SignupRequestsRepository {
    constructor(private readonly db: D1Database) {}

    /** Solicitação + token de leitura num `db.batch` só — nenhum dos dois é válido sem o outro. */
    async create(request: NewSignupRequest, token: NewSignupApprovalToken): Promise<void> {
        const insertRequest = this.db
            .prepare(
                `INSERT INTO signup_requests
                        (id, email, password_hash, member_id, full_name, phone, birth_date,
                         course, semester, gender, ethnicity, member_status, manager)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                request.id,
                request.email,
                request.password_hash,
                request.member_id,
                request.full_name,
                request.phone,
                request.birth_date,
                request.course,
                request.semester,
                request.gender,
                request.ethnicity,
                request.member_status,
                request.manager ? 1 : 0,
            );

        const insertToken = this.db
            .prepare(
                `INSERT INTO signup_approval_tokens (id, signup_request_id, token_hash, expires_at)
                      VALUES (?, ?, ?, ?)`,
            )
            .bind(token.id, token.signup_request_id, token.token_hash, token.expires_at);

        await this.db.batch([insertRequest, insertToken]);
    }

    /** Rede de segurança para FR-016 — o service já checa antes de chamar `create`; o índice único parcial cobre a corrida. */
    async findPendingByEmail(email: string): Promise<SignupRequestRow | null> {
        return this.db
            .prepare("SELECT * FROM signup_requests WHERE email = ? AND status = 'pending'")
            .bind(email)
            .first<SignupRequestRow>();
    }

    async findById(id: string): Promise<SignupRequestRow | null> {
        return this.db
            .prepare("SELECT * FROM signup_requests WHERE id = ?")
            .bind(id)
            .first<SignupRequestRow>();
    }

    /** Resolve o token opaco (já hasheado pelo chamador) contra a solicitação associada. */
    async findByTokenHash(tokenHash: string): Promise<SignupRequestWithTokenExpiry | null> {
        return this.db
            .prepare(
                `SELECT r.*, t.expires_at AS token_expires_at
                   FROM signup_approval_tokens t
                   INNER JOIN signup_requests r ON r.id = t.signup_request_id
                  WHERE t.token_hash = ?`,
            )
            .bind(tokenHash)
            .first<SignupRequestWithTokenExpiry>();
    }

    async listByStatus(status: SignupRequestStatus): Promise<SignupRequestRow[]> {
        const { results } = await this.db
            .prepare(
                "SELECT * FROM signup_requests WHERE status = ? ORDER BY created_at ASC",
            )
            .bind(status)
            .all<SignupRequestRow>();

        return results ?? [];
    }

    /** FR-019 — quantas vezes esse email já foi recusado, para o admin decidir com contexto. */
    async countRejectedByEmail(email: string): Promise<number> {
        const row = await this.db
            .prepare(
                "SELECT COUNT(*) AS count FROM signup_requests WHERE email = ? AND status = 'rejected'",
            )
            .bind(email)
            .first<{ count: number }>();

        return row?.count ?? 0;
    }

    /**
     * Transição atômica `pending -> approved|rejected` (FR-010/SC-004): o
     * `WHERE status = 'pending'` no próprio UPDATE fecha a janela de corrida
     * entre checar e escrever — duas decisões simultâneas nunca gravam as
     * duas. `null` de volta significa que a linha já não estava `pending`
     * (decidida por outra requisição ou nunca existiu — o chamador distingue
     * checando `findById` antes, como `decide()` no service faz).
     */
    async decide(
        id: string,
        decidedBy: string,
        newStatus: Extract<SignupRequestStatus, "approved" | "rejected">,
    ): Promise<SignupRequestRow | null> {
        return this.db
            .prepare(
                `UPDATE signup_requests
                    SET status = ?, decided_by = ?, decided_at = ?
                  WHERE id = ? AND status = 'pending'
              RETURNING *`,
            )
            .bind(newStatus, decidedBy, new Date().toISOString(), id)
            .first<SignupRequestRow>();
    }
}
