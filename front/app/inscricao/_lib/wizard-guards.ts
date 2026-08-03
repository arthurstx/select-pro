import type { RegisterRequest } from "shared";

import type { WizardStepNumber } from "./wizard-steps";

/**
 * Verifica se as respostas de uma etapa específica já foram preenchidas.
 * Usado pelo guard de navegação (useWizardGuard) para impedir acesso direto
 * a uma etapa sem ter passado pelas anteriores (FEAT-0001-UI v3.0, seção 8).
 */
export function isStepComplete(answers: Partial<RegisterRequest>, step: WizardStepNumber): boolean {
  switch (step) {
    case 1:
      return Boolean(
        answers.name && answers.email && answers.phone && answers.course && answers.semester && answers.gender,
      );
    case 2:
      // Em "outros" a descrição livre é parte da resposta (FEAT-0001-UI v3.0,
      // seção 6) — sem ela a etapa não está completa.
      return Boolean(answers.referralSource) && (answers.referralSource !== "outros" || Boolean(answers.referralSourceOther));
    case 3:
      return answers.mejAcknowledged === true;
    case 4:
      return Boolean(answers.experience && answers.motivation);
    case 5:
      return Boolean(
        answers.saturdayRestriction !== undefined && answers.specialNeeds !== undefined && answers.ethnicity,
      );
    case 6:
      return true;
  }
}
