import type {
    NewMemberProfile,
    NewPasswordResetToken,
    NewSession,
    NewUser,
    PasswordResetTokenRow,
    SessionRow,
    UserRow,
} from "shared";

export interface UserWithRole extends UserRow {
    role: string;
}

/** Usuário + papel + snapshot da tec. É o que `GET /auth/me` devolve. */
export interface UserWithProfile extends UserWithRole {
    member_id: string;
    full_name: string;
    phone: string;
    course: string;
    semester: number;
    /** `INTEGER` 0/1 no D1 — convertido para boolean na borda do service. */
    manager: number;
    synced_at: string;
}

const USER_WITH_ROLE_COLUMNS = `u.id, u.role_id, u.email, u.name, u.password,
                                u.deactivated_at, u.created_at, u.updated_at,
                                r.value AS role`;

export class AuthRepository {
    constructor(private readonly db: D1Database) {}

    // ------------------------------------------------------------
    // Usuários
    // ------------------------------------------------------------

    async findUserByEmail(email: string): Promise<UserWithRole | null> {
        return this.db
            .prepare(
                `SELECT ${USER_WITH_ROLE_COLUMNS}
                   FROM users u
                   INNER JOIN roles r ON r.id = u.role_id
                  WHERE u.email = ?`,
            )
            .bind(email)
            .first<UserWithRole>();
    }

    async findUserById(id: string): Promise<UserWithRole | null> {
        return this.db
            .prepare(
                `SELECT ${USER_WITH_ROLE_COLUMNS}
                   FROM users u
                   INNER JOIN roles r ON r.id = u.role_id
                  WHERE u.id = ?`,
            )
            .bind(id)
            .first<UserWithRole>();
    }

    /** `INNER JOIN` em `member_profiles`: usuário sem perfil não é um estado que exista. */
    async findUserWithProfileById(id: string): Promise<UserWithProfile | null> {
        return this.db
            .prepare(
                `SELECT ${USER_WITH_ROLE_COLUMNS},
                        p.member_id, p.full_name, p.phone, p.course,
                        p.semester, p.manager, p.synced_at
                   FROM users u
                   INNER JOIN roles r ON r.id = u.role_id
                   INNER JOIN member_profiles p ON p.user_id = u.id
                  WHERE u.id = ?`,
            )
            .bind(id)
            .first<UserWithProfile>();
    }

    /** Identidade, snapshot e sessão num `db.batch` só — nenhum estado parcial é válido. */
    async createMemberAccount(
        user: NewUser,
        profile: Omit<NewMemberProfile, "user_id">,
        session: Omit<NewSession, "user_id">,
    ): Promise<void> {
        const insertUser = this.db
            .prepare(
                `INSERT INTO users (id, role_id, email, name, password)
                      VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(user.id, user.role_id, user.email, user.name, user.password);

        const insertProfile = this.db
            .prepare(
                `INSERT INTO member_profiles
                        (id, user_id, member_id, full_name, phone, birth_date,
                         course, semester, gender, ethnicity, status, manager, synced_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                profile.id,
                user.id,
                profile.member_id,
                profile.full_name,
                profile.phone,
                profile.birth_date,
                profile.course,
                profile.semester,
                profile.gender,
                profile.ethnicity,
                profile.status,
                profile.manager ? 1 : 0,
                profile.synced_at,
            );

        const insertSession = this.db
            .prepare(
                `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, expires_at, user_agent)
                      VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                session.id,
                user.id,
                session.refresh_token_hash,
                session.family_id,
                session.expires_at,
                session.user_agent,
            );

        await this.db.batch([insertUser, insertProfile, insertSession]);
    }

    async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
        await this.db
            .prepare("UPDATE users SET password = ?, updated_at = ? WHERE id = ?")
            .bind(passwordHash, new Date().toISOString(), userId)
            .run();
    }

    // ------------------------------------------------------------
    // Sessões
    // ------------------------------------------------------------

    async insertSession(session: NewSession): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, expires_at, user_agent)
                      VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                session.id,
                session.user_id,
                session.refresh_token_hash,
                session.family_id,
                session.expires_at,
                session.user_agent,
            )
            .run();
    }

    async findSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
        return this.db
            .prepare("SELECT * FROM sessions WHERE refresh_token_hash = ?")
            .bind(tokenHash)
            .first<SessionRow>();
    }

    /** Revoga a linha usada e cria a próxima na mesma `family_id`, atomicamente. */
    async rotateSession(currentSessionId: string, next: NewSession): Promise<void> {
        const revokeCurrent = this.db
            .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
            .bind(new Date().toISOString(), currentSessionId);

        const insertNext = this.db
            .prepare(
                `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, expires_at, user_agent)
                      VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                next.id,
                next.user_id,
                next.refresh_token_hash,
                next.family_id,
                next.expires_at,
                next.user_agent,
            );

        await this.db.batch([revokeCurrent, insertNext]);
    }

    /** Revoga toda a cadeia de rotações de um mesmo login. Usado no logout e na detecção de reuso. */
    async revokeSessionFamily(familyId: string): Promise<void> {
        await this.db
            .prepare("UPDATE sessions SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL")
            .bind(new Date().toISOString(), familyId)
            .run();
    }

    /** Expulsa o usuário de todo lugar. Usado na conta desativada (E12) e na redefinição de senha. */
    async revokeAllUserSessions(userId: string): Promise<void> {
        await this.db
            .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
            .bind(new Date().toISOString(), userId)
            .run();
    }

    // ------------------------------------------------------------
    // Recuperação de senha
    // ------------------------------------------------------------

    /** Invalida pedidos anteriores e grava o novo, no mesmo batch. */
    async replaceResetToken(token: NewPasswordResetToken): Promise<void> {
        const now = new Date().toISOString();

        const invalidatePrevious = this.db
            .prepare(
                "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
            )
            .bind(now, token.user_id);

        const insertNew = this.db
            .prepare(
                `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
                      VALUES (?, ?, ?, ?)`,
            )
            .bind(token.id, token.user_id, token.token_hash, token.expires_at);

        await this.db.batch([invalidatePrevious, insertNew]);
    }

    async findResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRow | null> {
        return this.db
            .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?")
            .bind(tokenHash)
            .first<PasswordResetTokenRow>();
    }

    /** Troca o hash, queima o token e derruba todas as sessões — num batch só (FEAT-0003, seção 4.7). */
    async completePasswordReset(params: {
        userId: string;
        tokenId: string;
        passwordHash: string;
    }): Promise<void> {
        const now = new Date().toISOString();

        const updatePassword = this.db
            .prepare("UPDATE users SET password = ?, updated_at = ? WHERE id = ?")
            .bind(params.passwordHash, now, params.userId);

        const consumeToken = this.db
            .prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?")
            .bind(now, params.tokenId);

        const revokeSessions = this.db
            .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
            .bind(now, params.userId);

        await this.db.batch([updatePassword, consumeToken, revokeSessions]);
    }

    // ------------------------------------------------------------
    // Manutenção (Cron Trigger)
    // ------------------------------------------------------------

    /** Sessões revogadas ficam 30 dias (evidência para investigar reuso) antes de sumir. */
    async pruneExpired(now: Date = new Date()): Promise<void> {
        const nowIso = now.toISOString();
        const revokedCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        await this.db.batch([
            this.db
                .prepare(
                    "DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)",
                )
                .bind(nowIso, revokedCutoff),
            this.db
                .prepare("DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL")
                .bind(nowIso),
        ]);
    }
}
