"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { LockKeyholeIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { MEMBER_STATUS_LABELS, MemberStatusSchema, RegisterMemberSchema, SelfDeclaredSignupSchema } from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { createSignupRequest } from "@/lib/auth/auth-api";
import { useAuth } from "@/lib/auth/auth-context";
import { AFTER_LOGIN_ROUTE, AUTH_ROUTES } from "@/lib/auth/routes";

import { AuthCard } from "../_components/auth-card";
import { AuthErrorAlert } from "../_components/auth-alert";
import { AuthInput, AuthPasswordInput } from "../_components/auth-input";
import { AuthRadioCards } from "../_components/auth-radio-cards";
import { AuthSubmitButton } from "../_components/auth-submit-button";
import { describeRegisterError } from "../_lib/auth-error-view";
import { RegisterFormSchema, type RegisterFormValues } from "../_lib/auth-form-schemas";
import { SelfDeclaredFields } from "./self-declared-fields";

/**
 * 3 trilhas (FEAT-0008, emenda 2026-09-04): Efetivo continua consultando a
 * Supabase; Trainee/Pós-júnior não existem mais lá e se auto-declaram —
 * ver `SelfDeclaredFields` para os campos extras que essas duas trilhas
 * coletam.
 */
const MEMBER_STATUS_OPTIONS = MemberStatusSchema.options.map((status) => ({
  value: status,
  label: MEMBER_STATUS_LABELS[status],
  description:
    status === "active"
      ? "Membro efetivado — confirmamos seu e-mail no cadastro da tec."
      : "Você preenche seus dados e um administrador aprova o acesso.",
}));

export function RegisterForm() {
  const router = useRouter();
  const { signUp } = useAuth();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: {
      memberStatus: "active",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      phone: "",
      course: undefined,
      semester: undefined,
      gender: undefined,
      ethnicity: undefined,
    },
  });

  const memberStatus = form.watch("memberStatus");
  const isSelfDeclared = memberStatus !== "active";

  const mutation = useMutation({
    mutationFn: async (values: RegisterFormValues) => {
      if (values.memberStatus === "active") {
        await signUp(RegisterMemberSchema.parse(values));
        return { pending: false as const };
      }

      await createSignupRequest(SelfDeclaredSignupSchema.parse(values));
      return { pending: true as const };
    },
    onSuccess: (result, values) => {
      // Trainee/Pós-júnior nunca ganham sessão — vira solicitação pendente,
      // sem login automático (FEAT-0008). Efetivo continua entrando direto.
      if (result.pending) {
        router.replace(`${AUTH_ROUTES.pendingApproval}?email=${encodeURIComponent(values.email)}`);
        return;
      }
      router.replace(AFTER_LOGIN_ROUTE);
    },
    onError: (error) => {
      const view = describeRegisterError(error);
      if (view.field && view.field in form.getValues()) {
        form.setError(view.field, { message: view.message });
      }
    },
  });

  const errorView = mutation.error ? describeRegisterError(mutation.error) : null;
  const errorHasField = !!errorView?.field && errorView.field in form.getValues();

  return (
    <AuthCard
      title="Criar Conta de Avaliador"
      description="Selecione seu vínculo com a CIMATEC jr e preencha os dados abaixo."
    >
      {errorView && !errorHasField && <AuthErrorAlert view={errorView} />}

      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
        <FieldGroup className="gap-5">
          <Field data-invalid={!!form.formState.errors.memberStatus}>
            <FieldLabel>Seu vínculo com a CIMATEC jr</FieldLabel>
            <Controller
              control={form.control}
              name="memberStatus"
              render={({ field }) => (
                <AuthRadioCards
                  name="memberStatus"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={MEMBER_STATUS_OPTIONS}
                  aria-invalid={!!form.formState.errors.memberStatus}
                />
              )}
            />
            <FieldError errors={[form.formState.errors.memberStatus]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.email}>
            <FieldLabel htmlFor="email">E-mail institucional</FieldLabel>
            <AuthInput
              id="email"
              icon={MailIcon}
              type="email"
              autoComplete="email"
              placeholder="seu.email@cimatecjr.com.br"
              aria-invalid={!!form.formState.errors.email}
              {...form.register("email")}
            />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>

          {isSelfDeclared && <SelfDeclaredFields control={form.control} errors={form.formState.errors} />}

          <Field data-invalid={!!form.formState.errors.password}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <AuthPasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              aria-invalid={!!form.formState.errors.password}
              {...form.register("password")}
            />
            <FieldError errors={[form.formState.errors.password]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Confirmar senha</FieldLabel>
            <AuthPasswordInput
              id="confirmPassword"
              icon={LockKeyholeIcon}
              autoComplete="new-password"
              placeholder="Repita a senha"
              aria-invalid={!!form.formState.errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>

          <p className="text-muted-foreground text-xs leading-relaxed">
            Ao criar sua conta, você concorda com nossa{" "}
            <Link href={AUTH_ROUTES.privacy} className="text-primary underline underline-offset-4">
              Política de Privacidade
            </Link>
            .
          </p>

          <AuthSubmitButton pending={mutation.isPending} pendingLabel="Enviando…">
            {isSelfDeclared ? "Enviar solicitação" : "Criar conta"}
          </AuthSubmitButton>
        </FieldGroup>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Já possui uma conta?{" "}
        <Link
          href={AUTH_ROUTES.login}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Entrar agora
        </Link>
      </p>
    </AuthCard>
  );
}
