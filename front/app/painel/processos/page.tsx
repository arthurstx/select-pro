"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCogIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { UpdateSelectionProcessAdminSchema, type SelectionProcessAdminSummary, type UpdateSelectionProcessAdminDTO } from "shared";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api/api-error";
import { listSelectionProcesses, updateSelectionProcess } from "@/lib/selection-processes/selection-processes-api";

/**
 * Correção de processos seletivos (FEAT-0017). A criação continua
 * exclusivamente automática (`resolveCurrent()`, regra semestral fixa em
 * código) — esta tela só corrige `label`/`starts_at`/`ends_at` de uma edição
 * já existente, para quando ela nasce com dado errado (ex.: fuso na virada
 * do semestre) e a única saída hoje seria SQL direto no banco.
 */
export default function ProcessosSeletivosPage() {
  const [editing, setEditing] = useState<SelectionProcessAdminSummary | null>(null);

  const query = useQuery({ queryKey: ["selection-processes"], queryFn: listSelectionProcesses });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Processos seletivos
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Edições do processo seletivo já criadas. Corrija o rótulo ou a janela de datas de
          uma edição existente — não é possível criar ou excluir uma edição por aqui.
        </p>
      </div>

      {query.isPending && (
        <div className="flex items-center justify-center gap-3 py-16" aria-busy="true">
          <Spinner className="text-primary size-5" />
          <p className="text-muted-foreground text-sm">Carregando…</p>
        </div>
      )}

      {query.isError && (
        <p className="text-destructive text-sm" role="alert">
          Não foi possível carregar os processos seletivos. Tente novamente.
        </p>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <CalendarCogIcon className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground text-sm">Nenhum processo seletivo criado ainda.</p>
        </div>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="border-border overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rótulo</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((process) => (
                <TableRow key={process.id}>
                  <TableCell className="font-medium">{process.label}</TableCell>
                  <TableCell className="text-muted-foreground">{process.starts_at}</TableCell>
                  <TableCell className="text-muted-foreground">{process.ends_at}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(process)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SelectionProcessFormSheet
        open={editing !== null}
        process={editing}
        onOpenChange={(open) => setEditing(open ? editing : null)}
      />
    </div>
  );
}

function SelectionProcessFormSheet({
  open,
  process,
  onOpenChange,
}: {
  open: boolean;
  process: SelectionProcessAdminSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<UpdateSelectionProcessAdminDTO>({
    resolver: zodResolver(UpdateSelectionProcessAdminSchema),
    defaultValues: { label: "", starts_at: "", ends_at: "" },
  });

  // O Sheet permanece no DOM entre aberturas — repovoar o form a cada
  // abertura, mesmo padrão de RoomFormSheet (front/app/painel/salas/page.tsx).
  useEffect(() => {
    if (open && process) {
      form.reset({ label: process.label, starts_at: process.starts_at, ends_at: process.ends_at });
    }
  }, [open, process, form]);

  const mutation = useMutation({
    mutationFn: (values: UpdateSelectionProcessAdminDTO) => {
      if (!process) throw new Error("Nenhum processo seletivo selecionado");
      return updateSelectionProcess(process.id, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["selection-processes"] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "SELECTION_PROCESS_LABEL_ALREADY_EXISTS") {
        form.setError("label", { message: error.message });
      }
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Corrigir processo seletivo</SheetTitle>
          <SheetDescription>
            Use apenas para corrigir um erro pontual — a criação de novas edições continua
            automática.
          </SheetDescription>
        </SheetHeader>

        <form
          id="selection-process-form"
          className="flex flex-col gap-5 px-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <FieldGroup className="gap-5">
            <Field data-invalid={!!form.formState.errors.label}>
              <FieldLabel htmlFor="selection-process-label">Rótulo</FieldLabel>
              <Input
                id="selection-process-label"
                placeholder="ex.: 2026.2"
                aria-invalid={!!form.formState.errors.label}
                {...form.register("label")}
              />
              <FieldError errors={[form.formState.errors.label]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.starts_at}>
              <FieldLabel htmlFor="selection-process-starts-at">Início</FieldLabel>
              <Input
                id="selection-process-starts-at"
                placeholder="AAAA-MM-DD"
                aria-invalid={!!form.formState.errors.starts_at}
                {...form.register("starts_at")}
              />
              <FieldError errors={[form.formState.errors.starts_at]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.ends_at}>
              <FieldLabel htmlFor="selection-process-ends-at">Fim</FieldLabel>
              <Input
                id="selection-process-ends-at"
                placeholder="AAAA-MM-DD ou AAAA-MM-DD HH:MM:SS"
                aria-invalid={!!form.formState.errors.ends_at}
                {...form.register("ends_at")}
              />
              <FieldError errors={[form.formState.errors.ends_at]} />
            </Field>
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="selection-process-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner aria-hidden /> : "Salvar alterações"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
