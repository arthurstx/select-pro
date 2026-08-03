import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
    EmailAlreadyRegisteredError,
    InvalidOtcError,
    InvalidOtcTypeError,
    OtcNotFoundError,
    PhoneAlreadyRegisteredError,
    TooManyAttemptsError,
} from "../src/core/errors/candidate-errors";
import { CandidateRepository } from "../src/repositories/candidates.repository";
import { PendingRegistrationRepository } from "../src/repositories/pending-registration.repository";
import { CandidateService } from "../src/services/candidates.service";
import { FakeMailer } from "./fakes/fake-mailer";

let counter = 0;
function uniqueCandidateInput() {
    counter += 1;
    return {
        name: `Candidato ${counter}`,
        email: `candidato${counter}@example.com`,
        phone: `7199999${String(counter).padStart(4, "0")}`,
        course: "eng-comp" as const,
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

/** Payload de `candidates.insertWithApplication` a partir do input de pré-registro (sem os campos gerados). */
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
            mej_acknowledged: input.mejAcknowledged,
            experience: input.experience,
            motivation: input.motivation,
            saturday_restriction: input.saturdayRestriction,
            special_needs: input.specialNeeds,
        },
    };
}

/** Garante um código de 6 dígitos diferente do informado (para testar E6 sem depender de sorte). */
function wrongCode(code: string): string {
    const asNumber = Number(code);
    const wrong = (asNumber + 1) % 1_000_000;
    return wrong.toString().padStart(6, "0");
}

function buildService(mailer: FakeMailer, overrides?: Partial<{ otcExpiryMinutes: number; otcMaxAttempts: number }>) {
    const candidates = new CandidateRepository(env.DB);
    const pendingRegistrations = new PendingRegistrationRepository(env.PENDING_REGISTRATIONS);
    const service = new CandidateService(candidates, pendingRegistrations, mailer, {
        otcExpiryMinutes: 15,
        otcMaxAttempts: 5,
        ...overrides,
    });
    return { service, candidates, pendingRegistrations };
}

describe("CandidateService.preRegister", () => {
    let mailer: FakeMailer;

    beforeEach(() => {
        mailer = new FakeMailer();
    });

    it("cria um pendingId, grava no KV e envia o OTC por email", async () => {
        const { service, pendingRegistrations } = buildService(mailer);
        const input = uniqueCandidateInput();

        const result = await service.preRegister(input);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        expect(result.value.pendingId).toMatch(/^[0-9a-f-]{36}$/);
        expect(result.value.message).toBeTruthy();
        expect(new Date(result.value.expiresAt).getTime()).toBeGreaterThan(Date.now());

        expect(mailer.sent).toHaveLength(1);
        expect(mailer.sent[0].to).toBe(input.email);
        expect(mailer.sent[0].code).toMatch(/^\d{6}$/);

        const pending = await pendingRegistrations.get(result.value.pendingId);
        expect(pending).not.toBeNull();
        expect(pending?.otc.code_hash).not.toBe(mailer.sent[0].code); // nunca em texto plano
        expect(pending?.otc.attempts).toBe(0);
        expect(pending?.otc.expires_at).toBe(result.value.expiresAt);
    });

    it("E1 - bloqueia quando o email já pertence a um candidato confirmado", async () => {
        const { service, candidates } = buildService(mailer);
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input);
        await candidates.insertWithApplication(candidate, application);

        const result = await service.preRegister({ ...uniqueCandidateInput(), email: input.email });

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) {
            expect(result.value).toBeInstanceOf(EmailAlreadyRegisteredError);
        }
    });

    it("E2 - bloqueia quando o telefone já pertence a um candidato confirmado", async () => {
        const { service, candidates } = buildService(mailer);
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input);
        await candidates.insertWithApplication(candidate, application);

        const result = await service.preRegister({ ...uniqueCandidateInput(), phone: input.phone });

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) {
            expect(result.value).toBeInstanceOf(PhoneAlreadyRegisteredError);
        }
    });
});

describe("CandidateService.confirmOtc", () => {
    let mailer: FakeMailer;

    beforeEach(() => {
        mailer = new FakeMailer();
    });

    it("fluxo feliz: cria o candidato com um id novo (nunca reaproveita o pendingId) e remove a entrada do KV", async () => {
        const { service, candidates, pendingRegistrations } = buildService(mailer);
        const input = uniqueCandidateInput();

        const preRegisterResult = await service.preRegister(input);
        if (!preRegisterResult.isRight()) throw new Error("setup falhou");
        const { pendingId } = preRegisterResult.value;
        const code = mailer.lastCode();

        const result = await service.confirmOtc(pendingId, code);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        expect(result.value.status).toBe("confirmed");
        expect(result.value.email).toBe(input.email);
        expect(result.value.name).toBe(input.name);
        expect(result.value.id).not.toBe(pendingId);

        const stored = await candidates.findByEmail(input.email);
        expect(stored?.id).toBe(result.value.id);
        expect(stored?.ethnicity).toBe(input.ethnicity);

        // A inscrição (questionário) é criada atomicamente junto do candidato (FEAT-0001 v2.0, seção 9).
        const application = await env.DB.prepare("SELECT * FROM candidate_applications WHERE candidate_id = ?")
            .bind(result.value.id)
            .first<{ referral_source: string; experience: string; motivation: string; mej_acknowledged: number }>();
        expect(application).not.toBeNull();
        expect(application?.referral_source).toBe(input.referralSource);
        expect(application?.experience).toBe(input.experience);
        expect(application?.motivation).toBe(input.motivation);
        expect(application?.mej_acknowledged).toBe(1);

        expect(await pendingRegistrations.get(pendingId)).toBeNull();
    });

    it("E5 - retorna OtcNotFoundError para pendingId inexistente", async () => {
        const { service } = buildService(mailer);

        const result = await service.confirmOtc(crypto.randomUUID(), "123456");

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value).toBeInstanceOf(OtcNotFoundError);
    });

    it("E6 - código errado incrementa attempts e não consome a entrada", async () => {
        const { service, pendingRegistrations } = buildService(mailer);
        const input = uniqueCandidateInput();

        const preRegisterResult = await service.preRegister(input);
        if (!preRegisterResult.isRight()) throw new Error("setup falhou");
        const { pendingId } = preRegisterResult.value;
        const code = wrongCode(mailer.lastCode());

        const result = await service.confirmOtc(pendingId, code);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value).toBeInstanceOf(InvalidOtcError);

        const pending = await pendingRegistrations.get(pendingId);
        expect(pending).not.toBeNull();
        expect(pending?.otc.attempts).toBe(1);
    });

    it("E7 - tipo de OTC incorreto é rejeitado e também conta como tentativa", async () => {
        const { service, pendingRegistrations } = buildService(mailer);
        const input = uniqueCandidateInput();

        const preRegisterResult = await service.preRegister(input);
        if (!preRegisterResult.isRight()) throw new Error("setup falhou");
        const { pendingId } = preRegisterResult.value;
        const pending = await pendingRegistrations.get(pendingId);
        if (!pending) throw new Error("setup falhou");

        // Simula uma entrada de outro propósito (reset-password) acidentalmente
        // apontada para este endpoint — proteção interna (FEAT-0001 seção 8.1).
        await pendingRegistrations.put(pendingId, {
            ...pending,
            otc: { ...pending.otc, type: "reset-password" },
        });

        const result = await service.confirmOtc(pendingId, mailer.lastCode());

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value).toBeInstanceOf(InvalidOtcTypeError);

        const after = await pendingRegistrations.get(pendingId);
        expect(after?.otc.attempts).toBe(1);
    });

    it("E9 - excesso de tentativas deleta a entrada do KV e exige novo pré-registro", async () => {
        const { service, pendingRegistrations } = buildService(mailer, { otcMaxAttempts: 2 });
        const input = uniqueCandidateInput();

        const preRegisterResult = await service.preRegister(input);
        if (!preRegisterResult.isRight()) throw new Error("setup falhou");
        const { pendingId } = preRegisterResult.value;
        const bad = wrongCode(mailer.lastCode());

        const first = await service.confirmOtc(pendingId, bad);
        expect(first.isLeft() && first.value instanceof InvalidOtcError).toBe(true);
        expect((await pendingRegistrations.get(pendingId))?.otc.attempts).toBe(1);

        const second = await service.confirmOtc(pendingId, bad);
        expect(second.isLeft()).toBe(true);
        if (second.isLeft()) expect(second.value).toBeInstanceOf(TooManyAttemptsError);

        expect(await pendingRegistrations.get(pendingId)).toBeNull();
    });

    it("E10 - conflito de email detectado só na confirmação preserva o KV para nova tentativa", async () => {
        const { service, pendingRegistrations } = buildService(mailer);
        const sharedEmail = uniqueCandidateInput().email;

        // Dois pré-registros concorrentes com o mesmo email (sem índice no KV,
        // ambos são aceitos — FEAT-0001 seção 4.1).
        const first = uniqueCandidateInput();
        first.email = sharedEmail;
        const second = uniqueCandidateInput();
        second.email = sharedEmail;

        const firstPreRegister = await service.preRegister(first);
        if (!firstPreRegister.isRight()) throw new Error("setup falhou");
        const firstCode = mailer.lastCode();

        const secondPreRegister = await service.preRegister(second);
        if (!secondPreRegister.isRight()) throw new Error("setup falhou");
        const secondPendingId = secondPreRegister.value.pendingId;
        const secondCode = mailer.lastCode();

        const firstConfirm = await service.confirmOtc(firstPreRegister.value.pendingId, firstCode);
        expect(firstConfirm.isRight()).toBe(true);

        const secondConfirm = await service.confirmOtc(secondPendingId, secondCode);
        expect(secondConfirm.isLeft()).toBe(true);
        if (secondConfirm.isLeft()) {
            expect(secondConfirm.value).toBeInstanceOf(EmailAlreadyRegisteredError);
        }

        // A entrada NÃO é deletada em caso de E10 — permite corrigir e tentar de novo.
        expect(await pendingRegistrations.get(secondPendingId)).not.toBeNull();
    });
});

describe("CandidateRepository.insertWithApplication — atomicidade (FEAT-0001 v2.0, seção 9)", () => {
    it("uma falha no insert do candidato não deixa uma linha órfã em candidate_applications", async () => {
        const { candidates } = buildService(new FakeMailer());
        const input = uniqueCandidateInput();
        const { candidate, application } = candidateRowFrom(input);

        // Primeiro insert bem-sucedido.
        await candidates.insertWithApplication(candidate, application);

        // Segundo insert com o mesmo email viola UNIQUE(candidates.email) — o batch
        // inteiro deve falhar, sem gravar a segunda linha de candidate_applications.
        const duplicate = candidateRowFrom({ ...uniqueCandidateInput(), email: input.email });
        await expect(candidates.insertWithApplication(duplicate.candidate, duplicate.application)).rejects.toThrow();

        const count = await env.DB.prepare("SELECT COUNT(*) as count FROM candidate_applications WHERE candidate_id = ?")
            .bind(duplicate.candidate.id)
            .first<{ count: number }>();
        expect(count?.count).toBe(0);
    });
});
