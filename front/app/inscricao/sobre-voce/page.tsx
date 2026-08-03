import type { Metadata } from "next";

import { AboutStepForm } from "../_components/about-step-form";

export const metadata: Metadata = {
  title: "Sobre você | SelectPro CIMATEC Jr.",
};

export default function SobreVocePage() {
  return <AboutStepForm />;
}
