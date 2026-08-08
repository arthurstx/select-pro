"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  AvailabilityStepSchema,
  ETHNICITY_LABELS,
  EthnicitySchema,
  type AvailabilityStep,
} from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useRegistration } from "../_context/registration-context";
import { useWizardGuard } from "../_hooks/use-wizard-guard";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

function YesNoField({
  value,
  onChange,
  idPrefix,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  idPrefix: string;
}) {
  return (
    <RadioGroup
      className="flex flex-row gap-6"
      value={value === undefined ? "" : String(value)}
      onValueChange={(v: string) => onChange(v === "true")}
    >
      <Label htmlFor={`${idPrefix}-sim`} className="flex cursor-pointer items-center gap-2 font-normal">
        <RadioGroupItem value="true" id={`${idPrefix}-sim`} />
        Sim
      </Label>
      <Label htmlFor={`${idPrefix}-nao`} className="flex cursor-pointer items-center gap-2 font-normal">
        <RadioGroupItem value="false" id={`${idPrefix}-nao`} />
        Não
      </Label>
    </RadioGroup>
  );
}

/** Etapa 5 — Disponibilidade e Diversidade. */
export function AvailabilityStepForm() {
  const router = useRouter();
  const { answers, setStepData } = useRegistration();
  const isHydrated = useWizardGuard(5);

  const form = useForm<AvailabilityStep>({
    resolver: zodResolver(AvailabilityStepSchema),
    values: {
      saturdayRestriction: answers.saturdayRestriction as boolean,
      specialNeeds: answers.specialNeeds as boolean,
      ethnicity: answers.ethnicity ?? ("" as AvailabilityStep["ethnicity"]),
    },
  });

  if (!isHydrated) return null;

  function onSubmit(data: AvailabilityStep) {
    setStepData(data);
    router.push(WIZARD_STEPS[5].path);
  }

  return (
    <WizardShell current={5} title="Disponibilidade e Diversidade">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.saturdayRestriction}>
            <FieldLabel>Possui restrição em realizar o processo seletivo no sábado?</FieldLabel>
            <Controller
              control={form.control}
              name="saturdayRestriction"
              render={({ field }) => (
                <YesNoField value={field.value} onChange={field.onChange} idPrefix="saturday" />
              )}
            />
            <FieldError errors={[form.formState.errors.saturdayRestriction]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.specialNeeds}>
            <FieldLabel>Possui alguma necessidade especial?</FieldLabel>
            <Controller
              control={form.control}
              name="specialNeeds"
              render={({ field }) => (
                <YesNoField value={field.value} onChange={field.onChange} idPrefix="special-needs" />
              )}
            />
            <FieldError errors={[form.formState.errors.specialNeeds]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.ethnicity}>
            <FieldLabel htmlFor="ethnicity">Cor/Etnia</FieldLabel>
            <Controller
              control={form.control}
              name="ethnicity"
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger id="ethnicity" aria-invalid={!!form.formState.errors.ethnicity}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {EthnicitySchema.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ETHNICITY_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[form.formState.errors.ethnicity]} />
          </Field>
        </FieldGroup>

        <WizardNav onBack={() => router.push(WIZARD_STEPS[3].path)} submitLabel="Avançar" />
      </form>
    </WizardShell>
  );
}
