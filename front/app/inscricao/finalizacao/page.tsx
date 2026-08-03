import type { Metadata } from "next";

import { FinalizationStepForm } from "../_components/finalization-step-form";

export const metadata: Metadata = {
  title: "Finalização | SelectPro CIMATEC jr.",
};

export default function FinalizacaoPage() {
  return <FinalizationStepForm />;
}
