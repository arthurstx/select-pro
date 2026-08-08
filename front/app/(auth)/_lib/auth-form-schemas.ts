import { z } from "zod";
import { RegisterMemberSchema, ResetPasswordSchema } from "shared";

/**
 * Schemas dos formulários = contrato de `shared` + `confirmPassword`, campo
 * só de cliente que nunca é enviado (as telas fazem `.parse` do schema
 * compartilhado no submit, que descarta a chave extra).
 */
const CONFIRM_PASSWORD_FIELD = z.string().min(1, "Confirme sua senha");

const matchesPassword = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword;

const MISMATCH = {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
};

export const RegisterFormSchema = RegisterMemberSchema.extend({
  confirmPassword: CONFIRM_PASSWORD_FIELD,
}).refine(matchesPassword, MISMATCH);

export type RegisterFormValues = z.infer<typeof RegisterFormSchema>;

/** O `token` não é digitado: vem da query string, então sai do formulário. */
export const ResetPasswordFormSchema = ResetPasswordSchema.omit({ token: true })
  .extend({ confirmPassword: CONFIRM_PASSWORD_FIELD })
  .refine(matchesPassword, MISMATCH);

export type ResetPasswordFormValues = z.infer<typeof ResetPasswordFormSchema>;
