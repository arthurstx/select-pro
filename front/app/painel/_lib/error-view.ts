import { AuthErrorCode, CheckinErrorCode } from "shared";

import { ApiError } from "@/lib/api/api-error";

export interface TerminalError {
  title: string;
  description: string;
}

/**
 * Erros que derrubam a tela inteira e para os quais "tentar novamente" não é
 * uma ação honesta. Tudo que não estiver aqui — rede, 5xx — cai no estado de
 * erro com botão de repetir, e **nunca** desloga (FEAT-0007-UI, seção 7).
 *
 * `TOKEN_EXPIRED` e `INVALID_TOKEN` também não aparecem: o primeiro é
 * invisível (o `authFetch` renova e repete) e o segundo encerra a sessão
 * antes de chegar aqui.
 */
export function terminalErrorFor(error: unknown): TerminalError | null {
  if (!(error instanceof ApiError)) return null;

  switch (error.code) {
    case CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS:
      // Desde a FEAT-0005 v1.2 a edição é criada sob demanda, então isto
      // significa DEFEITO, não falta de cadastro. Não peça uma ação que o
      // usuário não tem como executar — diga a quem avisar.
      return {
        title: "O painel está indisponível no momento.",
        description:
          "Não foi possível determinar o processo seletivo corrente. Avise quem administra o sistema.",
      };

    case AuthErrorCode.INSUFFICIENT_ROLE:
      return {
        title: "Você não tem acesso a esta tela.",
        description: "Se acredita que deveria ter, fale com quem administra o sistema.",
      };

    case "MAINTENANCE_MODE":
      // A mensagem do backend passa como está: é ela que sabe o motivo e a
      // previsão, não o front.
      return { title: "Painel em manutenção.", description: error.message };

    default:
      return null;
  }
}

export function isApiErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
