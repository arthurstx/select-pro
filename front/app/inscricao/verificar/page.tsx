"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRegistration } from "../_context/registration-context";
import { OtcVerificationForm } from "../_components/otc-verification-form";

export default function VerificarPage() {
  const router = useRouter();
  const { pending } = useRegistration();

  useEffect(() => {
    if (!pending) {
      router.replace("/inscricao");
    }
  }, [pending, router]);

  if (!pending) return null;

  return <OtcVerificationForm />;
}
