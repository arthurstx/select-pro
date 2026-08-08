// ============================================================
// Tipagens TypeScript geradas a partir do schema SQL (D1)
//
// Convenções:
// - Tipos `XxxRow` = shape exato de uma linha vinda do banco
//   (ex.: retorno de `db.prepare(...).all<UserRow>()`).
// - Tipos `NewXxx` = payload para INSERT (campos com valor
//   default no banco ficam opcionais).
// - Tipos `XxxUpdate` = payload para UPDATE (tudo opcional,
//   exceto o id).
// - Datas trafegam como `string` (ISO-8601), pois é assim que
//   o SQLite/D1 as devolve.
// ============================================================

// ------------------------------------------------------------
// Enums (CHECK constraints do schema)
// ------------------------------------------------------------

export type EvaluationStatus = "RED" | "YELLOW" | "GREEN";

// ------------------------------------------------------------
// Candidato — enums definidos em FEAT-0001 (seção 8.1)
// ------------------------------------------------------------

/**
 * Slugs normalizados na v3.1 (FEAT-0001, seção 8.1): palavra inteira e somente
 * ASCII. Diferente dos demais enums, `course` **não** tem CHECK no banco — é o
 * único conjunto que se espera crescer, e alterar um CHECK no SQLite exige
 * recriar `candidates` inteira (que tem três filhos, dois em CASCADE). Este
 * tipo e `CourseSchema` são, juntos, a única fonte de verdade.
 */
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

/** Padrão IBGE + opção de recusa (FEAT-0001 v2.0, seção 8.1). */
export type Ethnicity = "branca" | "preta" | "parda" | "amarela" | "indigena" | "nao-informado";

// ------------------------------------------------------------
// Inscrição (questionário) — enums definidos em FEAT-0001 v2.0 (seção 8.1)
// ------------------------------------------------------------

export type ReferralSource = "instagram" | "linkedin" | "campus" | "indicacao" | "outros";

// ------------------------------------------------------------
// Membro da CIMATEC jr — FEAT-0003 (seção 8.1)
// ------------------------------------------------------------

/**
 * Status do membro no banco da tec (Supabase). Diferente dos demais enums
 * deste arquivo, **não** é espelhado por CHECK em lugar nenhum: a coluna é
 * TEXT livre na origem e `member_profiles.status` guarda o valor como veio.
 * Documenta o conjunto esperado; quem decide elegibilidade é
 * `isEligibleMemberStatus` (`member.schema.ts`).
 */
export type MemberStatus = "active" | "inactive" | "alumni" | "on_leave";

// ------------------------------------------------------------
// Tabelas de referência
// ------------------------------------------------------------

export interface RoleRow {
    id: string;
    value: string;
}

// `CourseRow`/`SemesterRow` foram removidos na v3.1 junto com as tabelas
// `courses` e `semesters` (migration 0004): nasceram como lookup na 0001, mas
// ficaram vazias e sem nenhuma FK apontando para elas. Curso e semestre são
// literais validados por `CourseSchema`/`SemesterSchema`, não referências.

export interface RoomRow {
    id: string;
    name: string;
    /** Deve ser > 0 (garantido por CHECK no banco). */
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

    /** Sempre normalizado (trim + lowercase) antes de persistir — ver `EmailSchema`. */
    email: string;
    name: string;
    /** Hash PBKDF2 no formato `pbkdf2-sha256$<iterations>$<salt>$<hash>` (FEAT-0003, seção 9). */
    password: string | null;

    /**
     * Novo em FEAT-0003 — desativação manual. `null` = ativo.
     *
     * Existe porque a validação contra o banco da tec acontece só no cadastro:
     * quem sai da empresa continua com conta funcionando até alguém preencher
     * esta coluna. É o passo operacional que paga por manter a Supabase fora
     * do caminho crítico do login.
     */
    deactivated_at: string | null;

    created_at: string;
    updated_at: string | null;
}

/**
 * Snapshot 1:1 do que a tec sabia sobre o membro **no momento do cadastro**.
 *
 * Mesmo padrão de `candidates` + `candidate_applications`: `users` fica com
 * identidade e credencial, o resto sai de lá. Não é ressincronizado — daí o
 * `synced_at`, que deixa explícito o quão velho o dado é.
 */
export interface MemberProfileRow {
    id: string;
    /** FK unique -> users.id (garante o 1:1). */
    user_id: string;
    /**
     * Id do membro na Supabase (uuid) — a única chave de correlação estável
     * com a tec. O email pode mudar; este não.
     */
    member_id: string;

    full_name: string;
    phone: string;
    birth_date: string | null;

    /**
     * `course`, `gender`, `ethnicity` e `status` guardam o valor **cru** da
     * origem, sem CHECK e sem conversão para os enums da aplicação. São dados
     * de um sistema que não controlamos: aplicar nossas constraints faria o
     * cadastro falhar por um valor que o membro não pode corrigir.
     */
    course: string;
    semester: number;
    gender: string;
    ethnicity: string;
    status: string;

    /** Cargo na empresa. Gravado por completude — **não** define papel na aplicação. */
    manager: boolean;

    synced_at: string;

    created_at: string;
    updated_at: string | null;
}

/**
 * Uma linha por refresh token emitido. Rotação cria uma linha nova e revoga a
 * anterior; reapresentar um token já revogado é reuso e derruba a família
 * inteira (FEAT-0003, seção 4.3).
 */
export interface SessionRow {
    /** UUID v4 — vai no claim `sid` do access token. */
    id: string;
    user_id: string;

    /** SHA-256 (hex) do token opaco. O token em claro nunca é gravado. */
    refresh_token_hash: string;
    /** Agrupa a cadeia de rotações originada de um mesmo login. */
    family_id: string;

    expires_at: string;
    /** Preenchido na rotação, no logout ou na detecção de reuso. */
    revoked_at: string | null;

    user_agent: string | null;

    created_at: string;
}

/** Uma linha por pedido de recuperação de senha. Uso único, validade de 30 min. */
export interface PasswordResetTokenRow {
    id: string;
    user_id: string;

    /** SHA-256 (hex) do token enviado no link. */
    token_hash: string;

    expires_at: string;
    /** Preenchido no uso e na invalidação por um pedido mais novo. */
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

// ------------------------------------------------------------
// Inscrição (questionário) — 1:1 com CandidateRow (FEAT-0001, seção 8.1).
// Isolada em tabela própria para manter `candidates` como identidade +
// demografia enxuta, permitindo um segundo processo seletivo no futuro
// sem alterar essa tabela.
// ------------------------------------------------------------

export interface CandidateApplicationRow {
    id: string;
    candidate_id: string;

    referral_source: ReferralSource;
    /**
     * Texto livre de "de onde conheceu" (FEAT-0001 v3.0, seção 8.1) — obrigatório
     * quando `referral_source === "outros"` e `null` em todas as outras opções.
     */
    referral_source_other: string | null;
    /** Checkbox "li e entendi sobre o MEJ" — sempre `true` para chegar até aqui. */
    mej_acknowledged: boolean;
    /** "Experiências e Skills" (etapa 4 do wizard) — limite de 1000 caracteres. */
    experience: string;
    /** "Motivação" (etapa 4 do wizard) — limite de 500 caracteres. */
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

// ============================================================
// Payloads de INSERT (`NewXxx`)
// Campos com DEFAULT no banco (created_at, status) ficam opcionais.
// ============================================================

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

// ============================================================
// Payloads de UPDATE (`XxxUpdate`)
// Tudo opcional, exceto o identificador.
// ============================================================

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

// ============================================================
// Shapes com relacionamentos (úteis para respostas de API/joins)
// ============================================================

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

// ============================================================
// Mapa nome-da-tabela -> tipo da linha
// Útil para helpers genéricos de repositório/query builder.
// ============================================================

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

// ============================================================
// Binding do D1 (opcional)
// Requer `@cloudflare/workers-types` instalado no projeto.
// ============================================================

// export interface Env {
//   DB: D1Database;
// }