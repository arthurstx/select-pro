import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar Acesso | CIMATEC jr.",
  description: "Receba um link para redefinir a senha da sua conta.",
};

export default function RecuperarSenhaPage() {
  return <ForgotPasswordForm />;
}
