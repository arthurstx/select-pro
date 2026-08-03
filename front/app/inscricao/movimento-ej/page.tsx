import type { Metadata } from "next";

import { MejStepForm } from "../_components/mej-step-form";

export const metadata: Metadata = {
  title: "Movimento EJ | SelectPro CIMATEC Jr.",
};

export default function MovimentoEjPage() {
  return <MejStepForm />;
}
