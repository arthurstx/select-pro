"use client";

import { CircleAlertIcon } from "lucide-react";
import {
  COURSE_LABELS,
  ETHNICITY_LABELS,
  GENDER_LABELS,
  REFERRAL_SOURCE_LABELS,
  formatPhone,
  type CandidateDetailResponse,
} from "shared";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { formatDateTime, semesterLabel } from "../_lib/format";

type Detail = CandidateDetailResponse["data"];

interface CandidateDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome já conhecido pela linha da tabela — o cabeçalho não precisa esperar a requisição. */
  fallbackName: string;
  detail: Detail | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * Somente leitura. Não há "Editar" nem "Avançar Fase": a inscrição não é
 * editável (FEAT-0001, seção 7) e não existe máquina de estados de candidato
 * no schema — o mockup sugeriu as duas coisas, e nenhuma existe.
 */
export function CandidateDetailSheet({
  open,
  onOpenChange,
  fallbackName,
  detail,
  isPending,
  isError,
  onRetry,
}: CandidateDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{detail?.name ?? fallbackName}</SheetTitle>
          <SheetDescription>
            {detail
              ? `Inscrição de ${formatDateTime(detail.createdAt)} · ${detail.process.label}`
              : "Carregando a inscrição…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-8">
          {/* O erro fica DENTRO do painel — a tabela atrás não é afetada. */}
          {isError && !detail ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CircleAlertIcon className="text-destructive size-8" aria-hidden />
              <div>
                <p className="font-medium">Não foi possível carregar a inscrição.</p>
                <p className="text-muted-foreground mt-1 text-sm">Verifique sua conexão e tente novamente.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Tentar novamente
              </Button>
            </div>
          ) : isPending || !detail ? (
            <DetailSkeleton />
          ) : (
            <>
              <Section title="Contato">
                <Field label="E-mail" value={detail.email} />
                <Field label="Telefone" value={formatPhone(detail.phone)} />
              </Section>

              <Section title="Dados acadêmicos">
                <Field label="Curso" value={COURSE_LABELS[detail.course]} />
                <Field label="Semestre" value={semesterLabel(detail.semester)} />
              </Section>

              <Section title="Questionário">
                <Field
                  label="Como conheceu a CIMATEC jr."
                  value={
                    detail.application.referralSourceOther
                      ? `${REFERRAL_SOURCE_LABELS[detail.application.referralSource]} — ${detail.application.referralSourceOther}`
                      : REFERRAL_SOURCE_LABELS[detail.application.referralSource]
                  }
                />
                <Field
                  label="Restrição aos sábados"
                  value={detail.application.saturdayRestriction ? "Sim" : "Não"}
                />
                {/* Mesmo rótulo do card de métricas — "PNE" não é usado no produto. */}
                <Field
                  label="Com necessidade especial"
                  value={detail.application.specialNeeds ? "Sim" : "Não"}
                />
              </Section>

              {/* Só aparece quando specialNeeds é true (FEAT-0014) — sem campo vazio nem
                  placeholder quando é false. `whitespace-pre-line` preserva as quebras
                  digitadas, mesmo padrão de "Experiências"/"Motivação" abaixo. Candidatos
                  legados (specialNeeds=true sem descrição gravada) mostram "Não informado"
                  em vez de texto em branco (FR-007). */}
              {detail.application.specialNeeds && (
                <Section title="Descrição da necessidade especial">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {detail.application.specialNeedsDescription ?? (
                      <span className="text-muted-foreground italic">Não informado</span>
                    )}
                  </p>
                </Section>
              )}

              {/* Os textos saem na íntegra, sem truncar: é o que o avaliador
                  abre o painel para ler. `whitespace-pre-line` preserva as
                  quebras que a pessoa digitou. */}
              <Section title="Experiências">
                <p className="text-sm leading-relaxed whitespace-pre-line">{detail.application.experience}</p>
              </Section>

              <Section title="Motivação">
                <p className="text-sm leading-relaxed whitespace-pre-line">{detail.application.motivation}</p>
              </Section>

              {/*
                Renderiza porque o dado VEIO, não porque o papel é admin — o
                componente não conhece papéis (FEAT-0007-UI, seção 8).
              */}
              {detail.demographics && (
                <Section title="Demografia">
                  <Field label="Gênero" value={GENDER_LABELS[detail.demographics.gender]} />
                  <Field label="Etnia" value={ETHNICITY_LABELS[detail.demographics.ethnicity]} />
                </Section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium break-words">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
