"use client";

import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { isInvertedDateRange } from "shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { formatDate, todayAsInputValue } from "../_lib/format";

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onApply: (range: DateRange) => void;
}

/**
 * `<input type="date">` nativo dentro do popover, e não `react-day-picker`:
 * dois campos não justificam a dependência — mesma linha de raciocínio da
 * decisão sobre o peso da `libphonenumber-js` na FEAT-0006, e aqui o ganho
 * seria ainda menor (FEAT-0007-UI, seção 12).
 */
export function DateRangeFilter({ value, onApply }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);

  // O rascunho volta ao filtro aplicado na ABERTURA, e não num efeito que
  // observe `open`: fechar sem aplicar não pode deixar meia data pendurada
  // para a próxima vez, e sincronizar isso por efeito custaria um render a
  // mais para chegar no mesmo lugar.
  function handleOpenChange(next: boolean) {
    if (next) setDraft(value);
    setOpen(next);
  }

  // A mesma regra que o backend aplica (E4), importada de `shared` em vez de
  // reescrita — aqui ela IMPEDE aplicar, em vez de deixar a API responder 400.
  const inverted = isInvertedDateRange({ from: draft.from || undefined, to: draft.to || undefined });
  const active = value.from !== "" || value.to !== "";

  function handleApply() {
    if (inverted) return;
    onApply(draft);
    setOpen(false);
  }

  function handleClear() {
    setDraft({ from: "", to: "" });
    onApply({ from: "", to: "" });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="justify-start gap-2">
          <CalendarIcon className="size-4" aria-hidden />
          {active ? describeRange(value) : "Data de inscrição"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date-from">De</Label>
            <Input
              id="date-from"
              type="date"
              max={todayAsInputValue()}
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date-to">Até</Label>
            <Input
              id="date-to"
              type="date"
              max={todayAsInputValue()}
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              aria-invalid={inverted}
              aria-describedby={inverted ? "date-range-error" : undefined}
            />
          </div>

          {inverted && (
            <p id="date-range-error" role="alert" className="text-destructive text-sm">
              A data final não pode ser anterior à inicial.
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={!active && !draft.from && !draft.to}>
              <XIcon className="size-4" aria-hidden />
              Limpar
            </Button>
            <Button type="button" size="sm" onClick={handleApply} disabled={inverted}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function describeRange({ from, to }: DateRange): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `A partir de ${formatDate(from)}`;

  return `Até ${formatDate(to)}`;
}
