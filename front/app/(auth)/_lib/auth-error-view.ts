import { AuthErrorCode } from "shared";

import { ApiError } from "@/lib/api/api-error";

import { AUTH_ROUTES } from "@/lib/auth/routes";

/**
 * Como um erro da API vira tela (FEAT-0003-UI, seção 7).
 *
 * Não é um contrato com o backend — é a camada de copy. Os `code` vêm do enum
 * `AuthErrorCode` de `shared`; nenhuma string literal é comparada.
 */
export interface AuthErrorView {
  message: string;
  /** Quando o erro pertence a um campo, ele é exibido inline nele. */
  field?: "email" | "password";
  /** Caminho de saída oferecido junto da mensagem. */
  action?: { href: string; label: string };
}

const NETWORK_FAILURE = "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.";
const RATE_LIMITED = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
const UNEXPECTED = "Algo deu errado. Tente novamente.";

/**
 * Fallback comum às quatro telas. Erro de rede, timeout e 5xx genérico pedem
 * "tente novamente" — e nunca deslogam nem limpam o formulário (seção 7.5).
 */
function fallbackView(error: unknown): AuthErrorView {
  if (!(error instanceof ApiError)) return { message: NETWORK_FAILURE };

  // 429 é resposta do edge da Cloudflare, antes do Worker: não tem envelope,
  // então é tratado pelo status (seção 7.2).
  if (error.status === 429) return { message: RATE_LIMITED };

  return { message: error.message || UNEXPECTED };
}

function codeOf(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

/** Seção 7.1 — cadastro. */
export function describeRegisterError(error: unknown): AuthErrorView {
  switch (codeOf(error)) {
    case AuthErrorCode.EMAIL_ALREADY_REGISTERED:
      return {
        message: "Já existe uma conta com este email.",
        action: { href: AUTH_ROUTES.login, label: "Entrar na sua conta" },
      };

    // Definitivo: tentar de novo não muda nada, então a copy não sugere isso.
    case AuthErrorCode.NOT_A_MEMBER:
      return {
        message:
          "Este email não consta no cadastro de membros da CIMATEC jr. Procure quem administra o cadastro da tec para incluir ou corrigir seu email.",
      };

    // Também definitivo, mas é outra situação e outra pessoa para procurar.
    case AuthErrorCode.MEMBER_NOT_ACTIVE:
      return {
        message:
          "Seu cadastro de membro não está ativo. Procure a diretoria para regularizar seu vínculo antes de criar a conta.",
      };

    // Transitório — o único dos três que passa sozinho.
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

/** Seção 7.2 — login. */
export function describeLoginError(error: unknown): AuthErrorView {
  switch (codeOf(error)) {
    // No nível do formulário, nunca no campo: o backend responde igual para
    // email inexistente e senha errada, e apontar o campo reintroduziria no
    // front o oracle que o backend evita.
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

/** Seção 7.3 — recuperação. O backend sempre responde 202; sobra rede e 429. */
export function describeForgotPasswordError(error: unknown): AuthErrorView {
  return fallbackView(error);
}

/** Seção 7.4 — definição de nova senha. */
export function describeResetPasswordError(error: unknown): AuthErrorView {
  switch (codeOf(error)) {
    // A UI não sabe (e o backend não diz) se o link expirou, é inválido ou já
    // foi usado — daí a mensagem única com um caminho para pedir outro.
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
