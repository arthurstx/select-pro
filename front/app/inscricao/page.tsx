import type { Metadata } from "next";

import { CandidateRegistrationForm } from "./_components/candidate-registration-form";

export const metadata: Metadata = {
  title: "Inscrição | SelectPro CIMATEC Jr.",
};

export default function InscricaoPage() {
  return <CandidateRegistrationForm />;
}
