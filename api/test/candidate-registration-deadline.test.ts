import { describe, expect, it } from "vitest";

import { isRegistrationOpen } from "../src/lib/candidate-registration-deadline";

describe("isRegistrationOpen", () => {
    it("permite inscrição antes do prazo", () => {
        expect(isRegistrationOpen(new Date("2026-09-05T02:59:59.000Z"))).toBe(true);
    });

    it("bloqueia inscrição após o prazo", () => {
        expect(isRegistrationOpen(new Date("2026-09-05T03:00:00.000Z"))).toBe(false);
    });
});
