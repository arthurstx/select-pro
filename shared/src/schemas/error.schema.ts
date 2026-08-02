import { z } from "zod";

/**
 * Envelope de erro padrão da API. Toda resposta de erro (400/409/410/429/...)
 * segue este formato — contraparte do envelope de sucesso `{ data: ... }`.
 */
export const ErrorResponseSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        /** Presente quando o erro pode ser atribuído a um campo específico do formulário (ex: "email", "phone", "code"). */
        field: z.string().optional(),
    }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
