import assert from "node:assert/strict";
import test from "node:test";

import { reconcileItem, type ListData } from "./reconcile.ts";

const PRESENT_AT = "2026-08-12T10:00:00.000Z";

function item(id: string, checkedInAt: string | null) {
  return {
    id,
    name: `Candidato ${id}`,
    email: `${id}@example.com`,
    phone: "71988880000",
    course: "eng-computacao" as const,
    semester: 3,
    checkedInAt,
  };
}

function list(items: ReturnType<typeof item>[], total = items.length): ListData {
  return {
    process: { id: "11111111-1111-4111-8111-111111111111", label: "2026.2" },
    items,
    pagination: { page: 1, perPage: 25, total, totalPages: Math.ceil(total / 25) },
  };
}

test("item ausente desta página não é inserido — quem entra no filtro só aparece no próximo fetch", () => {
  const data = list([item("a", null)]);

  const result = reconcileItem(data, "inexistente", PRESENT_AT, "presentes");

  assert.equal(result, data, "sem mudança, a referência original é preservada");
});

test('filtro "todos": marcar presença só atualiza o checkedInAt, sem remover a linha', () => {
  const data = list([item("a", null), item("b", null)]);

  const result = reconcileItem(data, "a", PRESENT_AT, "todos");

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].checkedInAt, PRESENT_AT);
  assert.equal(result.pagination.total, 2, "o total não muda em `todos`");
});

test('filtro "ausentes": marcar presença remove a linha na hora e decrementa o total', () => {
  const data = list([item("a", null), item("b", null)]);

  const result = reconcileItem(data, "a", PRESENT_AT, "ausentes");

  assert.deepEqual(
    result.items.map((i) => i.id),
    ["b"],
    "quem foi marcado sai da lista de ausentes imediatamente",
  );
  assert.equal(result.pagination.total, 1);
});

test('filtro "presentes": desmarcar remove a linha na hora e decrementa o total', () => {
  const data = list([item("a", PRESENT_AT), item("b", PRESENT_AT)]);

  const result = reconcileItem(data, "a", null, "presentes");

  assert.deepEqual(
    result.items.map((i) => i.id),
    ["b"],
  );
  assert.equal(result.pagination.total, 1);
});

test('filtro "presentes": marcar quem já estava lá não remove nada', () => {
  const data = list([item("a", PRESENT_AT)]);

  const result = reconcileItem(data, "a", PRESENT_AT, "presentes");

  assert.equal(result.items.length, 1);
  assert.equal(result.pagination.total, 1);
});

test("totalPages é recalculado ao remover, não só o total", () => {
  const data = list([item("a", null)], 26); // 26 itens => 2 páginas

  const result = reconcileItem(data, "a", PRESENT_AT, "ausentes");

  assert.equal(result.pagination.total, 25);
  assert.equal(result.pagination.totalPages, 1, "25 itens cabem em uma página de 25");
});

test("total nunca fica negativo, mesmo se a contagem em cache já estiver dessincronizada", () => {
  const data = list([item("a", null)], 0);

  const result = reconcileItem(data, "a", PRESENT_AT, "ausentes");

  assert.equal(result.pagination.total, 0);
  assert.equal(result.pagination.totalPages, 0);
});

test("o dado original não é mutado", () => {
  const data = list([item("a", null)]);

  reconcileItem(data, "a", PRESENT_AT, "todos");

  assert.equal(data.items[0].checkedInAt, null, "reconcileItem devolve cópia, não muda a entrada");
});
