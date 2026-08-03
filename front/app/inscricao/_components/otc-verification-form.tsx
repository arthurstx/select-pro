"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { OtcCodeSchema } from "shared";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";

import { ApiError } from "../_lib/api-error";
import { useRegistration } from "../_context/registration-context";
import { useConfirmOtc } from "../_hooks/use-confirm-otc";
import { RegistrationBlocked } from "./registration-blocked";

const VerifyCodeSchema = z.object({ code: OtcCodeSchema });
type VerifyCodeData = z.infer<typeof VerifyCodeSchema>;

const BLOCKED_STATUSES = new Set([409, 410, 429]);

export function OtcVerificationForm() {
  const router = useRouter();
  const { pending, setConfirmed, reset } = useRegistration();
  const confirmOtcMutation = useConfirmOtc();
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const form = useForm<VerifyCodeData>({
    resolver: zodResolver(VerifyCodeSchema),
    defaultValues: { code: "" },
  });

  if (!pending) return null;

  const genericError =
    confirmOtcMutation.error instanceof ApiError &&
    confirmOtcMutation.error.field !== "code"
      ? confirmOtcMutation.error.message
      : confirmOtcMutation.error &&
          !(confirmOtcMutation.error instanceof ApiError)
        ? "Não foi possível verificar o código. Tente novamente."
        : null;

  function onSubmit(data: VerifyCodeData) {
    if (!pending) return;

    confirmOtcMutation.mutate(
      { pendingId: pending.pendingId, code: data.code },
      {
        onSuccess: (response) => {
          setConfirmed(response.data);
          router.push("/inscricao/sucesso");
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            if (BLOCKED_STATUSES.has(error.status)) {
              setBlockedMessage(error.message);
              return;
            }
            if (error.field === "code") {
              form.setError("code", { message: error.message });
            }
          }
        },
      },
    );
  }

  function handleRestart() {
    reset();
    router.push("/inscricao");
  }

  if (blockedMessage) {
    return <RegistrationBlocked message={blockedMessage} />;
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="font-heading text-2xl font-semibold">
          Verificar Código
        </h1>
        <p className="text-muted-foreground mt-2 text-sm text-balance">
          Insira o código de 6 dígitos enviado para o seu e-mail institucional.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="flex ">
          {genericError && (
            <Alert variant="destructive">
              <AlertDescription>{genericError}</AlertDescription>
            </Alert>
          )}

          <Field
            data-invalid={!!form.formState.errors.code}
            className="items-center"
          >
            <FieldLabel htmlFor="code" className="sr-only">
              Código de verificação
            </FieldLabel>
            <Controller
              control={form.control}
              name="code"
              render={({ field }) => (
                <InputOTP
                  id="code"
                  maxLength={6}
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={!!form.formState.errors.code}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              )}
            />
            <FieldError
              className="text-center"
              errors={[form.formState.errors.code]}
            />
          </Field>

          <Field>
            <Button
              type="submit"
              size="lg"
              disabled={confirmOtcMutation.isPending}
            >
              {confirmOtcMutation.isPending && (
                <Spinner data-icon="inline-start" />
              )}
              Verificar
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <button
        type="button"
        onClick={handleRestart}
        className="text-muted-foreground hover:text-foreground mt-6 w-full text-center text-sm underline-offset-4 hover:underline"
      >
        Não recebeu o código? Reiniciar inscrição
      </button>
    </div>
  );
}
