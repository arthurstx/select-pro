"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ReferralSourceSchema, ReferralStepSchema, type ReferralStep } from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

const OTHER_MAX = 100;

/** Etapa 2 — Como conheceu o processo seletivo (FEAT-0001-UI v3.0, seção 4.2). */
export function ReferralStepForm() {
  const router = useRouter();
  const { answers, setStepData } = useRegistration();
  const isHydrated = useWizardGuard(2);

  const form = useForm<ReferralStep>({
    resolver: zodResolver(ReferralStepSchema),
    values: {
      referralSource: answers.referralSource ?? ("" as ReferralStep["referralSource"]),
      referralSourceOther: answers.referralSourceOther ?? "",
    },
  });

  const referralSource = useWatch({ control: form.control, name: "referralSource" });
  const isOther = referralSource === "outros";

  if (!isHydrated) return null;

  function onSubmit(data: ReferralStep) {
    // A descrição só acompanha a origem "outros" (FEAT-0001-UI v3.0, seção 4.2) —
    // trocar de opção não pode deixar um texto órfão no estado do wizard.
    setStepData({
      referralSource: data.referralSource,
      referralSourceOther: data.referralSource === "outros" ? data.referralSourceOther : undefined,
    });
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
                <RadioGroup
                  value={field.value || ""}
                  onValueChange={(value: string) => {
                    field.onChange(value);
                    // Sair de "Outros" limpa o texto — evita reenviá-lo junto de
                    // outra origem e evita um erro de validação preso num campo
                    // que não está mais visível.
                    if (value !== "outros") {
                      form.setValue("referralSourceOther", "");
                      form.clearErrors("referralSourceOther");
                    }
                  }}
                >
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

          {isOther && (
            <Field data-invalid={!!form.formState.errors.referralSourceOther}>
              <FieldLabel htmlFor="referralSourceOther">Conte pra gente: como você conheceu?</FieldLabel>
              <Input
                id="referralSourceOther"
                placeholder="Ex.: cartaz no mural, feira de profissões, professor..."
                maxLength={OTHER_MAX}
                autoComplete="off"
                aria-invalid={!!form.formState.errors.referralSourceOther}
                {...form.register("referralSourceOther")}
              />
              <FieldError errors={[form.formState.errors.referralSourceOther]} />
            </Field>
          )}
        </FieldGroup>

        <WizardNav onBack={() => router.push(WIZARD_STEPS[0].path)} submitLabel="Avançar" />
      </form>
    </WizardShell>
  );
}
