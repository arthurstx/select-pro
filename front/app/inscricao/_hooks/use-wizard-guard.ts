"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRegistration } from "../_context/registration-context";
import { isStepComplete } from "../_lib/wizard-guards";
import type { WizardStepNumber } from "../_lib/wizard-steps";

/** Redireciona para `/inscricao` se alguma etapa anterior a `step` não tiver sido preenchida. */
export function useWizardGuard(step: WizardStepNumber): boolean {
  const router = useRouter();
  const { answers, isHydrated, registered } = useRegistration();

  useEffect(() => {
    if (!isHydrated) return;
    // Inscrição já gravada: as respostas do wizard são descartadas de propósito.
    if (registered) return;

    for (let previous = 1; previous < step; previous++) {
      if (!isStepComplete(answers, previous as WizardStepNumber)) {
        router.replace("/inscricao");
        return;
      }
    }
  }, [isHydrated, registered, answers, step, router]);

  return isHydrated;
}
