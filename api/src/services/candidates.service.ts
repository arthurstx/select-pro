import type { CandidateRow, NewCandidate, NewCandidateApplication, RegisterRequest } from "shared";

import { type Either, left, right } from "../core/either";
import { EmailAlreadyRegisteredError, PhoneAlreadyRegisteredError } from "../core/errors/candidate-errors";
import { parseD1ConstraintError } from "../lib/d1-errors";
import { logger } from "../lib/logger";
import type { CandidateRepository } from "../repositories/candidates.repository";

type RegisterError = EmailAlreadyRegisteredError | PhoneAlreadyRegisteredError;
type RegisterResult = { id: string; status: "registered"; name: string; email: string; createdAt: string };

export class CandidateService {
    constructor(private readonly candidates: CandidateRepository) {}

    /**
     * Inscrição em passo único (FEAT-0001 v3.0, seção 4.1): valida, grava
     * candidato + questionário no mesmo batch e acabou. Não existe estado
     * intermediário — ou a inscrição está no banco, ou a requisição falhou.
     */
    async register(input: RegisterRequest): Promise<Either<RegisterError, RegisterResult>> {
        const existingByEmail = await this.candidates.findByEmail(input.email);
        if (existingByEmail) {
            logger.warn("candidate.register.email_conflict", { email: input.email });
            return left(new EmailAlreadyRegisteredError());
        }

        const existingByPhone = await this.candidates.findByPhone(input.phone);
        if (existingByPhone) {
            logger.warn("candidate.register.phone_conflict", { phone: input.phone });
            return left(new PhoneAlreadyRegisteredError());
        }

        const newCandidate: NewCandidate = {
            id: crypto.randomUUID(),
            name: input.name,
            email: input.email,
            phone: input.phone,
            course: input.course,
            semester: input.semester,
            gender: input.gender,
            ethnicity: input.ethnicity,
        };

        const newApplication: Omit<NewCandidateApplication, "candidate_id"> = {
            id: crypto.randomUUID(),
            referral_source: input.referralSource,
            // Só faz sentido guardar a descrição livre na origem "outros" — nas
            // demais o campo é descartado mesmo que o cliente o envie
            // (FEAT-0001 v3.0, seção 8.2).
            referral_source_other: input.referralSource === "outros" ? (input.referralSourceOther ?? null) : null,
            mej_acknowledged: input.mejAcknowledged,
            experience: input.experience,
            motivation: input.motivation,
            saturday_restriction: input.saturdayRestriction,
            special_needs: input.specialNeeds,
        };

        let row: CandidateRow;
        try {
            row = await this.candidates.insertWithApplication(newCandidate, newApplication);
        } catch (err) {
            // E5: a checagem prévia acima passou, mas outra inscrição concorrente
            // gravou o mesmo email/telefone antes desta — a constraint é a
            // barreira real (FEAT-0001 v3.0, seção 9).
            const field = parseD1ConstraintError(err);
            if (field) {
                // Mesma chave (`email`/`phone`) usada nos conflitos da checagem
                // prévia, para que uma busca por valor nos logs ache os dois
                // caminhos — só `field` diria que houve conflito, mas não em qual.
                logger.warn("candidate.register.constraint_conflict", {
                    field,
                    ...(field === "email" ? { email: input.email } : { phone: input.phone }),
                });
            }
            if (field === "email") return left(new EmailAlreadyRegisteredError());
            if (field === "phone") return left(new PhoneAlreadyRegisteredError());

            logger.error("candidate.register.insert_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            throw err; // falha técnica genuína (não é E5) — sobe para app.onError()
        }

        logger.info("candidate.register.success", { candidateId: row.id, email: row.email });

        return right({
            id: row.id,
            status: "registered",
            name: row.name,
            email: row.email,
            createdAt: row.created_at,
        });
    }
}
