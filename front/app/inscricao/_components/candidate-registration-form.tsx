"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  COURSE_LABELS,
  CourseSchema,
  formatPhone,
  formatPhoneAsYouType,
  GENDER_LABELS,
  GenderSchema,
  PersonalDataStepSchema,
  type PersonalDataStep,
} from "shared";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useRegistration } from "../_context/registration-context";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

const SEMESTERS = Array.from({ length: 10 }, (_, i) => i + 1);

/** Etapa 1 — Dados Pessoais. */
export function CandidateRegistrationForm() {
  const router = useRouter();
  const { answers, setStepData } = useRegistration();

  const form = useForm<PersonalDataStep>({
    resolver: zodResolver(PersonalDataStepSchema),
    values: {
      name: answers.name ?? "",
      email: answers.email ?? "",
      // O que fica salvo é E.164; ao voltar para esta etapa o campo mostra o
      // formato nacional, igual ao que a pessoa digitou.
      phone: answers.phone ? formatPhone(answers.phone) : "",
      // "" nunca bate com nenhum SelectItem — mantém os Selects controlados desde o primeiro render.
      course: answers.course ?? ("" as PersonalDataStep["course"]),
      semester: answers.semester ?? ("" as unknown as PersonalDataStep["semester"]),
      gender: answers.gender ?? ("" as PersonalDataStep["gender"]),
    },
  });

  function onSubmit(data: PersonalDataStep) {
    setStepData(data);
    router.push(WIZARD_STEPS[1].path);
  }

  return (
    <WizardShell
      current={1}
      title="Inscrição no Processo Seletivo 2026.2"
      description="Preencha os dados abaixo para iniciar sua jornada na CIMATEC jr."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="name">Nome completo</FieldLabel>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={!!form.formState.errors.name}
              {...form.register("name")}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="email">E-mail institucional</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!form.formState.errors.email}
                {...form.register("email")}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.phone}>
              <FieldLabel htmlFor="phone">Telefone</FieldLabel>
              {/*
                `Controller` em vez de `register` porque o valor é reescrito a
                cada tecla pela máscara. O campo guarda o texto formatado; o
                schema converte para E.164 no submit.
              */}
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(71) 98888-7777"
                    autoComplete="tel"
                    aria-invalid={!!form.formState.errors.phone}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={formatPhoneAsYouType(field.value ?? "")}
                    onChange={(event) => field.onChange(formatPhoneAsYouType(event.target.value))}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.phone]} />
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field data-invalid={!!form.formState.errors.course}>
              <FieldLabel htmlFor="course">Curso</FieldLabel>
              <Controller
                control={form.control}
                name="course"
                render={({ field }) => (
                  <Select
                    value={field.value || ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="course"
                      aria-invalid={!!form.formState.errors.course}
                    >
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {CourseSchema.options.map((course) => (
                        <SelectItem key={course} value={course}>
                          {COURSE_LABELS[course]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.course]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.semester}>
              <FieldLabel htmlFor="semester">Semestre</FieldLabel>
              <Controller
                control={form.control}
                name="semester"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : ""}
                    onValueChange={(value: string) =>
                      field.onChange(Number(value))
                    }
                  >
                    <SelectTrigger
                      id="semester"
                      aria-invalid={!!form.formState.errors.semester}
                    >
                      <SelectValue placeholder="Semestre atual" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMESTERS.map((semester) => (
                        <SelectItem key={semester} value={String(semester)}>
                          {semester}º Semestre
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.semester]} />
            </Field>
          </div>

          <Field data-invalid={!!form.formState.errors.gender}>
            <FieldLabel htmlFor="gender">Gênero</FieldLabel>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <Select
                  value={field.value || ""}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="gender"
                    aria-invalid={!!form.formState.errors.gender}
                  >
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {GenderSchema.options.map((gender) => (
                      <SelectItem key={gender} value={gender}>
                        {GENDER_LABELS[gender]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[form.formState.errors.gender]} />
          </Field>

          <FieldDescription>
            Ao se inscrever, você concorda com o uso dos seus dados para fins
            do processo seletivo da CIMATEC jr.
          </FieldDescription>
        </FieldGroup>

        <WizardNav submitLabel="Avançar" />
      </form>
    </WizardShell>
  );
}
