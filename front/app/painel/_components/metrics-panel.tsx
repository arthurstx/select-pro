"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { AccessibilityIcon, CalendarOffIcon, GraduationCapIcon, InboxIcon, UsersIcon } from "lucide-react";
import {
  COURSE_LABELS,
  ETHNICITY_LABELS,
  GENDER_LABELS,
  REFERRAL_SOURCE_LABELS,
  type Course,
  type DashboardMetricsResponse,
  type Ethnicity,
  type Gender,
  type ReferralSource,
} from "shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { DistributionChart } from "./distribution-chart";
import { LoadErrorState, StateMessage } from "./state-message";

type Metrics = DashboardMetricsResponse["data"];

interface MetricsPanelProps {
  query: UseQueryResult<Metrics, Error>;
}

export function MetricsPanel({ query }: MetricsPanelProps) {
  const { data, isPending, isError, refetch } = query;

  if (isPending) return <MetricsSkeleton />;
  if (isError && !data) return <LoadErrorState what="as métricas" onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <section className="flex flex-col gap-6" aria-label="Métricas das inscrições">
      <SummaryCards totals={data.totals} />

      {data.totals.candidates === 0 ? (
        // Nada de gráficos zerados: eles não dizem "não há inscrições", dizem
        // "todo mundo marcou zero" (FEAT-0007-UI, seção 5).
        <StateMessage
          icon={<InboxIcon className="text-muted-foreground size-8" aria-hidden />}
          title="Nenhuma inscrição nesta edição ainda."
          description="Assim que alguém se inscrever, os números e a lista aparecem aqui."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Inscritos por curso">
            <DistributionChart
              items={data.byCourse}
              labelOf={(key) => COURSE_LABELS[key as Course] ?? String(key)}
              horizontal
            />
          </ChartCard>

          <ChartCard title="Inscritos por semestre">
            <DistributionChart items={data.bySemester} labelOf={(key) => `${key}º`} />
          </ChartCard>

          <ChartCard title="Como conheceram a CIMATEC jr.">
            <DistributionChart
              items={data.byReferralSource}
              labelOf={(key) => REFERRAL_SOURCE_LABELS[key as ReferralSource] ?? String(key)}
              horizontal
            />
          </ChartCard>

          {/*
            A seção só existe se o dado veio. NÃO há `if (role === "admin")`
            aqui — o componente reage à forma do payload, e a regra de papéis
            mora num lugar só, no backend (FEAT-0007-UI, seção 8).
          */}
          {data.byGender && (
            <ChartCard title="Gênero">
              <DistributionChart
                items={data.byGender}
                labelOf={(key) => GENDER_LABELS[key as Gender] ?? String(key)}
              />
            </ChartCard>
          )}

          {data.byEthnicity && (
            <ChartCard title="Etnia">
              <DistributionChart
                items={data.byEthnicity}
                labelOf={(key) => ETHNICITY_LABELS[key as Ethnicity] ?? String(key)}
                horizontal
              />
            </ChartCard>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryCards({ totals }: { totals: Metrics["totals"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={<UsersIcon className="size-4" aria-hidden />}
        label="Inscritos"
        value={String(totals.candidates)}
      />
      <SummaryCard
        icon={<GraduationCapIcon className="size-4" aria-hidden />}
        label="Cursos representados"
        value={`${totals.coursesRepresented} de ${totals.coursesTotal}`}
      />
      <SummaryCard
        icon={<AccessibilityIcon className="size-4" aria-hidden />}
        // "PNE" não é usado no produto — o mesmo texto aqui e no detalhe.
        label="Com necessidade especial"
        value={String(totals.specialNeeds)}
      />
      <SummaryCard
        icon={<CalendarOffIcon className="size-4" aria-hidden />}
        label="Com restrição aos sábados"
        value={String(totals.saturdayRestriction)}
      />
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Títulos legíveis, corpo em skeleton — a tela não deve mudar de forma ao carregar. */
function MetricsSkeleton() {
  return (
    <section className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando métricas">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[110px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-[300px] w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}
