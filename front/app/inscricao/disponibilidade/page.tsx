import type { Metadata } from "next";

import { AvailabilityStepForm } from "../_components/availability-step-form";

export const metadata: Metadata = {
  title: "Disponibilidade | SelectPro CIMATEC jr.",
};

export default function DisponibilidadePage() {
  return <AvailabilityStepForm />;
}
