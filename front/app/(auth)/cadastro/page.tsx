import type { Metadata } from "next";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Criar Conta de Avaliador | CIMATEC jr.",
  description: "Crie sua conta de avaliador no portal de gestão técnica da CIMATEC jr.",
};

export default function CadastroPage() {
  return <RegisterForm />;
}
