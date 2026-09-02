import { CheckinErrorCode, GroupErrorCode } from "shared";

import { ApiError } from "@/lib/api/api-error";

/**
 * Traduz os códigos de erro de `preview`/`organize` (presencial e online) pra uma mensagem que
 * diz o que fazer, em vez do genérico "não foi possível calcular a simulação" — sem isso, um
 * `409 NO_ROOMS_AVAILABLE` (por exemplo) aparecia igual a qualquer outra falha, escondendo o
 * motivo real de quem está organizando.
 */
export function describeGroupOrganizeError(
  error: unknown,
  modality: "presencial" | "online",
  fallback: string,
): string {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.code) {
    case GroupErrorCode.NO_CANDIDATES_PRESENT:
      return modality === "presencial"
        ? "Nenhum candidato presencial fez check-in nesta edição ainda."
        : "Nenhum candidato online fez check-in nesta edição ainda.";
    case GroupErrorCode.NO_ROOMS_AVAILABLE:
      return "Não há nenhuma sala cadastrada — cadastre pelo menos uma sala pra organizar os grupos presenciais.";
    case CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS:
      return "Não foi possível determinar o processo seletivo corrente. Avise quem administra o sistema.";
    default:
      return fallback;
  }
}
