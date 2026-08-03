"use client";

import { useRouter } from "next/navigation";
import { RegisterRequestSchema } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useRegistration } from "../_context/registration-context";
import { useRegister } from "../_hooks/use-register";
import { useWizardGuard } from "../_hooks/use-wizard-guard";
import { ApiError } from "../_lib/api-error";
import { WIZARD_STEPS } from "../_lib/wizard-steps";
import { WizardNav } from "./wizard-nav";
import { WizardShell } from "./wizard-shell";

const WHATSAPP_GROUP_URL = process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL;

/**
 * Etapa 6 — Finalização (FEAT-0001-UI v3.0, seção 4.6). Único ponto de
 * submissão do wizard: `POST /candidate/register` grava a inscrição
 * definitiva e o candidato segue direto para a tela de sucesso.
 */
export function FinalizationStepForm() {
  const router = useRouter();
  const { answers, setRegistered, clearAnswers } = useRegistration();
  const isHydrated = useWizardGuard(6);
  const register = useRegister();

  if (!isHydrated) return null;

  // E1-E6 (FEAT-0001-UI v3.0, seção 7): erro de dados capturados em etapas
  // anteriores, só detectado aqui porque é o único ponto de submissão. As
  // respostas do wizard continuam em `answers`/sessionStorage — não há
  // `reset()` aqui, só navegação de volta para o candidato corrigir.
  const fieldError = register.error instanceof ApiError && register.error.field ? register.error : null;
  const genericError =
    register.error instanceof ApiError && !register.error.field
      ? register.error.message
      : register.error && !(register.error instanceof ApiError)
        ? "Não foi possível enviar sua inscrição. Tente novamente."
        : null;

  // Erro de origem ("Como conheceu") volta para a etapa 2; os demais campos
  // com erro vêm todos da etapa 1.
  const correctionStep = fieldError?.field === "referralSourceOther" ? WIZARD_STEPS[1] : WIZARD_STEPS[0];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = RegisterRequestSchema.safeParse(answers);
    if (!parsed.success) {
      // Defensivo: o guard de navegação já deveria impedir chegar aqui incompleto.
      router.replace("/inscricao");
      return;
    }

    register.mutate(parsed.data, {
      onSuccess: (response) => {
        setRegistered(response.data);
        // Inscrição gravada — as respostas do wizard não precisam mais ficar
        // no sessionStorage (FEAT-0001-UI v3.0, seção 4.6).
        clearAnswers();
        router.push("/inscricao/sucesso");
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
                  onClick={() => router.push(correctionStep.path)}
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
          isSubmitting={register.isPending}
        />
      </form>
    </WizardShell>
  );
}
