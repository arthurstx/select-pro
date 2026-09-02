import { AuthErrorCode } from "shared";

import { ApiError } from "@/lib/api/api-error";

import { AUTH_ROUTES } from "@/lib/auth/routes";

/** Como um erro da API vira tela — camada de copy, não um contrato com o backend. */
export interface AuthErrorView {
  message: string;
  field?: "email" | "password";
  action?: { href: string; label: string };
}

const NETWORK_FAILURE = "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.";
const RATE_LIMITED = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
const UNEXPECTED = "Algo deu errado. Tente novamente.";

function fallbackView(error: unknown): AuthErrorView {
  if (!(error instanceof ApiError)) return { message: NETWORK_FAILURE };

  // 429 é resposta do edge da Cloudflare, antes do Worker — sem envelope, tratado pelo status.
  if (error.status === 429) return { message: RATE_LIMITED };

  return { message: error.message || UNEXPECTED };
}

function codeOf(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

export function describeRegisterError(error: unknown): AuthErrorView {
  switch (codeOf(error)) {
    case AuthErrorCode.EMAIL_ALREADY_REGISTERED:
      return {
        message: "Já existe uma conta com este email.",
        action: { href: AUTH_ROUTES.login, label: "Entrar na sua conta" },
      };

    case AuthErrorCode.NOT_A_MEMBER:
      return {
        message:
          "Este email não consta no cadastro de membros da CIMATEC jr. Procure quem administra o cadastro da tec para incluir ou corrigir seu email.",
      };

    case AuthErrorCode.MEMBER_NOT_ACTIVE:
      return {
        message:
          "Seu cadastro de membro não está ativo. Procure a diretoria para regularizar seu vínculo antes de criar a conta.",
      };

    case AuthErrorCode.MEMBER_DIRECTORY_UNAVAILABLE:
      return {
        message: "Não foi possível verificar seu cadastro agora. Tente novamente em alguns minutos.",
      };

    case AuthErrorCode.WEAK_PASSWORD:
      return { message: (error as ApiError).message, field: "password" };

    default:
      return fallbackView(error);
  }
}

export function describeLoginError(error: unknown): AuthErrorView {
  switch (codeOf(error)) {
    // No nível do formulário, nunca no campo: o backend responde igual para email/senha errados.
    case AuthErrorCode.INVALID_CREDENTIALS:
      return { message: "Email ou senha incorretos." };

    case AuthErrorCode.ACCOUNT_DEACTIVATED:
      return {
        message: "Sua conta foi desativada. Procure a diretoria para reativar seu acesso.",
      };

    default:
      return fallbackView(error);
  }
}

export function describeForgotPasswordError(error: unknown): AuthErrorView {
  return fallbackView(error);
}

export function describeResetPasswordError(error: unknown): AuthErrorView {
  switch (codeOf(error)) {
    case AuthErrorCode.INVALID_RESET_TOKEN:
      return {
        message:
          "Este link de recuperação não é mais válido. Ele pode ter expirado ou já ter sido usado.",
        action: { href: AUTH_ROUTES.forgotPassword, label: "Pedir um novo link" },
      };

    case AuthErrorCode.WEAK_PASSWORD:
      return { message: (error as ApiError).message, field: "password" };

    default:
      return fallbackView(error);
  }
}
