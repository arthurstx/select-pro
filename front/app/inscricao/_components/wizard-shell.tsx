import type { WizardStepNumber } from "../_lib/wizard-steps";
import { WizardStepper } from "./wizard-stepper";

interface WizardShellProps {
  current: WizardStepNumber;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** Card compartilhado pelas 6 etapas do wizard: borda superior, stepper e cabeçalho da etapa. */
export function WizardShell({ current, title, description, children }: WizardShellProps) {
  return (
    <div className="border-t-primary w-full max-w-md rounded-2xl border border-t-4 bg-white p-4 shadow-2xl sm:max-w-2xl sm:p-8 md:p-10">
      <WizardStepper current={current} />

      <div className="border-border mt-6 mb-6 border-t sm:mt-8 sm:mb-8" />

      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold text-balance sm:text-2xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 text-sm">{description}</p>}
      </div>

      {children}
    </div>
  );
}
