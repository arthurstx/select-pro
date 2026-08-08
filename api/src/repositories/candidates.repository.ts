import type {
  CandidateRow,
  NewCandidate,
  NewCandidateApplication,
  ReferralSource,
} from "shared";

/**
 * Candidato + questionário achatados numa linha só, para a sincronização com
 * a planilha (FEAT-0002, seção 8.2). Interno da API — não vai para `shared`.
 * Booleanos como `number`: é o que o D1 devolve.
 */
export interface CandidateWithApplicationRow extends CandidateRow {
  referral_source: ReferralSource;
  referral_source_other: string | null;
  experience: string;
  motivation: string;
  saturday_restriction: number;
  special_needs: number;
}

export class CandidateRepository {
  constructor(private readonly db: D1Database) {}

  async findByEmail(email: string): Promise<CandidateRow | null> {
    return this.db
      .prepare("SELECT * FROM candidates WHERE email = ?")
      .bind(email)
      .first<CandidateRow>();
  }

  async findByPhone(phone: string): Promise<CandidateRow | null> {
    return this.db
      .prepare("SELECT * FROM candidates WHERE phone = ?")
      .bind(phone)
      .first<CandidateRow>();
  }

  /** Todas as inscrições com questionário, para a sincronização com a planilha (FEAT-0002, seção 4.1). */
  async listAllWithApplication(): Promise<CandidateWithApplicationRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT c.*,
                a.referral_source,
                a.referral_source_other,
                a.experience,
                a.motivation,
                a.saturday_restriction,
                a.special_needs
           FROM candidates c
           INNER JOIN candidate_applications a ON a.candidate_id = c.id
          ORDER BY c.created_at ASC, c.id ASC`,
      )
      .all<CandidateWithApplicationRow>();

    return results ?? [];
  }

  /** Candidato + inscrição num `db.batch` só. Violação de UNIQUE sobe crua para o service traduzir. */
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
                    (id, candidate_id, referral_source, referral_source_other, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        application.id,
        candidate.id,
        application.referral_source,
        application.referral_source_other,
        application.mej_acknowledged ? 1 : 0,
        application.experience,
        application.motivation,
        application.saturday_restriction ? 1 : 0,
        application.special_needs ? 1 : 0,
      );

    const [candidateResult] = await this.db.batch<CandidateRow>([
      insertCandidate,
      insertApplication,
    ]);
    const row = candidateResult.results?.[0];

    if (!row) {
      throw new Error("Insert de candidato não retornou nenhuma linha");
    }

    return row;
  }
}
