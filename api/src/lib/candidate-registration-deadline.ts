// Trava temporária de prazo de inscrição (tarefa avulsa, 2026-09-04 — sem spec
// própria por ser pontual, ver AGENTS.md "specs só para features relevantes").
//
// Todo processo seletivo terá início e fim de inscrições; por ora isso é uma
// constante fixa em código. Uma tela de admin para configurar esse prazo por
// edição (`selection_processes`) é trabalho futuro — ver TODO abaixo.
//
// TODO(admin-config): mover este prazo para a tabela `selection_processes`
// (ex.: coluna `registration_ends_at`), com CRUD no admin, em vez de uma
// constante em código. Documentar como spec própria quando essa tela for
// priorizada.

/** 2026-09-04 23:59:59 em horário de Brasília (UTC-3) => 2026-09-05T02:59:59Z. */
const REGISTRATION_DEADLINE_UTC = new Date("2026-09-05T02:59:59.000Z");

export function isRegistrationOpen(now: Date): boolean {
    return now.getTime() <= REGISTRATION_DEADLINE_UTC.getTime();
}

export function registrationDeadlineIso(): string {
    return REGISTRATION_DEADLINE_UTC.toISOString();
}
