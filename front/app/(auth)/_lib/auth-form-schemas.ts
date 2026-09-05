import { z } from "zod";
import {
  CourseSchema,
  EmailSchema,
  EthnicitySchema,
  GenderSchema,
  isValidBrazilianPhone,
  MemberStatusSchema,
  PasswordSchema,
  ResetPasswordSchema,
  SemesterSchema,
} from "shared";

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

/**
 * Campos auto-declarados (FEAT-0008, emenda 2026-09-04) — obrigatórios só
 * quando `memberStatus !== "active"` (ver `superRefine` abaixo). Ficam
 * `.optional()` no tipo porque o mesmo `useForm` atende as 3 trilhas: um
 * tipo-união faria RHF perder a tipagem de `register`/`formState.errors` no
 * branch do efetivo (RHF assume um objeto só, não uma união discriminada).
 * O contrato de verdade — `active` sem esses campos, auto-declarado com
 * todos — vive em `shared` (`RegisterMemberSchema`/`SelfDeclaredSignupSchema`),
 * aplicado via `.parse()` no submit de cada trilha.
 */
const SELF_DECLARED_FIELD_NAMES = [
  "fullName",
  "phone",
  "course",
  "semester",
  "gender",
  "ethnicity",
] as const;

function requireSelfDeclaredFields(
  data: {
    memberStatus: string;
    fullName?: string;
    phone?: string;
    course?: string;
    semester?: number;
    gender?: string;
    ethnicity?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.memberStatus === "active") return;

  for (const field of SELF_DECLARED_FIELD_NAMES) {
    if (!data[field]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Campo obrigatório" });
    }
  }

  // Checagem antecipada: sem ela, um telefone mal formado só seria
  // recusado depois do `SelfDeclaredSignupSchema.parse()` no submit,
  // tarde demais para o formulário apontar o campo antes de chamar a API.
  if (data.phone && !isValidBrazilianPhone(data.phone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "Informe um telefone válido com DDD",
    });
  }
}

export const RegisterFormSchema = z
  .object({
    memberStatus: MemberStatusSchema,
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: CONFIRM_PASSWORD_FIELD,
    fullName: z.string().trim().optional(),
    phone: z.string().optional(),
    course: CourseSchema.optional(),
    semester: SemesterSchema.optional(),
    gender: GenderSchema.optional(),
    ethnicity: EthnicitySchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!matchesPassword(data)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: MISMATCH.path, message: MISMATCH.message });
    }
    requireSelfDeclaredFields(data, ctx);
  });

export type RegisterFormValues = z.infer<typeof RegisterFormSchema>;

/** O `token` não é digitado: vem da query string, então sai do formulário. */
export const ResetPasswordFormSchema = ResetPasswordSchema.omit({ token: true })
  .extend({ confirmPassword: CONFIRM_PASSWORD_FIELD })
  .refine(matchesPassword, MISMATCH);

export type ResetPasswordFormValues = z.infer<typeof ResetPasswordFormSchema>;
