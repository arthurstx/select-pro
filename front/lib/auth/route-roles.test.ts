import assert from "node:assert/strict";
import test from "node:test";
import type { Role } from "shared";

import type { PainelNavEntry } from "@/components/painel/painel-nav";

import { asRole, canAccessRoute, filterNavForRole, rolesForRoute } from "./route-roles.ts";

// Mesmo motivo do módulo sob teste: o barrel do `shared` não carrega sob
// `node --test`, então os papéis vêm como literais checados pelo `satisfies`.
const ADMIN = "admin" satisfies Role;
const AVALIADOR = "avaliador" satisfies Role;

// Os ícones não importam para a poda; `null` evita depender do lucide aqui.
const icon = null as unknown as PainelNavEntry extends { icon: infer T } ? T : never;

function item(href: string, label = href): PainelNavEntry {
  return { href, label, icon };
}

function group(label: string, children: string[]): PainelNavEntry {
  return { label, icon, children: children.map((href) => ({ href, label: href, icon })) };
}

test("prefixo mais longo vence: check-in-membros não é engolido por check-in", () => {
  assert.deepEqual(rolesForRoute("/painel/check-in-membros"), [ADMIN]);
  assert.deepEqual(rolesForRoute("/painel/check-in/presencial"), [ADMIN, AVALIADOR]);
});

test("rota não listada libera os dois papéis — a API é a barreira real", () => {
  assert.deepEqual(rolesForRoute("/painel/tela-que-ainda-nao-existe"), [
    ADMIN,
    AVALIADOR,
  ]);
});

test("minhas-avaliacoes é do avaliador, avaliacoes é do admin", () => {
  assert.equal(canAccessRoute(AVALIADOR, "/painel/minhas-avaliacoes"), true);
  assert.equal(canAccessRoute(ADMIN, "/painel/minhas-avaliacoes"), false);
  assert.equal(canAccessRoute(ADMIN, "/painel/avaliacoes"), true);
  assert.equal(canAccessRoute(AVALIADOR, "/painel/avaliacoes"), false);
});

test("as duas modalidades de grupos são admin-only (GET /groups é admin na API)", () => {
  assert.equal(canAccessRoute(AVALIADOR, "/painel/grupos/online"), false);
  assert.equal(canAccessRoute(AVALIADOR, "/painel/grupos/presencial"), false);
});

test("asRole recusa papel desconhecido, e papel nulo não acessa nada", () => {
  assert.equal(asRole("admin"), ADMIN);
  assert.equal(asRole("gerente"), null);
  assert.equal(asRole(undefined), null);
  assert.equal(canAccessRoute(null, "/painel"), false);
});

test("grupo sem filhos permitidos some inteiro", () => {
  const nav = [group("Membros", ["/painel/avaliadores", "/painel/solicitacoes"])];

  assert.deepEqual(filterNavForRole(nav, AVALIADOR), []);
  assert.equal(filterNavForRole(nav, ADMIN).length, 1);
});

test("grupo com um filho só é promovido a link de topo", () => {
  const nav = [group("Presencial", ["/painel/check-in/presencial", "/painel/salas"])];

  const podado = filterNavForRole(nav, AVALIADOR);
  assert.equal(podado.length, 1);
  assert.deepEqual(podado[0], { href: "/painel/check-in/presencial", label: "/painel/check-in/presencial", icon });
});

test("grupo com dois ou mais filhos continua grupo, sem mutar a lista original", () => {
  const nav = [group("Membros", ["/painel/avaliadores", "/painel/solicitacoes", "/painel/salas"])];

  const podado = filterNavForRole(nav, ADMIN);
  assert.equal("children" in podado[0], true);
  // Cópia, não o mesmo objeto: a lista original é um módulo compartilhado.
  assert.notEqual(podado[0], nav[0]);
  assert.equal("children" in nav[0] && nav[0].children.length, 3);
});

test("papel nulo devolve nav vazia, para nada piscar durante o boot", () => {
  assert.deepEqual(filterNavForRole([item("/painel")], null), []);
});
