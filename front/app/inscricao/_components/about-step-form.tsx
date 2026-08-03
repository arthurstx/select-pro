"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { AboutStepSchema, type AboutStep } from "shared";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import { useRegistration } from "../_context/registration-context";
import { useWizardGuard } from "../_hooks/use-wizard-guard";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

const EXPERIENCE_MAX = 1000;
const MOTIVATION_MAX = 500;

/** Etapa 4 — Sobre você (FEAT-0001-UI v2.0, seção 4.4). Limites refletidos em contadores. */
export function AboutStepForm() {
  const router = useRouter();
  const { answers, setStepData } = useRegistration();
  const isHydrated = useWizardGuard(4);

  const form = useForm<AboutStep>({
    resolver: zodResolver(AboutStepSchema),
    values: { experience: answers.experience ?? "", motivation: answers.motivation ?? "" },
  });

  const experienceValue = useWatch({ control: form.control, name: "experience" }) ?? "";
  const motivationValue = useWatch({ control: form.control, name: "motivation" }) ?? "";

  if (!isHydrated) return null;

  function onSubmit(data: AboutStep) {
    setStepData(data);
    router.push(WIZARD_STEPS[4].path);
  }

  return (
    <WizardShell current={4} title="Sobre você">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.experience}>
            <FieldLabel htmlFor="experience">Fale um pouco sobre suas experiências, hard e soft skills</FieldLabel>
            <Textarea
              id="experience"
              rows={4}
              placeholder="Descreva suas vivências..."
              maxLength={EXPERIENCE_MAX}
              aria-invalid={!!form.formState.errors.experience}
              {...form.register("experience")}
            />
            <div className="text-muted-foreground text-right text-xs">
              {experienceValue.length} / {EXPERIENCE_MAX}
            </div>
            <FieldError errors={[form.formState.errors.experience]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.motivation}>
            <FieldLabel htmlFor="motivation">Por que você acha que deve fazer parte da CIMATEC Jr.</FieldLabel>
            <Textarea
              id="motivation"
              rows={4}
              placeholder="Conte-nos sua motivação..."
              maxLength={MOTIVATION_MAX}
              aria-invalid={!!form.formState.errors.motivation}
              {...form.register("motivation")}
            />
            <div className="text-muted-foreground text-right text-xs">
              {motivationValue.length} / {MOTIVATION_MAX}
            </div>
            <FieldError errors={[form.formState.errors.motivation]} />
          </Field>
        </FieldGroup>

        <WizardNav onBack={() => router.push(WIZARD_STEPS[2].path)} submitLabel="Avançar" />
      </form>
    </WizardShell>
  );
}
