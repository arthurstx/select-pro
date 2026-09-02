import type { RegisterRequest } from "shared";

import type { WizardStepNumber } from "./wizard-steps";

/** Verifica se as respostas de uma etapa específica já foram preenchidas. */
export function isStepComplete(answers: Partial<RegisterRequest>, step: WizardStepNumber): boolean {
  switch (step) {
    case 1:
      return Boolean(
        answers.name && answers.email && answers.phone && answers.course && answers.semester && answers.gender,
      );
    case 2:
      return Boolean(answers.referralSource) && (answers.referralSource !== "outros" || Boolean(answers.referralSourceOther));
    case 3:
      return answers.mejAcknowledged === true;
    case 4:
      return Boolean(answers.experience && answers.motivation);
    case 5:
      return Boolean(
        answers.saturdayRestriction !== undefined &&
          answers.specialNeeds !== undefined &&
          (!answers.specialNeeds || Boolean(answers.specialNeedsDescription)) &&
          answers.ethnicity,
      );
    case 6:
      return true;
  }
}
