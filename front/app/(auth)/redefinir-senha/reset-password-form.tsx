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

/**
 * Tela 4 — Definir Nova Senha (FEAT-0003-UI, seções 4.4, 5 e 7.4).
 *
 * Esta é a única tela sem mockup no Stitch, e é bloqueante para o fluxo de
 * recuperação: sem ela o membro recebe o email e não tem para onde ir. O layout
 * é derivado das outras três — mesmo cartão, mesmos campos de senha do cadastro.
 *
 * O estado "verificando token" da seção 5 é o fallback de Suspense da rota: até
 * a query string estar disponível no cliente, a tela não decide nada.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Congelado na primeira renderização de propósito: o efeito abaixo apaga a
  // query string logo em seguida, e a partir daí `searchParams` vem vazio.
  const [token] = useState(() => searchParams.get("token")?.trim() ?? "");

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(ResetPasswordFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) =>
      // O token vem da URL, não do formulário; `parse` monta o payload do
      // contrato e descarta `confirmPassword` (seção 6).
      resetPassword(ResetPasswordSchema.parse({ token, password: values.password })),
    // Não autentica: o backend revogou todas as sessões, então o membro entra de
    // novo com a senha nova (seção 4.4).
    onSuccess: () => router.replace(loginWithNotice(LoginNotice.PASSWORD_CHANGED)),
    onError: (error) => {
      // `WEAK_PASSWORD` é o único erro desta tela com campo — a tela não tem
      // campo de email.
      const view = describeResetPasswordError(error);
      if (view.field === "password") form.setError("password", { message: view.message });
    },
  });

  // O token não deve sobrar na barra de endereços depois de a tela abrir: some
  // do histórico e de eventual compartilhamento de tela (seção 4.4).
  // `replaceState` é integrado ao router do Next, então `searchParams` acompanha
  // — daí o valor ter sido congelado acima.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Token ausente na URL: erro direto, sem chamar a API (seção 4.4, passo 1).
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
