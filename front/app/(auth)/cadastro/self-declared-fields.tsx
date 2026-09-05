"use client";

import { Controller, type Control, type FieldErrors } from "react-hook-form";
import {
  COURSE_LABELS,
  CourseSchema,
  ETHNICITY_LABELS,
  EthnicitySchema,
  formatPhoneAsYouType,
  GENDER_LABELS,
  GenderSchema,
  SemesterSchema,
} from "shared";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { RegisterFormValues } from "../_lib/auth-form-schemas";
import { AuthSelect } from "../_components/auth-select";

const COURSE_OPTIONS = CourseSchema.options.map((course) => ({ value: course, label: COURSE_LABELS[course] }));
/**
 * `SemesterSchema` é um `z.union` de `z.literal`s, não um `z.enum` — seu
 * `.options` devolve os schemas literais (`ZodLiteral`), não os números
 * (diferente de `CourseSchema`/`GenderSchema`/`EthnicitySchema`, que são
 * `z.enum` e cujo `.options` já é o array de valores). Sem o `.value`, o
 * dropdown mostrava "[object Object]º Semestre".
 */
const SEMESTER_OPTIONS = SemesterSchema.options.map((option) => ({
  value: String(option.value),
  label: `${option.value}º Semestre`,
}));
const GENDER_OPTIONS = GenderSchema.options.map((gender) => ({ value: gender, label: GENDER_LABELS[gender] }));
const ETHNICITY_OPTIONS = EthnicitySchema.options.map((ethnicity) => ({
  value: ethnicity,
  label: ETHNICITY_LABELS[ethnicity],
}));

/**
 * Campos que só aparecem quando a trilha escolhida é Trainee/Pós-júnior
 * (FEAT-0008, emenda 2026-09-04) — a Supabase não tem mais esses dois
 * status, então a própria pessoa preenche o que antes vinha de lá. Sem
 * data de nascimento, de propósito (decisão do plano — não é pedida).
 * Co-localizado em `cadastro/`, não em `_components/`, porque é específico
 * desta tela.
 */
export function SelfDeclaredFields({
  control,
  errors,
}: {
  control: Control<RegisterFormValues>;
  errors: FieldErrors<RegisterFormValues>;
}) {
  return (
    <>
      <Field data-invalid={!!errors.fullName}>
        <FieldLabel htmlFor="fullName">Nome completo</FieldLabel>
        <Controller
          control={control}
          name="fullName"
          render={({ field }) => (
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <FieldError errors={[errors.fullName]} />
      </Field>

      <Field data-invalid={!!errors.phone}>
        <FieldLabel htmlFor="phone">Telefone</FieldLabel>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              placeholder="(71) 98888-7777"
              autoComplete="tel"
              aria-invalid={!!errors.phone}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={formatPhoneAsYouType(field.value ?? "")}
              onChange={(event) => field.onChange(formatPhoneAsYouType(event.target.value))}
            />
          )}
        />
        <FieldError errors={[errors.phone]} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field data-invalid={!!errors.course}>
          <FieldLabel htmlFor="course">Curso</FieldLabel>
          <Controller
            control={control}
            name="course"
            render={({ field }) => (
              <AuthSelect
                id="course"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                placeholder="Selecionar"
                options={COURSE_OPTIONS}
                aria-invalid={!!errors.course}
              />
            )}
          />
          <FieldError errors={[errors.course]} />
        </Field>

        <Field data-invalid={!!errors.semester}>
          <FieldLabel htmlFor="semester">Semestre</FieldLabel>
          <Controller
            control={control}
            name="semester"
            render={({ field }) => (
              <AuthSelect
                id="semester"
                value={field.value ? String(field.value) : ""}
                onValueChange={(value) => field.onChange(Number(value))}
                placeholder="Semestre atual"
                options={SEMESTER_OPTIONS}
                aria-invalid={!!errors.semester}
              />
            )}
          />
          <FieldError errors={[errors.semester]} />
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field data-invalid={!!errors.gender}>
          <FieldLabel htmlFor="gender">Gênero</FieldLabel>
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <AuthSelect
                id="gender"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                placeholder="Selecione"
                options={GENDER_OPTIONS}
                aria-invalid={!!errors.gender}
              />
            )}
          />
          <FieldError errors={[errors.gender]} />
        </Field>

        <Field data-invalid={!!errors.ethnicity}>
          <FieldLabel htmlFor="ethnicity">Etnia</FieldLabel>
          <Controller
            control={control}
            name="ethnicity"
            render={({ field }) => (
              <AuthSelect
                id="ethnicity"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                placeholder="Selecione"
                options={ETHNICITY_OPTIONS}
                aria-invalid={!!errors.ethnicity}
              />
            )}
          />
          <FieldError errors={[errors.ethnicity]} />
        </Field>
      </div>
    </>
  );
}
