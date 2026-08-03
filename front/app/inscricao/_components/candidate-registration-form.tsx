"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  CourseSchema,
  GenderSchema,
  PreRegisterRequestSchema,
  type PreRegisterRequest,
} from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";

import { ApiError } from "../_lib/api-error";
import { useRegistration } from "../_context/registration-context";
import { usePreRegister } from "../_hooks/use-pre-register";

const COURSE_LABELS: Record<(typeof CourseSchema.options)[number], string> = {
  "eng-comp": "Engenharia de Computação",
  "eng-civil": "Engenharia Civil",
  "eng-mecani": "Engenharia Mecânica",
  "eng-quimica": "Engenharia Química",
  "eng-prod": "Engenharia de Produção",
  "eng-automação": "Engenharia de Automação",
  "eng-eletri": "Engenharia Elétrica",
  arqui: "Arquitetura e Urbanismo",
};

const GENDER_LABELS: Record<(typeof GenderSchema.options)[number], string> = {
  mascu: "Masculino",
  fem: "Feminino",
  outro: "Outro",
};

const SEMESTERS = Array.from({ length: 10 }, (_, i) => i + 1);

export function CandidateRegistrationForm() {
  const router = useRouter();
  const { setPending } = useRegistration();
  const preRegister = usePreRegister();

  const form = useForm<PreRegisterRequest>({
    resolver: zodResolver(PreRegisterRequestSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      // Selects do Radix precisam de um valor definido desde o primeiro
      // render (string vazia = "nada selecionado") para não alternar de
      // não-controlado para controlado — "" nunca bate com nenhum
      // SelectItem, então o placeholder continua visível até a escolha.
      course: "" as PreRegisterRequest["course"],
      semester: "" as unknown as PreRegisterRequest["semester"],
      gender: "" as PreRegisterRequest["gender"],
    },
  });

  const genericError =
    preRegister.error instanceof ApiError && !preRegister.error.field
      ? preRegister.error.message
      : null;

  function onSubmit(data: PreRegisterRequest) {
    preRegister.mutate(data, {
      onSuccess: (response) => {
        setPending(response.data);
        router.push("/inscricao/verificar");
      },
      onError: (error) => {
        if (error instanceof ApiError && error.field === "email") {
          form.setError("email", { message: error.message });
        }
        if (error instanceof ApiError && error.field === "phone") {
          form.setError("phone", { message: error.message });
        }
      },
    });
  }

  return (
    <div className="w-full bg-white p-2 max-sm:py-5 md:p-20 rounded-2xl border border-t-5 shadow-2xl border-red-600 max-w-md sm:max-w-2xl">
      <div className="mb-8 text-center ">
        <p className="text-primary font-heading text-sm md:text-xl font-semibold tracking-wide uppercase">
          SelectPro CIMATEC Jr.
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold text-balance sm:text-3xl">
          Inscrição no Processo Seletivo
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Preencha os dados abaixo para iniciar sua jornada na CIMATEC Jr.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          {genericError && (
            <Alert variant="destructive">
              <AlertDescription>{genericError}</AlertDescription>
            </Alert>
          )}

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
              <Input
                id="phone"
                type="tel"
                placeholder="(71) 98888-7777"
                autoComplete="tel"
                aria-invalid={!!form.formState.errors.phone}
                {...form.register("phone")}
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

          <Field>
            <Button type="submit" size="lg" disabled={preRegister.isPending}>
              {preRegister.isPending && <Spinner data-icon="inline-start" />}
              Enviar inscrição
            </Button>
            <FieldDescription>
              Ao se inscrever, você concorda com o uso dos seus dados para fins
              do processo seletivo da CIMATEC Jr.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
