"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { MejStepSchema, type MejStep } from "shared";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";

import { useRegistration } from "../_context/registration-context";
import { useWizardGuard } from "../_hooks/use-wizard-guard";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

const MEJ_VIDEO_URL = process.env.NEXT_PUBLIC_MEJ_VIDEO_URL;

/** Etapa 3 — Movimento EJ (FEAT-0001-UI v2.0, seção 4.3). */
export function MejStepForm() {
  const router = useRouter();
  const { answers, setStepData } = useRegistration();
  const isHydrated = useWizardGuard(3);

  const form = useForm<MejStep>({
    resolver: zodResolver(MejStepSchema),
    values: { mejAcknowledged: answers.mejAcknowledged ?? false },
  });

  if (!isHydrated) return null;

  function onSubmit(data: MejStep) {
    setStepData(data);
    router.push(WIZARD_STEPS[3].path);
  }

  return (
    <WizardShell current={3} title="Sobre o MEJ">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          {MEJ_VIDEO_URL && (
            <div className="aspect-video w-full overflow-hidden rounded-lg border">
              <iframe
                src={MEJ_VIDEO_URL}
                title="Vídeo institucional sobre o Movimento Empresa Júnior"
                className="h-full w-full"
                allowFullScreen
              />
            </div>
          )}

          <p className="text-muted-foreground text-sm">
            O Movimento Empresa Júnior (MEJ) tem como propósito formar líderes empreendedores,
            comprometidos e capazes de transformar o Brasil. Através da vivência empresarial, os
            jovens adquirem experiência prática e desenvolvem competências essenciais para o
            mercado de trabalho.
          </p>

          <Field data-invalid={!!form.formState.errors.mejAcknowledged} orientation="horizontal">
            <Controller
              control={form.control}
              name="mejAcknowledged"
              render={({ field }) => (
                <Checkbox
                  id="mejAcknowledged"
                  checked={field.value}
                  onCheckedChange={(checked: boolean | "indeterminate") => field.onChange(checked === true)}
                  aria-invalid={!!form.formState.errors.mejAcknowledged}
                />
              )}
            />
            <Label htmlFor="mejAcknowledged" className="font-normal">
              Confirmo que assisti ao vídeo e compreendi o propósito do MEJ.
            </Label>
            <FieldError errors={[form.formState.errors.mejAcknowledged]} />
          </Field>
        </FieldGroup>

        <WizardNav onBack={() => router.push(WIZARD_STEPS[1].path)} submitLabel="Avançar" />
      </form>
    </WizardShell>
  );
}
