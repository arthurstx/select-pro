import { z } from "zod";
import { RegisterMemberSchema, ResetPasswordSchema } from "shared";

/**
 * Schemas dos formulários = contrato de `shared` + `confirmPassword`
 * (FEAT-0003-UI, seção 6).
 *
 * `confirmPassword` é campo **só de cliente**: não existe no contrato da API e
 * nunca é enviado. Ele é acrescentado aqui, sobre o schema compartilhado, e o
 * payload volta a ser o do contrato no momento do submit — as telas chamam
 * `RegisterMemberSchema.parse` / `ResetPasswordSchema.parse`, que descartam
 * qualquer chave a mais.
 *
 * Nenhuma regra é reescrita: o formato do email e a política de senha continuam
 * vindo de `EmailSchema`/`PasswordSchema`. Em particular, **não há validação de
 * domínio** — a elegibilidade é decidida pela API contra a base da tec, e barrar
 * por domínio no cliente impediria um membro legítimo com email pessoal.
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
