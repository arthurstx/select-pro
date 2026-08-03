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

export type Course =
    | "eng-comp"
    | "eng-civil"
    | "eng-mecani"
    | "eng-quimica"
    | "eng-prod"
    | "eng-automação"
    | "eng-eletri"
    | "arqui";

export type Semester = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Gender = "mascu" | "fem" | "outro";

/** Padrão IBGE + opção de recusa (FEAT-0001 v2.0, seção 8.1). */
export type Ethnicity = "branca" | "preta" | "parda" | "amarela" | "indigena" | "nao-informado";

// ------------------------------------------------------------
// Inscrição (questionário) — enums definidos em FEAT-0001 v2.0 (seção 8.1)
// ------------------------------------------------------------

export type ReferralSource = "instagram" | "linkedin" | "campus" | "indicacao" | "outros";

// ------------------------------------------------------------
// Tabelas de referência
// ------------------------------------------------------------

export interface RoleRow {
    id: string;
    value: string;
}

export interface CourseRow {
    id: string;
    value: string;
}

export interface SemesterRow {
    id: string;
    value: string;
}

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

    email: string;
    name: string;
    password: string | null;

    created_at: string;
    updated_at: string | null;
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
export type NewCourse = CourseRow;
export type NewSemester = SemesterRow;
export type NewRoom = RoomRow;
export type NewMetric = MetricRow;

export type NewUser = Omit<UserRow, "created_at" | "updated_at"> & {
    created_at?: string;
    updated_at?: string | null;
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
    courses: CourseRow;
    semesters: SemesterRow;
    rooms: RoomRow;
    metrics: MetricRow;
    users: UserRow;
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