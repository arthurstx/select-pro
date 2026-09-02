"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { LockKeyholeIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { RegisterMemberSchema } from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useAuth } from "@/lib/auth/auth-context";
import { AFTER_LOGIN_ROUTE, AUTH_ROUTES } from "@/lib/auth/routes";

import { AuthCard } from "../_components/auth-card";
import { AuthErrorAlert } from "../_components/auth-alert";
import { AuthInput, AuthPasswordInput } from "../_components/auth-input";
import { AuthSubmitButton } from "../_components/auth-submit-button";
import { describeRegisterError } from "../_lib/auth-error-view";
import { RegisterFormSchema, type RegisterFormValues } from "../_lib/auth-form-schemas";

export function RegisterForm() {
  const router = useRouter();
  const { signUp } = useAuth();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterFormValues) => signUp(RegisterMemberSchema.parse(values)),
    onSuccess: (result, values) => {
      // FEAT-0008: pós-júnior/trainee não ganha sessão — vira solicitação
      // pendente, sem login automático. Membro `active` continua entrando direto.
      if (result.pending) {
        router.replace(`${AUTH_ROUTES.pendingApproval}?email=${encodeURIComponent(values.email)}`);
        return;
      }
      router.replace(AFTER_LOGIN_ROUTE);
    },
    onError: (error) => {
      const view = describeRegisterError(error);
      if (view.field) form.setError(view.field, { message: view.message });
    },
  });

  const errorView = mutation.error ? describeRegisterError(mutation.error) : null;

  return (
    <AuthCard
      title="Criar Conta de Avaliador"
      description="Preencha os dados abaixo com seu e-mail institucional."
    >
      {errorView && !errorView.field && <AuthErrorAlert view={errorView} />}

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

          <AuthSubmitButton pending={mutation.isPending} pendingLabel="Criando conta…">
            Criar conta
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
