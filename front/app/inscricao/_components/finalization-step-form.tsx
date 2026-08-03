"use client";

import { useRouter } from "next/navigation";
import { PreRegisterRequestSchema } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useRegistration } from "../_context/registration-context";
import { usePreRegister } from "../_hooks/use-pre-register";
import { useWizardGuard } from "../_hooks/use-wizard-guard";
import { ApiError } from "../_lib/api-error";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

const WHATSAPP_GROUP_URL = process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL;

/**
 * Etapa 6 — Finalização (FEAT-0001-UI v2.0, seção 4.6). É aqui que o
 * payload acumulado das 6 etapas é enviado pela primeira vez ao backend
 * (`POST /candidate/pre-register`) — nenhuma etapa anterior chama a API.
 */
export function FinalizationStepForm() {
  const router = useRouter();
  const { answers, setPending } = useRegistration();
  const isHydrated = useWizardGuard(6);
  const preRegister = usePreRegister();

  if (!isHydrated) return null;

  // E1/E2/E3/E4 (FEAT-0001-UI v2.0, seção 7): erro de dados capturados na
  // etapa 1, só detectado aqui porque é o único ponto de submissão. As
  // respostas do wizard continuam em `answers`/sessionStorage — não há
  // `reset()` aqui, só navegação de volta para o candidato corrigir.
  const fieldError =
    preRegister.error instanceof ApiError && preRegister.error.field ? preRegister.error : null;
  const genericError =
    preRegister.error instanceof ApiError && !preRegister.error.field
      ? preRegister.error.message
      : preRegister.error && !(preRegister.error instanceof ApiError)
        ? "Não foi possível enviar sua inscrição. Tente novamente."
        : null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = PreRegisterRequestSchema.safeParse(answers);
    if (!parsed.success) {
      // Defensivo: o guard de navegação já deveria impedir chegar aqui incompleto.
      router.replace("/inscricao");
      return;
    }

    preRegister.mutate(parsed.data, {
      onSuccess: (response) => {
        setPending(response.data);
        router.push("/inscricao/verificar");
      },
    });
  }

  return (
    <WizardShell current={6} title="Finalização da Inscrição!">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          {fieldError && (
            <Alert variant="destructive">
              <AlertDescription>
                {fieldError.message}{" "}
                <button
                  type="button"
                  onClick={() => router.push(WIZARD_STEPS[0].path)}
                  className="underline underline-offset-4"
                >
                  Voltar para corrigir
                </button>
              </AlertDescription>
            </Alert>
          )}

          {genericError && (
            <Alert variant="destructive">
              <AlertDescription>{genericError}</AlertDescription>
            </Alert>
          )}

          <p className="text-muted-foreground text-sm">
            Para concluir sua inscrição, traga 1kg de alimento não perecível no dia da seleção.
          </p>

          {WHATSAPP_GROUP_URL && (
            <a
              href={WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
            >
              Entrar no grupo do WhatsApp
            </a>
          )}
        </div>

        <WizardNav
          onBack={() => router.push(WIZARD_STEPS[4].path)}
          submitLabel="Enviar Inscrição"
          isSubmitting={preRegister.isPending}
        />
      </form>
    </WizardShell>
  );
}
