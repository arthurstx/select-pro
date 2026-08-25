"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpenIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { CreateRoomSchema, deriveRoomCapacity, type CreateRoomDTO, type RoomSummary } from "shared";

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
import { createRoom, deleteRoom, listRooms, updateRoom } from "@/lib/rooms/rooms-api";

/**
 * Cadastro de salas (FEAT-0011) — CRUD que a organização automática de
 * grupos (feature futura) vai consumir. Hosts/limite de grupos nunca são
 * digitados: `deriveRoomCapacity` (mesma função que a API usa na response)
 * calcula a prévia ao vivo enquanto o admin digita a capacidade.
 */
export default function SalasPage() {
  const queryClient = useQueryClient();
  const [sheetRoom, setSheetRoom] = useState<RoomSummary | null | undefined>(undefined); // undefined = fechado

  const query = useQuery({ queryKey: ["rooms"], queryFn: listRooms });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoom(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rooms"] }),
  });

  function handleDelete(room: RoomSummary) {
    if (!window.confirm(`Excluir a sala "${room.name}"?`)) return;
    deleteMutation.mutate(room.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Salas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Espaços disponíveis para a organização dos grupos.
          </p>
        </div>
        <Button onClick={() => setSheetRoom(null)}>
          <PlusIcon aria-hidden />
          Nova sala
        </Button>
      </div>

      <div className="border-border bg-primary/5 rounded-lg border p-3 text-sm">
        <p className="text-foreground">
          Hosts e limite de grupos são calculados pela capacidade: até 50 lugares → 1 host, 2
          grupos; de 51 a 80 → 2 hosts, 3 grupos; acima de 80 → 2 hosts, 4 grupos.
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
          Não foi possível carregar as salas. Tente novamente.
        </p>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <DoorOpenIcon className="text-muted-foreground size-8" aria-hidden />
          <p className="text-muted-foreground text-sm">Nenhuma sala cadastrada ainda.</p>
        </div>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="border-border overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sala</TableHead>
                <TableHead>Capacidade</TableHead>
                <TableHead>Hosts</TableHead>
                <TableHead>Grupos (máx.)</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>{room.size} pessoas</TableCell>
                  <TableCell className="text-muted-foreground">{room.hostCount}</TableCell>
                  <TableCell className="text-muted-foreground">{room.maxGroups}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSheetRoom(room)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => handleDelete(room)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {deleteMutation.isError && (
        <p className="text-destructive text-sm" role="alert">
          {deleteMutation.error instanceof ApiError && deleteMutation.error.code === "ROOM_HAS_GROUPS"
            ? deleteMutation.error.message
            : "Não foi possível excluir a sala. Tente novamente."}
        </p>
      )}

      <RoomFormSheet
        open={sheetRoom !== undefined}
        room={sheetRoom ?? null}
        onOpenChange={(open) => setSheetRoom(open ? sheetRoom : undefined)}
      />
    </div>
  );
}

function RoomFormSheet({
  open,
  room,
  onOpenChange,
}: {
  open: boolean;
  room: RoomSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = room !== null;

  const form = useForm<CreateRoomDTO>({
    resolver: zodResolver(CreateRoomSchema),
    defaultValues: { name: "", size: 40 },
  });

  // Reabrir com outra sala (ou "nova sala") precisa repovoar o form —
  // ele não é remontado, já que o Sheet permanece no DOM entre aberturas.
  useEffect(() => {
    if (open) form.reset({ name: room?.name ?? "", size: room?.size ?? 40 });
  }, [open, room, form]);

  const mutation = useMutation({
    mutationFn: (values: CreateRoomDTO) =>
      isEditing ? updateRoom(room.id, values) : createRoom(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "ROOM_NAME_ALREADY_EXISTS") {
        form.setError("name", { message: error.message });
      }
    },
  });

  const watchedSize = useWatch({ control: form.control, name: "size" });
  const preview = Number.isFinite(watchedSize) && watchedSize > 0 ? deriveRoomCapacity(watchedSize) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar sala" : "Nova sala"}</SheetTitle>
          <SheetDescription>
            Hosts e limite de grupos são calculados automaticamente pela capacidade.
          </SheetDescription>
        </SheetHeader>

        <form
          id="room-form"
          className="flex flex-col gap-5 px-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <FieldGroup className="gap-5">
            <Field data-invalid={!!form.formState.errors.name}>
              <FieldLabel htmlFor="room-name">Nome da sala</FieldLabel>
              <Input
                id="room-name"
                placeholder="ex.: 2.2.1"
                aria-invalid={!!form.formState.errors.name}
                {...form.register("name")}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.size}>
              <FieldLabel htmlFor="room-size">Capacidade (pessoas)</FieldLabel>
              <Input
                id="room-size"
                type="number"
                min={1}
                aria-invalid={!!form.formState.errors.size}
                {...form.register("size", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.size]} />
            </Field>

            {preview && (
              <p className="text-muted-foreground text-sm">
                Esta sala comporta {preview.hostCount} host{preview.hostCount > 1 ? "s" : ""} e até{" "}
                {preview.maxGroups} grupos.
              </p>
            )}
          </FieldGroup>
        </form>

        <SheetFooter>
          <Button type="submit" form="room-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner aria-hidden /> : isEditing ? "Salvar alterações" : "Salvar sala"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
