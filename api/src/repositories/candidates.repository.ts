import type { CandidateRow, NewCandidate } from "shared";

export class CandidateRepository {
    constructor(private readonly db: D1Database) {}

    async findByEmail(email: string): Promise<CandidateRow | null> {
        return this.db.prepare("SELECT * FROM candidates WHERE email = ?").bind(email).first<CandidateRow>();
    }

    async findByPhone(phone: string): Promise<CandidateRow | null> {
        return this.db.prepare("SELECT * FROM candidates WHERE phone = ?").bind(phone).first<CandidateRow>();
    }

    /**
     * Insere o candidato confirmado. Em caso de violação de UNIQUE (email/phone),
     * deixa o erro bruto do D1 subir — cabe ao service traduzi-lo via
     * `parseD1ConstraintError` (E10, FEAT-0001 seção 5).
     */
    async insert(candidate: NewCandidate): Promise<CandidateRow> {
        const row = await this.db
            .prepare(
                `INSERT INTO candidates (id, course, semester, gender, name, email, phone)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 RETURNING *`,
            )
            .bind(
                candidate.id,
                candidate.course,
                candidate.semester,
                candidate.gender,
                candidate.name,
                candidate.email,
                candidate.phone,
            )
            .first<CandidateRow>();

        if (!row) {
            throw new Error("Insert de candidato não retornou nenhuma linha");
        }

        return row;
    }
}
