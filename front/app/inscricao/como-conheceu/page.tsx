import type { Metadata } from "next";

import { ReferralStepForm } from "../_components/referral-step-form";

export const metadata: Metadata = {
  title: "Como conheceu | SelectPro CIMATEC jr.",
};

export default function ComoConheceuPage() {
  return <ReferralStepForm />;
}
