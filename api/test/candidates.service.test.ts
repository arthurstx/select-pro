import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { EmailAlreadyRegisteredError, PhoneAlreadyRegisteredError } from "../src/core/errors/candidate-errors";
import { CandidateRepository } from "../src/repositories/candidates.repository";
import { CandidateService } from "../src/services/candidates.service";

let counter = 0;
function uniqueCandidateInput() {
    counter += 1;
    return {
        name: `Candidato ${counter}`,
        email: `candidato${counter}@example.com`,
        phone: `7199999${String(counter).padStart(4, "0")}`,
        course: "eng-computacao" as const,
        semester: 3 as const,
        gender: "outro" as const,
        ethnicity: "nao-informado" as const,
        referralSource: "instagram" as const,
        mejAcknowledged: true as const,
        experience: "Já participei de projetos de extensão e hackathons.",
        motivation: "Quero aplicar o que aprendo na prática.",
        saturdayRestriction: false,
        specialNeeds: false,
    };
}

/** Payload de `candidates.insertWithApplication` a partir do input de inscrição (sem os campos gerados). */
function candidateRowFrom(input: ReturnType<typeof uniqueCandidateInput>) {
    return {
        candidate: {
            id: crypto.randomUUID(),
            name: input.name,
            email: input.email,
            phone: input.phone,
            course: input.course,
            semester: input.semester,
            gender: input.gender,
            ethnicity: input.ethnicity,
        },
        application: {
            id: crypto.randomUUID(),
            referral_source: input.referralSource,
            referral_source_other: null,
            mej_acknowledged: input.mejAcknowledged,
            experience: input.experience,
            motivation: input.motivation,
            saturday_restriction: input.saturdayRestriction,
            special_needs: input.specialNeeds,
        },
    };
}

function buildService() {
    const candidates = new CandidateRepository(env.DB);
    return { service: new CandidateService(candidates), candidates };
}

async function applicationOf(candidateId: string) {
    return env.DB.prepare("SELECT * FROM candidate_applications WHERE candidate_id = ?")
        .bind(candidateId)
        .first<{
            referral_source: string;
            referral_source_other: string | null;
            experience: string;
            motivation: string;
            mej_acknowledged: number;
        }>();
}

describe("CandidateService.register", () => {
    it("fluxo feliz: grava candidato e questionário atomicamente, com id novo", async () => {
        const { service, candidates } = buildService();
        const input = uniqueCandidateInput();

        const result = await service.register(input);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        expect(result.value.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(result.value.status).toBe("registered");
        expect(result.value.name).toBe(input.name);
        expect(result.value.email).toBe(input.email);
        expect(result.value.createdAt).toBeTruthy();

        const stored = await candidates.findByEmail(input.email);
        expect(stored?.id).toBe(result.value.id);
        expect(stored?.ethnicity).toBe(input.ethnicity);

        const application = await applicationOf(result.value.id);
        expect(application).not.toBeNull();
        expect(application?.referral_source).toBe(input.referralSource);
        expect(application?.experience).toBe(input.experience);
        expect(application?.motivation).toBe(input.motivation);
        expect(application?.mej_acknowledged).toBe(1);
    });

    it("E1 - bloqueia quando o email já pertence a um candidato inscrito", async () => {
        const { service, candidates } = buildService();
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input);
        await candidates.insertWithApplication(candidate, application);

        const result = await service.register({ ...uniqueCandidateInput(), email: input.email });

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) {
            expect(result.value).toBeInstanceOf(EmailAlreadyRegisteredError);
        }
    });

    it("E2 - bloqueia quando o telefone já pertence a um candidato inscrito", async () => {
        const { service, candidates } = buildService();
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input);
        await candidates.insertWithApplication(candidate, application);

        const result = await service.register({ ...uniqueCandidateInput(), phone: input.phone });

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) {
            expect(result.value).toBeInstanceOf(PhoneAlreadyRegisteredError);
        }
    });

    it("E5 - conflito que escapa da checagem prévia é traduzido pela constraint do banco", async () => {
        const { service, candidates } = buildService();
        const input = uniqueCandidateInput();

        // Simula a corrida do E5: a linha aparece no banco depois que `register` já leu.
        const original = candidates.findByEmail.bind(candidates);
        candidates.findByEmail = async () => {
            const { candidate, application } = candidateRowFrom({ ...uniqueCandidateInput(), email: input.email });
            await candidates.insertWithApplication(candidate, application);
            candidates.findByEmail = original;
            return null;
        };

        const result = await service.register(input);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) {
            expect(result.value).toBeInstanceOf(EmailAlreadyRegisteredError);
        }
    });

    it("guarda a descrição livre quando a origem é 'outros'", async () => {
        const { service } = buildService();
        const input = { ...uniqueCandidateInput(), referralSource: "outros" as const, referralSourceOther: "Feira de profissões da escola" };

        const result = await service.register(input);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const application = await applicationOf(result.value.id);
        expect(application?.referral_source).toBe("outros");
        expect(application?.referral_source_other).toBe("Feira de profissões da escola");
    });

    it("descarta a descrição livre quando a origem não é 'outros'", async () => {
        const { service } = buildService();
        const input = { ...uniqueCandidateInput(), referralSource: "linkedin" as const, referralSourceOther: "ignorar isso" };

        const result = await service.register(input);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const application = await applicationOf(result.value.id);
        expect(application?.referral_source).toBe("linkedin");
        expect(application?.referral_source_other).toBeNull();
    });
});

describe("CandidateRepository.insertWithApplication — atomicidade (FEAT-0001 v3.0, seção 9)", () => {
    it("uma falha no insert do candidato não deixa uma linha órfã em candidate_applications", async () => {
        const { candidates } = buildService();
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input);

        await candidates.insertWithApplication(candidate, application);

        const duplicate = candidateRowFrom({ ...uniqueCandidateInput(), email: input.email });
        await expect(candidates.insertWithApplication(duplicate.candidate, duplicate.application)).rejects.toThrow();

        const count = await env.DB.prepare("SELECT COUNT(*) as count FROM candidate_applications WHERE candidate_id = ?")
            .bind(duplicate.candidate.id)
            .first<{ count: number }>();
        expect(count?.count).toBe(0);
    });
});
