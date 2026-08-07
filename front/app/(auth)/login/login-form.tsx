"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { MailIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { LoginSchema, type LoginDTO } from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useAuth } from "@/lib/auth/auth-context";
import { AFTER_LOGIN_ROUTE, AUTH_ROUTES, LOGIN_NOTICE_PARAM, LoginNotice } from "@/lib/auth/routes";

import { AuthCard } from "../_components/auth-card";
import { AuthErrorAlert, AuthNoticeAlert } from "../_components/auth-alert";
import { AuthInput, AuthPasswordInput } from "../_components/auth-input";
import { AuthSubmitButton } from "../_components/auth-submit-button";
import { describeLoginError } from "../_lib/auth-error-view";

const NOTICE_COPY: Record<string, string> = {
  [LoginNotice.PASSWORD_CHANGED]: "Senha alterada com sucesso. Entre com a nova senha.",
  [LoginNotice.SESSION_EXPIRED]: "Sua sessão foi encerrada. Entre novamente para continuar.",
};

/** Tela 1 — Acessar Conta (FEAT-0003-UI, seções 4.2, 5 e 7.2). */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();

  const form = useForm<LoginDTO>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginDTO) => signIn(values),
    onSuccess: () => router.replace(AFTER_LOGIN_ROUTE),
  });

  const errorView = mutation.error ? describeLoginError(mutation.error) : null;
  const notice = NOTICE_COPY[searchParams.get(LOGIN_NOTICE_PARAM) ?? ""];

  return (
    <AuthCard title="Acessar Conta" description="Entre com suas credenciais institucionais.">
      {notice && !errorView && <AuthNoticeAlert>{notice}</AuthNoticeAlert>}
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

          <Field data-invalid={!!form.formState.errors.password}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <AuthPasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              aria-invalid={!!form.formState.errors.password}
              {...form.register("password")}
            />
            <FieldError errors={[form.formState.errors.password]} />
            <div className="flex justify-end">
              <Link
                href={AUTH_ROUTES.forgotPassword}
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
          </Field>

          <AuthSubmitButton pending={mutation.isPending} pendingLabel="Entrando…">
            Entrar
          </AuthSubmitButton>
        </FieldGroup>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Não possui conta?{" "}
        <Link
          href={AUTH_ROUTES.register}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Cadastre-se agora
        </Link>
      </p>
    </AuthCard>
  );
}
