import type { Metadata } from "next";

import { CandidateRegistrationForm } from "./_components/candidate-registration-form";

export const metadata: Metadata = {
  title: "Inscrição | SelectPro CIMATEC jr.",
};

export default function InscricaoPage() {
  return <CandidateRegistrationForm />;
}
