// Tipagens TypeScript geradas a partir do schema SQL (D1).
//
// Convenções: `XxxRow` = shape de uma linha vinda do banco; `NewXxx` =
// payload de INSERT (campos com default ficam opcionais); `XxxUpdate` =
// payload de UPDATE (tudo opcional, exceto o id). Datas trafegam como
// `string` (ISO-8601), como o D1 as devolve.

// ------------------------------------------------------------
// Enums (CHECK constraints do schema)
// ------------------------------------------------------------

export type EvaluationStatus = "RED" | "YELLOW" | "GREEN";

// Candidato — enums definidos em FEAT-0001 (seção 8.1)

/** `course` não tem CHECK no banco (FEAT-0001, seção 8.1) — este tipo e `CourseSchema` são a fonte de verdade. */
export type Course =
    | "eng-computacao"
    | "eng-civil"
    | "eng-mecanica"
    | "eng-quimica"
    | "eng-producao"
    | "eng-automacao"
    | "eng-eletrica"
    | "arquitetura";

export type Semester = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Gender = "mascu" | "fem" | "outro";

export type Ethnicity = "branca" | "preta" | "parda" | "amarela" | "indigena" | "nao-informado";

export type ReferralSource = "instagram" | "linkedin" | "campus" | "indicacao" | "outros";

// Membro da CIMATEC jr — FEAT-0003 (seção 8.1)

/** Status na tec. TEXT livre na origem, sem CHECK — `isEligibleMemberStatus` decide elegibilidade. */
export type MemberStatus = "active" | "inactive" | "alumni" | "on_leave";

// ------------------------------------------------------------
// Tabelas de referência
// ------------------------------------------------------------

export interface RoleRow {
    id: string;
    value: string;
}

export interface RoomRow {
    id: string;
    name: string;
    size: number;
}

export interface MetricRow {
    id: string;
    type: string | null;
    score: number | null;
}

// ------------------------------------------------------------
// Entidades principais
// ------------------------------------------------------------

export interface UserRow {
    id: string;
    role_id: string;
    email: string;
    name: string;
    /** `pbkdf2-sha256$<iterations>$<salt>$<hash>` (FEAT-0003, seção 9). */
    password: string | null;
    /** Desativação manual (FEAT-0003). `null` = ativo. */
    deactivated_at: string | null;
    created_at: string;
    updated_at: string | null;
}

/** Snapshot 1:1 do que a tec sabia sobre o membro no momento do cadastro. Não é ressincronizado. */
export interface MemberProfileRow {
    id: string;
    user_id: string;
    /** Id do membro na Supabase (uuid) — chave de correlação estável com a tec. */
    member_id: string;

    full_name: string;
    phone: string;
    birth_date: string | null;

    /** Valor cru da origem, sem CHECK/conversão para os enums da aplicação. */
    course: string;
    semester: number;
    gender: string;
    ethnicity: string;
    status: string;

    /** Cargo na empresa — não define papel na aplicação. */
    manager: boolean;

    synced_at: string;

    created_at: string;
    updated_at: string | null;
}

/** Uma linha por refresh token. Reuso de token revogado derruba a família inteira (FEAT-0003, seção 4.3). */
export interface SessionRow {
    id: string;
    user_id: string;
    /** SHA-256 (hex) — o token em claro nunca é gravado. */
    refresh_token_hash: string;
    family_id: string;
    expires_at: string;
    revoked_at: string | null;
    user_agent: string | null;
    created_at: string;
}

/** Uma linha por pedido de recuperação de senha. Uso único, validade de 30 min. */
export interface PasswordResetTokenRow {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    used_at: string | null;
    created_at: string;
}

export interface CandidateRow {
    id: string;

    course: Course;
    semester: Semester;
    gender: Gender;
    ethnicity: Ethnicity;

    name: string;
    email: string;
    phone: string;

    created_at: string;
    updated_at: string | null;
}

// Inscrição (questionário) — 1:1 com CandidateRow, isolada em tabela própria (FEAT-0001, seção 8.1)

export interface CandidateApplicationRow {
    id: string;
    candidate_id: string;

    referral_source: ReferralSource;
    referral_source_other: string | null;
    mej_acknowledged: boolean;
    experience: string;
    motivation: string;
    saturday_restriction: boolean;
    special_needs: boolean;

    created_at: string;
    updated_at: string | null;
}

export interface GroupRow {
    id: string;
    room_id: string;
    name: string;
    created_at: string;
    updated_at: string | null;
}

// ------------------------------------------------------------
// Tabelas de junção
// ------------------------------------------------------------

export interface GroupEvaluatorRow {
    group_id: string;
    user_id: string;
}

export interface GroupCandidateRow {
    group_id: string;
    candidate_id: string;
    order: number | null;
}

// ------------------------------------------------------------
// Avaliações
// ------------------------------------------------------------

export interface EvaluationRow {
    id: string;

    user_id: string;
    candidate_id: string;
    metrics_id: string;

    score: number | null;
    feedback: string | null;

    status: EvaluationStatus;

    created_at: string;
    updated_at: string | null;
}

// ------------------------------------------------------------
// Payloads de INSERT (`NewXxx`)
// ------------------------------------------------------------

export type NewRole = RoleRow;
export type NewRoom = RoomRow;
export type NewMetric = MetricRow;

export type NewUser = Omit<UserRow, "deactivated_at" | "created_at" | "updated_at"> & {
    deactivated_at?: string | null;
    created_at?: string;
    updated_at?: string | null;
};

export type NewMemberProfile = Omit<MemberProfileRow, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string | null;
};

export type NewSession = Omit<SessionRow, "revoked_at" | "created_at"> & {
    revoked_at?: string | null;
    created_at?: string;
};

export type NewPasswordResetToken = Omit<PasswordResetTokenRow, "used_at" | "created_at"> & {
    used_at?: string | null;
    created_at?: string;
};

export type NewCandidate = Omit<CandidateRow, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string | null;
};

export type NewCandidateApplication = Omit<CandidateApplicationRow, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string | null;
};

export type NewGroup = Omit<GroupRow, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string | null;
};

export type NewGroupEvaluator = GroupEvaluatorRow;
export type NewGroupCandidate = GroupCandidateRow;

export type NewEvaluation = Omit<
    EvaluationRow,
    "status" | "created_at" | "updated_at"
> & {
    status?: EvaluationStatus;
    created_at?: string;
    updated_at?: string | null;
};

// ------------------------------------------------------------
// Payloads de UPDATE (`XxxUpdate`)
// ------------------------------------------------------------

export type UserUpdate = Partial<Omit<UserRow, "id">> & { id: string };
export type MemberProfileUpdate = Partial<Omit<MemberProfileRow, "id">> & { id: string };
export type SessionUpdate = Partial<Omit<SessionRow, "id">> & { id: string };
export type CandidateUpdate = Partial<Omit<CandidateRow, "id">> & { id: string };
export type CandidateApplicationUpdate = Partial<Omit<CandidateApplicationRow, "id">> & { id: string };
export type GroupUpdate = Partial<Omit<GroupRow, "id">> & { id: string };
export type RoomUpdate = Partial<Omit<RoomRow, "id">> & { id: string };
export type MetricUpdate = Partial<Omit<MetricRow, "id">> & { id: string };
export type EvaluationUpdate = Partial<Omit<EvaluationRow, "id">> & {
    id: string;
};

// ------------------------------------------------------------
// Shapes com relacionamentos
// ------------------------------------------------------------

export interface UserWithRole extends UserRow {
    role: RoleRow;
}

export interface GroupWithRoom extends GroupRow {
    room: RoomRow;
}

export interface GroupWithMembers extends GroupRow {
    room: RoomRow;
    evaluators: UserRow[];
    candidates: (CandidateRow & { order: number | null })[];
}

export interface EvaluationWithRelations extends EvaluationRow {
    user: UserRow;
    candidate: CandidateRow;
    metric: MetricRow;
}

// ------------------------------------------------------------
// Mapa nome-da-tabela -> tipo da linha
// ------------------------------------------------------------

export interface DatabaseSchema {
    roles: RoleRow;
    rooms: RoomRow;
    metrics: MetricRow;
    users: UserRow;
    member_profiles: MemberProfileRow;
    sessions: SessionRow;
    password_reset_tokens: PasswordResetTokenRow;
    candidates: CandidateRow;
    candidate_applications: CandidateApplicationRow;
    groups: GroupRow;
    group_evaluators: GroupEvaluatorRow;
    group_candidates: GroupCandidateRow;
    evaluations: EvaluationRow;
}

export type TableName = keyof DatabaseSchema;

// export interface Env {
//   DB: D1Database;
// }
