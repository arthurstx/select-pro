import type { CandidateRow, NewCandidate, NewCandidateApplication } from "shared";

export class CandidateRepository {
    constructor(private readonly db: D1Database) {}

    async findByEmail(email: string): Promise<CandidateRow | null> {
        return this.db.prepare("SELECT * FROM candidates WHERE email = ?").bind(email).first<CandidateRow>();
    }

    async findByPhone(phone: string): Promise<CandidateRow | null> {
        return this.db.prepare("SELECT * FROM candidates WHERE phone = ?").bind(phone).first<CandidateRow>();
    }

    /**
     * Insere o candidato e sua inscrição (questionário) numa única transação
     * (`db.batch` — FEAT-0001 v2.0, seção 9): as duas linhas entram juntas ou
     * nenhuma delas entra. Em caso de violação de UNIQUE (email/phone), deixa
     * o erro bruto do D1 subir — cabe ao service traduzi-lo via
     * `parseD1ConstraintError` (E10, FEAT-0001 seção 5).
     */
    async insertWithApplication(
        candidate: NewCandidate,
        application: Omit<NewCandidateApplication, "candidate_id">,
    ): Promise<CandidateRow> {
        const insertCandidate = this.db
            .prepare(
                `INSERT INTO candidates (id, course, semester, gender, ethnicity, name, email, phone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING *`,
            )
            .bind(
                candidate.id,
                candidate.course,
                candidate.semester,
                candidate.gender,
                candidate.ethnicity,
                candidate.name,
                candidate.email,
                candidate.phone,
            );

        const insertApplication = this.db
            .prepare(
                `INSERT INTO candidate_applications
                    (id, candidate_id, referral_source, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                application.id,
                candidate.id,
                application.referral_source,
                application.mej_acknowledged ? 1 : 0,
                application.experience,
                application.motivation,
                application.saturday_restriction ? 1 : 0,
                application.special_needs ? 1 : 0,
            );

        const [candidateResult] = await this.db.batch<CandidateRow>([insertCandidate, insertApplication]);
        const row = candidateResult.results?.[0];

        if (!row) {
            throw new Error("Insert de candidato não retornou nenhuma linha");
        }

        return row;
    }
}
