import type {
  CandidateRow,
  NewCandidate,
  NewCandidateApplication,
  ReferralSource,
} from "shared";

/**
 * Candidato + respostas do questionário, achatados numa linha só — o formato
 * que a sincronização com a planilha consome (FEAT-0002, seção 8.2).
 *
 * Interno da API de propósito: não é contrato entre front e back (o front não
 * sabe que a planilha existe), então não vai para `shared`.
 *
 * Os booleanos aparecem como `number` porque é o que o D1 devolve: `INTEGER`
 * 0/1, garantido pelos CHECK da tabela. `CandidateApplicationRow` os tipa como
 * `boolean`, que descreve o domínio mas não o retorno cru da query.
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

  /**
   * Todas as inscrições com o questionário, para a sincronização com a planilha
   * (FEAT-0002, seção 4.1).
   *
   * `INNER JOIN` e não `LEFT`: `insertWithApplication` grava as duas linhas no
   * mesmo batch, então candidato sem questionário não é um estado que exista.
   * As colunas de `candidate_applications` são listadas uma a uma porque um
   * `a.*` traria o `id` da inscrição e sobrescreveria o `id` do candidato — que
   * é justamente a chave usada para deduplicar na planilha.
   *
   * Ordenado por `created_at` para que a planilha cresça em ordem cronológica;
   * `id` desempata linhas gravadas no mesmo segundo (a precisão de
   * `CURRENT_TIMESTAMP` no SQLite), sem o que a ordem seria indefinida.
   */
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

  /**
   * Insere o candidato e sua inscrição (questionário) numa única transação
   * (`db.batch` — FEAT-0001 v3.0, seção 9): as duas linhas entram juntas ou
   * nenhuma delas entra. Em caso de violação de UNIQUE (email/phone), deixa
   * o erro bruto do D1 subir — cabe ao service traduzi-lo via
   * `parseD1ConstraintError` (E5, FEAT-0001 v3.0 seção 5).
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
