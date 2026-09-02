"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, MailCheckIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { ForgotPasswordSchema, type ForgotPasswordDTO } from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { forgotPassword } from "@/lib/auth/auth-api";
import { AUTH_ROUTES } from "@/lib/auth/routes";

import { AuthCard } from "../_components/auth-card";
import { AuthErrorAlert } from "../_components/auth-alert";
import { AuthInput } from "../_components/auth-input";
import { AuthSubmitButton } from "../_components/auth-submit-button";
import { describeForgotPasswordError } from "../_lib/auth-error-view";

function BackToLogin() {
  return (
    <Link
      href={AUTH_ROUTES.login}
      className="text-muted-foreground hover:text-foreground mt-6 flex items-center justify-center gap-2 text-sm underline-offset-4 hover:underline"
    >
      <ArrowLeftIcon className="size-4" aria-hidden />
      Voltar para o login
    </Link>
  );
}

export function ForgotPasswordForm() {
  const form = useForm<ForgotPasswordDTO>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({ mutationFn: forgotPassword });

  if (mutation.isSuccess) {
    return (
      <AuthCard title="Verifique seu email">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
            <MailCheckIcon className="size-6" aria-hidden />
          </span>
          {/* Mensagem condicional do backend — não confirma se o email existe. */}
          <p className="text-muted-foreground text-sm leading-relaxed" role="status">
            {mutation.data.message}
          </p>
        </div>

        <BackToLogin />
      </AuthCard>
    );
  }

  const errorView = mutation.error ? describeForgotPasswordError(mutation.error) : null;

  return (
    <AuthCard
      title="Recuperar Acesso"
      description="Insira seu e-mail institucional e enviaremos um link para redefinir sua senha."
    >
      {errorView && <AuthErrorAlert view={errorView} />}

      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
        <FieldGroup className="gap-5">
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

          <AuthSubmitButton pending={mutation.isPending} pendingLabel="Enviando…">
            Enviar link de recuperação
          </AuthSubmitButton>
        </FieldGroup>
      </form>

      <BackToLogin />
    </AuthCard>
  );
}
