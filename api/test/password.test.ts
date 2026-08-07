import { describe, expect, it } from "vitest";

import {
    hashPassword,
    parsePasswordHash,
    passwordNeedsRehash,
    PBKDF2_ITERATIONS,
    verifyPassword,
} from "../src/lib/password";

/**
 * A derivação da senha é o único ponto do sistema onde um erro silencioso vira
 * vazamento em vez de erro visível — daí o teste do formato do hash e não só do
 * "confere / não confere".
 */
describe("hashPassword", () => {
    it("grava o algoritmo, as iterações, o salt e o hash no formato da spec", async () => {
        const hash = await hashPassword("senha-do-membro");
        const parts = hash.split("$");

        expect(parts).toHaveLength(4);
        expect(parts[0]).toBe("pbkdf2-sha256");
        expect(Number(parts[1])).toBe(PBKDF2_ITERATIONS);
        // base64url: nada de `+`, `/` ou `=` — o `$` é o separador do formato,
        // e um salt em base64 padrão poderia trazer caracteres que o quebram.
        expect(parts[2]).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(parts[3]).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("gera salt diferente a cada chamada, então a mesma senha nunca produz o mesmo hash", async () => {
        const [first, second] = await Promise.all([hashPassword("mesma-senha"), hashPassword("mesma-senha")]);

        expect(first).not.toBe(second);
        // Salt por usuário é o que impede uma rainbow table de atacar todas as
        // contas de uma vez — a mitigação que sobra com iterações baixas.
        expect(parsePasswordHash(first)?.salt).not.toEqual(parsePasswordHash(second)?.salt);
    });

    it("nunca guarda a senha em claro", async () => {
        const hash = await hashPassword("senha-super-secreta");

        expect(hash).not.toContain("senha-super-secreta");
    });
});

describe("verifyPassword", () => {
    it("aceita a senha correta", async () => {
        const hash = await hashPassword("senha-correta");

        await expect(verifyPassword("senha-correta", hash)).resolves.toBe(true);
    });

    it("rejeita a senha errada", async () => {
        const hash = await hashPassword("senha-correta");

        await expect(verifyPassword("senha-errada", hash)).resolves.toBe(false);
    });

    it("rejeita quando não há hash (usuário inexistente ou sem senha), sem lançar", async () => {
        await expect(verifyPassword("qualquer-senha", null)).resolves.toBe(false);
    });

    it("rejeita hash corrompido em vez de estourar — hash inválido não pode virar 500", async () => {
        await expect(verifyPassword("senha", "não-é-um-hash")).resolves.toBe(false);
        await expect(verifyPassword("senha", "pbkdf2-sha256$abc$salt$hash")).resolves.toBe(false);
        await expect(verifyPassword("senha", "argon2$25000$c2FsdA$aGFzaA")).resolves.toBe(false);
    });

    it("rejeita um hash adulterado que manteve o formato", async () => {
        const hash = await hashPassword("senha-correta");
        const [tag, iterations, salt] = hash.split("$");
        const forged = [tag, iterations, salt, "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh"].join("$");

        await expect(verifyPassword("senha-correta", forged)).resolves.toBe(false);
    });

    it("valida um hash gerado com outro número de iterações", async () => {
        // É o que torna o aumento de custo possível sem migration: hashes de
        // custos diferentes precisam coexistir e continuar validando.
        const legacy = await hashPassword("senha-antiga", 1000);

        await expect(verifyPassword("senha-antiga", legacy)).resolves.toBe(true);
        await expect(verifyPassword("outra", legacy)).resolves.toBe(false);
    });
});

describe("passwordNeedsRehash", () => {
    it("pede re-hash quando o hash guardado usa menos iterações que as atuais", async () => {
        const legacy = await hashPassword("senha", PBKDF2_ITERATIONS - 1000);

        expect(passwordNeedsRehash(legacy)).toBe(true);
    });

    it("não pede re-hash para um hash no custo atual", async () => {
        const current = await hashPassword("senha");

        expect(passwordNeedsRehash(current)).toBe(false);
    });

    it("não pede re-hash para hash com MAIS iterações — baixar o custo seria enfraquecer a conta", async () => {
        const stronger = await hashPassword("senha", PBKDF2_ITERATIONS + 10_000);

        expect(passwordNeedsRehash(stronger)).toBe(false);
    });

    it("não pede re-hash para hash ilegível: ele é inválido, não fraco", () => {
        expect(passwordNeedsRehash("lixo")).toBe(false);
    });
});
