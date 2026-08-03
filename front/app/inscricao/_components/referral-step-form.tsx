"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { ReferralSourceSchema, ReferralStepSchema, type ReferralStep } from "shared";

import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { useRegistration } from "../_context/registration-context";
import { useWizardGuard } from "../_hooks/use-wizard-guard";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

const REFERRAL_LABELS: Record<(typeof ReferralSourceSchema.options)[number], string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  campus: "Campus (Presencial)",
  indicacao: "Indicação",
  outros: "Outros",
};

/** Etapa 2 — Como conheceu o processo seletivo (FEAT-0001-UI v2.0, seção 4.2). */
export function ReferralStepForm() {
  const router = useRouter();
  const { answers, setStepData } = useRegistration();
  const isHydrated = useWizardGuard(2);

  const form = useForm<ReferralStep>({
    resolver: zodResolver(ReferralStepSchema),
    values: { referralSource: answers.referralSource ?? ("" as ReferralStep["referralSource"]) },
  });

  if (!isHydrated) return null;

  function onSubmit(data: ReferralStep) {
    setStepData(data);
    router.push(WIZARD_STEPS[2].path);
  }

  return (
    <WizardShell current={2} title="Como conheceu o processo seletivo?">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.referralSource}>
            <Controller
              control={form.control}
              name="referralSource"
              render={({ field }) => (
                <RadioGroup value={field.value || ""} onValueChange={field.onChange}>
                  {ReferralSourceSchema.options.map((option) => (
                    <Label
                      key={option}
                      htmlFor={`referral-${option}`}
                      className="border-input has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm font-normal"
                    >
                      <RadioGroupItem value={option} id={`referral-${option}`} />
                      {REFERRAL_LABELS[option]}
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldError errors={[form.formState.errors.referralSource]} />
          </Field>
        </FieldGroup>

        <WizardNav onBack={() => router.push(WIZARD_STEPS[0].path)} submitLabel="Avançar" />
      </form>
    </WizardShell>
  );
}
