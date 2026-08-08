import type { Metadata } from "next";

import { SessionSummary } from "./session-summary";

export const metadata: Metadata = {
  title: "Painel | CIMATEC jr.",
};

export default function PainelPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <SessionSummary />
    </div>
  );
}
