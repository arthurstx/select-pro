import { AuthErrorCode } from "shared";
import type { ZodError } from "zod";

// Tradução de erro de validação Zod → forma de erro de domínio (`code`/`message`/`field`),
// compartilhada por `auth.routes.ts` e `signup-requests.routes.ts` — as duas rotas que
// recebem senha no corpo e precisam apontar o campo exato ao front (FEAT-0008/0023).

export interface DomainError {
    code: string;
    message: string;
    field?: string;
}

/**
 * Um erro no campo `password` vira `WEAK_PASSWORD` (E4/E15) — código próprio,
 * não `VALIDATION_ERROR` genérico, porque o front trata os dois de forma
 * diferente (senha fraca tem copy própria). Qualquer outro campo vira
 * `VALIDATION_ERROR` com `field` apontando qual, para o formulário destacar
 * o campo certo — essencial no cadastro auto-declarado, que tem 9 campos.
 */
export function mapValidationError(error: ZodError): DomainError {
    const issue = error.issues[0];
    const field = issue?.path[0];

    if (field === "password") {
        return {
            code: AuthErrorCode.WEAK_PASSWORD,
            message: issue.message,
            field: "password",
        };
    }

    return {
        code: "VALIDATION_ERROR",
        message: issue?.message ?? "Dados inválidos",
        field: typeof field === "string" ? field : undefined,
    };
}
