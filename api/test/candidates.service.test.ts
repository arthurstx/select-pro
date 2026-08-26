import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { EmailAlreadyRegisteredError, PhoneAlreadyRegisteredError } from "../src/core/errors/candidate-errors";
import { CandidateRepository } from "../src/repositories/candidates.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { CandidateService } from "../src/services/candidates.service";

let counter = 0;
function uniqueCandidateInput() {
    counter += 1;
    return {
        name: `Candidato ${counter}`,
        email: `candidato${counter}@example.com`,
        // Já em E.164: `RegisterRequest` é o tipo de SAÍDA do schema, que
        // normaliza no `.transform()` (FEAT-0006). O service nunca recebe
        // telefone com máscara — quem faz esse trabalho é a validação.
        phone: `+557199999${String(counter).padStart(4, "0")}`,
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
        specialNeedsDescription: undefined as string | undefined,
    };
}

/** Edição corrente, resolvida do mesmo jeito que o service faz — sem depender do id semeado pela migration. */
async function currentProcessId(): Promise<string> {
    const process = await new SelectionProcessRepository(env.DB).resolveCurrent();
    return process.id;
}

/** Payload de `candidates.insertWithApplication` a partir do input de inscrição (sem os campos gerados). */
function candidateRowFrom(input: ReturnType<typeof uniqueCandidateInput>, processId: string) {
    return {
        candidate: {
            id: crypto.randomUUID(),
            process_id: processId,
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
            special_needs_description: input.specialNeeds ? (input.specialNeedsDescription ?? null) : null,
        },
    };
}

function buildService() {
    const candidates = new CandidateRepository(env.DB);
    const processes = new SelectionProcessRepository(env.DB);
    return { service: new CandidateService(candidates, processes), candidates };
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
            special_needs: number;
            special_needs_description: string | null;
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

        const stored = await candidates.findByEmailInProcess(input.email, await currentProcessId());
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
        const { candidate, application } = candidateRowFrom(input, await currentProcessId());
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
        const { candidate, application } = candidateRowFrom(input, await currentProcessId());
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
        const original = candidates.findByEmailInProcess.bind(candidates);
        candidates.findByEmailInProcess = async () => {
            const { candidate, application } = candidateRowFrom({ ...uniqueCandidateInput(), email: input.email }, await currentProcessId());
            await candidates.insertWithApplication(candidate, application);
            candidates.findByEmailInProcess = original;
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

    it("FEAT-0014: grava a descrição quando specialNeeds é true", async () => {
        const { service } = buildService();
        const input = {
            ...uniqueCandidateInput(),
            specialNeeds: true,
            specialNeedsDescription: "Uso cadeira de rodas — preciso de acesso sem escadas.",
        };

        const result = await service.register(input);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const application = await applicationOf(result.value.id);
        expect(application?.special_needs).toBe(1);
        expect(application?.special_needs_description).toBe(input.specialNeedsDescription);
    });

    it("FEAT-0014: descarta a descrição quando specialNeeds é false, mesmo se enviada", async () => {
        const { service } = buildService();
        const input = {
            ...uniqueCandidateInput(),
            specialNeeds: false,
            specialNeedsDescription: "isso não deveria ser gravado",
        };

        const result = await service.register(input);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const application = await applicationOf(result.value.id);
        expect(application?.special_needs).toBe(0);
        expect(application?.special_needs_description).toBeNull();
    });
});

describe("CandidateRepository.insertWithApplication — atomicidade (FEAT-0001 v3.0, seção 9)", () => {
    it("uma falha no insert do candidato não deixa uma linha órfã em candidate_applications", async () => {
        const { candidates } = buildService();
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input, await currentProcessId());

        await candidates.insertWithApplication(candidate, application);

        const duplicate = candidateRowFrom({ ...uniqueCandidateInput(), email: input.email }, await currentProcessId());
        await expect(candidates.insertWithApplication(duplicate.candidate, duplicate.application)).rejects.toThrow();

        const count = await env.DB.prepare("SELECT COUNT(*) as count FROM candidate_applications WHERE candidate_id = ?")
            .bind(duplicate.candidate.id)
            .first<{ count: number }>();
        expect(count?.count).toBe(0);
    });
});

describe("Unicidade por edição (FEAT-0006)", () => {
    it("o MESMO email e o MESMO telefone são aceitos em edições diferentes", async () => {
        const { candidates } = buildService();
        const processes = new SelectionProcessRepository(env.DB);
        const input = uniqueCandidateInput();

        const atual = await processes.resolveCurrent();
        // Edição anterior: a `2026.1` é semeada pela migration e nunca seria
        // criada sob demanda (a criação só olha para "hoje").
        const anterior = await processes.findByLabel("2026.1");
        expect(anterior).not.toBeNull();
        expect(anterior!.id).not.toBe(atual.id);

        const primeira = candidateRowFrom(input, anterior!.id);
        await candidates.insertWithApplication(primeira.candidate, primeira.application);

        // Mesma pessoa, mesmos dados de contato, edição nova — é
        // recandidatura, não conflito. Antes da FEAT-0006 isto falhava.
        const segunda = candidateRowFrom(input, atual.id);
        await candidates.insertWithApplication(segunda.candidate, segunda.application);

        const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM candidates WHERE email = ?")
            .bind(input.email)
            .first<{ n: number }>();
        expect(total?.n).toBe(2);
    });

    it("a busca de duplicidade é escopada: não enxerga o candidato de outra edição", async () => {
        const { candidates } = buildService();
        const processes = new SelectionProcessRepository(env.DB);
        const input = uniqueCandidateInput();

        const anterior = await processes.findByLabel("2026.1");
        const { candidate, application } = candidateRowFrom(input, anterior!.id);
        await candidates.insertWithApplication(candidate, application);

        const atual = await processes.resolveCurrent();
        expect(await candidates.findByEmailInProcess(input.email, atual.id)).toBeNull();
        expect(await candidates.findByEmailInProcess(input.email, anterior!.id)).not.toBeNull();
    });

    it("na MESMA edição o conflito continua barrado pela constraint", async () => {
        const { candidates } = buildService();
        const input = uniqueCandidateInput();
        const processId = await currentProcessId();

        const primeira = candidateRowFrom(input, processId);
        await candidates.insertWithApplication(primeira.candidate, primeira.application);

        const duplicata = candidateRowFrom(input, processId);
        await expect(
            candidates.insertWithApplication(duplicata.candidate, duplicata.application),
        ).rejects.toThrow();
    });
});
