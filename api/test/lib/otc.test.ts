import { describe, expect, it } from "vitest";

import { generateOtcCode, hashOtcCode, verifyOtcCode } from "../../src/lib/otc";

describe("otc", () => {
    it("gera um código de 6 dígitos numéricos", () => {
        const code = generateOtcCode();
        expect(code).toMatch(/^\d{6}$/);
    });

    it("hash é determinístico para o mesmo código", async () => {
        const hashA = await hashOtcCode("123456");
        const hashB = await hashOtcCode("123456");
        expect(hashA).toBe(hashB);
    });

    it("hashes de códigos diferentes não colidem", async () => {
        const hashA = await hashOtcCode("123456");
        const hashB = await hashOtcCode("654321");
        expect(hashA).not.toBe(hashB);
    });

    it("verifyOtcCode aceita o código correto", async () => {
        const hash = await hashOtcCode("111111");
        expect(await verifyOtcCode("111111", hash)).toBe(true);
    });

    it("verifyOtcCode rejeita código incorreto", async () => {
        const hash = await hashOtcCode("111111");
        expect(await verifyOtcCode("222222", hash)).toBe(false);
    });
});
