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

/** Estado de uma solicitação de cadastro pendente de aprovação (FEAT-0008). */
export type SignupRequestStatus = "pending" | "approved" | "rejected";

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

/** Palavras inteiras desde FEAT-0006 — `mascu`/`fem` eram truncamentos sem ganho, como os slugs de curso antes da FEAT-0001 v3.1. */
export type Gender = "masculino" | "feminino" | "outro";

export type Ethnicity = "branca" | "preta" | "parda" | "amarela" | "indigena" | "nao-informado";

export type ReferralSource = "instagram" | "linkedin" | "campus" | "indicacao" | "outros";

// Membro da CIMATEC jr — FEAT-0003 (seção 8.1)

/**
 * Status na tec. TEXT livre na origem, sem CHECK — `isRecognizedMemberStatus`
 * decide o que a aplicação reconhece.
 *
 * `"inactive"` significa **pós-júnior**, não "desligado" (FEAT-0008, decisão
 * D3) — nome herdado da origem, mantido para não introduzir tradução própria
 * do dado externo. `"alumni"` e `"on_leave"` saíram do domínio: nunca foram
 * elegíveis (`ELIGIBLE_MEMBER_STATUSES` só continha `"active"`), e um status
 * fora dos três reconhecidos cai no mesmo tratamento de sempre — recusado,
 * sem exceção lançada (`isRecognizedMemberStatus`).
 */
export type MemberStatus = "active" | "inactive" | "trainee";

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

/**
 * Pedido de acesso de pós-júnior/trainee (FEAT-0008). Guarda o snapshot da
 * tec e a senha (já hasheada) até a decisão — a conta em `users`/
 * `member_profiles` só existe depois de aprovada.
 */
export interface SignupRequestRow {
    id: string;

    email: string;
    password_hash: string;

    member_id: string;
    full_name: string;
    phone: string;
    birth_date: string | null;
    course: string;
    semester: number;
    gender: string;
    ethnicity: string;
    /** Cru, `"inactive"` ou `"trainee"` na prática — não é `MemberStatus` tipado, mesmo motivo de `MemberProfileRow.status`. */
    member_status: string;
    manager: boolean;

    status: SignupRequestStatus;
    decided_by: string | null;
    decided_at: string | null;

    created_at: string;
}

/** Uma linha por link de decisão emitido. Sem `used_at`: não é consumido por leitura (só expira). */
export interface SignupApprovalTokenRow {
    id: string;
    signup_request_id: string;
    token_hash: string;
    expires_at: string;
    created_at: string;
}

export interface CandidateRow {
    id: string;

    /**
     * Edição em que esta inscrição aconteceu (FEAT-0006). É o que torna a
     * unicidade escopada possível — `UNIQUE (process_id, email)` e
     * `UNIQUE (process_id, phone)`, no lugar dos UNIQUE globais que
     * impediam a recandidatura.
     *
     * Substitui a inferência por janela de data que a FEAT-0005 usava como
     * dívida assumida: o vínculo passa a ser afirmado na inscrição, então
     * corrigir as datas de um processo não remaneja mais quem pertence a ele.
     */
    process_id: string;

    course: Course;
    semester: Semester;
    gender: Gender;
    ethnicity: Ethnicity;

    name: string;
    email: string;
    /** Sempre E.164 (`+55` + DDD + número) — ver `phone.schema.ts`. */
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

// Check-in de candidatos — FEAT-0005 (seção 8.1)

/**
 * Uma edição do processo seletivo. A CIMATEC jr roda um por semestre, e a
 * presença precisa ser escopada a um deles — sem isso, a lista do semestre
 * novo mostraria os candidatos de todos os anteriores.
 *
 * As janelas são jan–jul e ago–dez, não dois semestres iguais: é o calendário
 * real da tec. Elas não se sobrepõem e cobrem o ano inteiro, o que é o que
 * permite resolver o processo corrente por uma comparação de data simples.
 *
 * Não há coluna `is_active`: o processo corrente é o que contém a data de
 * hoje. Uma flag booleana depende de alguém lembrar de desligá-la, e o
 * esquecimento seria silencioso. A linha é criada sob demanda quando falta
 * (FEAT-0005, seção 4.1.1) — não por CRUD nem por cron.
 */
export interface SelectionProcessRow {
    id: string;
    /** "2026.2" — identificador humano, unique. */
    label: string;
    /** Início da janela (inclusive). */
    starts_at: string;
    /** Fim da janela (inclusive). */
    ends_at: string;

    created_at: string;
}

/**
 * Presença confirmada — ESTADO ATUAL, não histórico. A existência da linha É
 * a presença: não há coluna de estado, e desmarcar apaga a linha. O
 * histórico mora em `CheckinEventRow`.
 *
 * `process_id` é redundante com a janela de datas de `CandidateRow.created_at`
 * enquanto `candidates` não tiver a própria coluna — mas é ele que mantém
 * esta tabela correta por conta própria.
 */
export interface CandidateCheckinRow {
    id: string;
    candidate_id: string;
    process_id: string;

    /**
     * Quem confirmou. Redundante com o último evento `"marcou"` de
     * `checkin_events`, e mantido assim de propósito: a listagem lê esta
     * tabela a cada página, e derivar o autor do log exigiria uma subquery
     * por linha.
     */
    checked_in_by: string;

    checked_in_at: string;
}

/**
 * Histórico append-only. Uma linha por mudança REAL de estado (marcar/
 * desmarcar) — repetições idempotentes não geram evento.
 *
 * Nada nas rotas de FEAT-0005 lê esta tabela; é escrita pura, para a futura
 * tela de logs do admin encontrar história em vez de começar do zero.
 */
export type CheckinAction = "marcou" | "desmarcou";

export interface CheckinEventRow {
    id: string;
    candidate_id: string;
    process_id: string;

    action: CheckinAction;
    /** Membro que executou a ação. */
    actor_id: string;

    created_at: string;
}

// Exportação de candidatos — FEAT-0016 (migration 0012)

/**
 * Registro append-only de uma exportação de candidatos em CSV. Trilha de
 * compliance, não log de operação: `actor_id`/`process_id` usam `ON DELETE
 * RESTRICT` (mesma postura de `CandidateCheckinRow.checked_in_by`, não de
 * `CheckinEventRow`) — apagar um usuário ou uma edição não pode apagar em
 * silêncio o registro de que um dado sensível saiu do sistema.
 *
 * Nada nesta feature lê esta tabela de volta — é escrita pura, para uma
 * futura tela de auditoria encontrar histórico (mesmo padrão de
 * `checkin_events`, órfã até hoje).
 */
export interface CandidateExportEventRow {
    id: string;
    /** Quem pediu a exportação. */
    actor_id: string;
    /** `null` = recorte "todas as edições". */
    process_id: string | null;
    /** Snapshot do rótulo no momento da exportação — legível mesmo se a edição mudar depois. */
    process_label: string;
    /** O D1 devolve booleano como 0/1. */
    included_sensitive_fields: number;
    /** Quantas linhas de candidato o arquivo continha. */
    row_count: number;

    created_at: string;
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

export type NewSignupRequest = Omit<
    SignupRequestRow,
    "status" | "decided_by" | "decided_at" | "created_at"
> & {
    status?: SignupRequestStatus;
    decided_by?: string | null;
    decided_at?: string | null;
    created_at?: string;
};

export type NewSignupApprovalToken = Omit<SignupApprovalTokenRow, "created_at"> & {
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

export type NewSelectionProcess = Omit<SelectionProcessRow, "created_at"> & {
    created_at?: string;
};

export type NewCandidateCheckin = Omit<CandidateCheckinRow, "checked_in_at"> & {
    checked_in_at?: string;
};

export type NewCheckinEvent = Omit<CheckinEventRow, "created_at"> & {
    created_at?: string;
};

export type NewCandidateExportEvent = Omit<CandidateExportEventRow, "created_at"> & {
    created_at?: string;
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
    signup_requests: SignupRequestRow;
    signup_approval_tokens: SignupApprovalTokenRow;
    candidates: CandidateRow;
    candidate_applications: CandidateApplicationRow;
    groups: GroupRow;
    group_evaluators: GroupEvaluatorRow;
    group_candidates: GroupCandidateRow;
    evaluations: EvaluationRow;
    selection_processes: SelectionProcessRow;
    candidate_checkins: CandidateCheckinRow;
    checkin_events: CheckinEventRow;
    candidate_export_events: CandidateExportEventRow;
}

export type TableName = keyof DatabaseSchema;

// export interface Env {
//   DB: D1Database;
// }
