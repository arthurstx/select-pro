import { z } from "zod";

/** Envelope de erro padrão da API — contraparte de `{ data: ... }`. */
export const ErrorResponseSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        field: z.string().optional(),
    }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
