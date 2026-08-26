"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  CRITERION_LABELS,
  SubmitEvaluationSchema,
  type EvaluationCriterion,
  type MyGroupCandidate,
  type SubmitEvaluationDTO,
} from "shared";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSubmitEvaluationMutation } from "@/lib/evaluation/queries";

const CRITERIA_ORDER: EvaluationCriterion[] = [
  "raciocinio_logico",
  "trabalho_equipe",
  "lideranca",
  "proatividade",
  "comunicacao",
];

const COLOR_OPTIONS = [
  { value: "GREEN", label: "Verde", className: "border-success/40 text-success has-[[data-state=checked]]:bg-success/10" },
  { value: "YELLOW", label: "Amarelo", className: "border-amber-500/40 text-amber-600 has-[[data-state=checked]]:bg-amber-500/10" },
  { value: "RED", label: "Vermelho", className: "border-destructive/40 text-destructive has-[[data-state=checked]]:bg-destructive/10" },
] as const;

interface EvaluationFormProps {
  candidate: MyGroupCandidate;
  onSaved: () => void;
}

/** FR-002 — 5 notas (0-5) + 1 cor geral + comentário opcional. Pré-preenchido quando `myEvaluation` já existe (FR-004). */
export function EvaluationForm({ candidate, onSaved }: EvaluationFormProps) {
  const submit = useSubmitEvaluationMutation();

  const form = useForm<SubmitEvaluationDTO>({
    resolver: zodResolver(SubmitEvaluationSchema),
    defaultValues: candidate.myEvaluation
      ? {
          scores: candidate.myEvaluation.scores,
          overallColor: candidate.myEvaluation.overallColor,
          feedback: candidate.myEvaluation.feedback ?? undefined,
        }
      : {
          scores: { raciocinio_logico: 0, trabalho_equipe: 0, lideranca: 0, proatividade: 0, comunicacao: 0 },
          overallColor: "YELLOW",
        },
  });

  function onSubmit(values: SubmitEvaluationDTO) {
    submit.mutate(
      { candidateId: candidate.id, payload: values },
      {
        onSuccess: () => {
          toast.success(`Avaliação de ${candidate.name} salva.`);
          onSaved();
        },
        onError: () => toast.error("Não foi possível salvar a avaliação."),
      },
    );
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="gap-4">
        {CRITERIA_ORDER.map((criterion) => (
          <Field key={criterion} data-invalid={!!form.formState.errors.scores?.[criterion]}>
            <FieldLabel htmlFor={`score-${criterion}`}>{CRITERION_LABELS[criterion]}</FieldLabel>
            <input
              id={`score-${criterion}`}
              type="number"
              min={0}
              max={5}
              className="border-input bg-background h-9 w-20 rounded-md border px-3 text-sm"
              aria-invalid={!!form.formState.errors.scores?.[criterion]}
              {...form.register(`scores.${criterion}`, { valueAsNumber: true })}
            />
            <FieldError errors={[form.formState.errors.scores?.[criterion]]} />
          </Field>
        ))}
      </FieldGroup>

      <Field>
        <FieldLabel>Cor geral da avaliação</FieldLabel>
        <Controller
          control={form.control}
          name="overallColor"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-3">
              {COLOR_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`color-${option.value}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
                    option.className,
                  )}
                >
                  <RadioGroupItem value={option.value} id={`color-${option.value}`} />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError errors={[form.formState.errors.overallColor]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="feedback">Comentário (opcional)</FieldLabel>
        <Textarea id="feedback" rows={3} {...form.register("feedback")} />
      </Field>

      <Button type="submit" disabled={submit.isPending} className="self-end">
        {submit.isPending ? <Spinner aria-hidden /> : null}
        {candidate.myEvaluation ? "Atualizar avaliação" : "Salvar avaliação"}
      </Button>
    </form>
  );
}
