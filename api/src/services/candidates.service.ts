import type { CandidateRow, NewCandidate, NewCandidateApplication, RegisterRequest } from "shared";

import { type Either, left, right } from "../core/either";
import {
    EmailAlreadyRegisteredError,
    PhoneAlreadyRegisteredError,
    RegistrationClosedError,
} from "../core/errors/candidate-errors";
import { isRegistrationOpen } from "../lib/candidate-registration-deadline";
import { parseD1ConstraintError } from "../lib/d1-errors";
import { logger } from "../lib/logger";
import type { CandidateRepository } from "../repositories/candidates.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type RegisterError = EmailAlreadyRegisteredError | PhoneAlreadyRegisteredError | RegistrationClosedError;
type RegisterResult = { id: string; status: "registered"; name: string; email: string; createdAt: string };

export class CandidateService {
    constructor(
        private readonly candidates: CandidateRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    /** Inscrição em passo único: valida e grava candidato + questionário no mesmo batch. */
    async register(input: RegisterRequest): Promise<Either<RegisterError, RegisterResult>> {
        // Trava temporária de prazo (2026-09-04): checada antes de qualquer
        // acesso a banco. Ver `lib/candidate-registration-deadline.ts` para o
        // plano de tornar isso configurável por edição no admin.
        if (!isRegistrationOpen(new Date())) {
            logger.warn("candidate.register.registration_closed", { email: input.email });
            return left(new RegistrationClosedError());
        }

        // A edição corrente é resolvida (e criada, se faltar) antes de
        // qualquer checagem: desde a FEAT-0006 a unicidade é escopada nela,
        // então sem a edição não há como saber o que é duplicata.
        const process = await this.processes.resolveCurrent();

        const existingByEmail = await this.candidates.findByEmailInProcess(input.email, process.id);
        if (existingByEmail) {
            logger.warn("candidate.register.email_conflict", { email: input.email, processId: process.id });
            return left(new EmailAlreadyRegisteredError());
        }

        // `input.phone` já chega em E.164 — o schema Zod normaliza (FEAT-0006,
        // seção 4.3). Antes disso esta comparação errava por diferença de
        // máscara, e só a constraint segurava.
        const existingByPhone = await this.candidates.findByPhoneInProcess(input.phone, process.id);
        if (existingByPhone) {
            logger.warn("candidate.register.phone_conflict", { phone: input.phone, processId: process.id });
            return left(new PhoneAlreadyRegisteredError());
        }

        const newCandidate: NewCandidate = {
            id: crypto.randomUUID(),
            process_id: process.id,
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
            // Condicional (FEAT-0014): texto só é persistido quando o boolean é true — mesmo
            // padrão ternário de `referral_source_other` acima.
            special_needs_description: input.specialNeeds ? (input.specialNeedsDescription ?? null) : null,
        };

        let row: CandidateRow;
        try {
            row = await this.candidates.insertWithApplication(newCandidate, newApplication);
        } catch (err) {
            // E5: inscrição concorrente gravou o mesmo email/telefone antes desta.
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
