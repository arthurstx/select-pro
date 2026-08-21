"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { PaginationMeta } from "shared";

import { Button } from "@/components/ui/button";

interface PaginationBarProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function PaginationBar({ pagination, onPageChange, disabled }: PaginationBarProps) {
  if (pagination.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <p className="text-muted-foreground text-sm">
        {pagination.total} candidato{pagination.total === 1 ? "" : "s"} · página {pagination.page} de{" "}
        {pagination.totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeftIcon aria-hidden />
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Próxima
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
