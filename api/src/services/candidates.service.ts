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

    /** Inscrição em passo único: valida e grava candidato + questionário no mesmo batch. */
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
            // E5: inscrição concorrente gravou o mesmo email/telefone antes desta.
            const field = parseD1ConstraintError(err);
            if (field) {
                logger.warn("candidate.register.constraint_conflict", { field });
            }
            if (field === "email") return left(new EmailAlreadyRegisteredError());
            if (field === "phone") return left(new PhoneAlreadyRegisteredError());

            logger.error("candidate.register.insert_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            throw err; // falha técnica genuína — sobe para app.onError()
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
