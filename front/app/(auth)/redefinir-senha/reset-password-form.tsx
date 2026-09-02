"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, LockKeyholeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ResetPasswordSchema } from "shared";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { resetPassword } from "@/lib/auth/auth-api";
import { AUTH_ROUTES, LoginNotice, loginWithNotice } from "@/lib/auth/routes";

import { AuthCard } from "../_components/auth-card";
import { AuthErrorAlert } from "../_components/auth-alert";
import { AuthPasswordInput } from "../_components/auth-input";
import { AuthSubmitButton } from "../_components/auth-submit-button";
import { describeResetPasswordError } from "../_lib/auth-error-view";
import {
  ResetPasswordFormSchema,
  type ResetPasswordFormValues,
} from "../_lib/auth-form-schemas";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Congelado na primeira renderização: o efeito abaixo apaga a query string logo em seguida.
  const [token] = useState(() => searchParams.get("token")?.trim() ?? "");

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(ResetPasswordFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) =>
      resetPassword(ResetPasswordSchema.parse({ token, password: values.password })),
    onSuccess: () => router.replace(loginWithNotice(LoginNotice.PASSWORD_CHANGED)),
    onError: (error) => {
      const view = describeResetPasswordError(error);
      if (view.field === "password") form.setError("password", { message: view.message });
    },
  });

  // O token não deve sobrar na barra de endereços depois de a tela abrir.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!token) {
    return (
      <AuthCard title="Link inválido">
        <AuthErrorAlert
          view={{
            message:
              "Este endereço não tem um link de recuperação válido. Peça um novo link para redefinir sua senha.",
          }}
        />
        <Button asChild size="lg" className="h-11 w-full">
          <Link href={AUTH_ROUTES.forgotPassword}>Pedir um novo link</Link>
        </Button>
        <Link
          href={AUTH_ROUTES.login}
          className="text-muted-foreground hover:text-foreground mt-6 flex items-center justify-center gap-2 text-sm underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Voltar para o login
        </Link>
      </AuthCard>
    );
  }

  const errorView = mutation.error ? describeResetPasswordError(mutation.error) : null;

  return (
    <AuthCard
      title="Definir Nova Senha"
      description="Escolha uma nova senha para sua conta. Depois de salvar, entre novamente com ela."
    >
      {errorView && !errorView.field && <AuthErrorAlert view={errorView} />}

      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
        <FieldGroup className="gap-5">
          <Field data-invalid={!!form.formState.errors.password}>
            <FieldLabel htmlFor="password">Nova senha</FieldLabel>
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
            <FieldLabel htmlFor="confirmPassword">Confirmar nova senha</FieldLabel>
            <AuthPasswordInput
              id="confirmPassword"
              icon={LockKeyholeIcon}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              aria-invalid={!!form.formState.errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>

          <AuthSubmitButton pending={mutation.isPending} pendingLabel="Salvando…">
            Salvar nova senha
          </AuthSubmitButton>
        </FieldGroup>
      </form>

      <Link
        href={AUTH_ROUTES.login}
        className="text-muted-foreground hover:text-foreground mt-6 flex items-center justify-center gap-2 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Voltar para o login
      </Link>
    </AuthCard>
  );
}
