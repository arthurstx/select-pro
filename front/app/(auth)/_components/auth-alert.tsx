import { CircleAlertIcon, CircleCheckBigIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";

import type { AuthErrorView } from "../_lib/auth-error-view";

/**
 * Erro no nível do formulário. Recebe a view já resolvida por
 * `auth-error-view.ts` — a copy e a decisão de oferecer (ou não) uma saída
 * moram lá, junto da regra da seção 7.
 */
export function AuthErrorAlert({ view }: { view: AuthErrorView }) {
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5 mb-6">
      <CircleAlertIcon />
      <AlertDescription>
        <p>{view.message}</p>
        {view.action && (
          <Link
            href={view.action.href}
            className="text-destructive font-medium underline underline-offset-4"
          >
            {view.action.label}
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Aviso positivo — usado pelos recados que uma tela deixa para a seguinte. */
export function AuthNoticeAlert({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="border-success/30 bg-success/5 text-success mb-6">
      <CircleCheckBigIcon />
      <AlertDescription className="text-foreground">{children}</AlertDescription>
    </Alert>
  );
}
