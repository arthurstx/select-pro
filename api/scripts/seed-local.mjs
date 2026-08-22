// ============================================================
// Seed do banco LOCAL (D1 via wrangler --local) — dev only.
//
// Gera `scripts/seed-local.sql` a partir de dados aleatórios (porém
// realistas) usando @faker-js/faker (locale pt_BR). O objetivo é ter volume
// suficiente para exercitar o dashboard de inscrições (FEAT-0007) e o
// check-in (FEAT-0005) com mais de uma edição do processo seletivo —
// inclusive edições PASSADAS, que hoje só existem em produção depois de
// meses de uso real.
//
// NÃO É DESTRUTIVO: só faz INSERT (e `INSERT OR IGNORE` nas duas edições que
// a 0006 já semeia). Os 3 candidatos + 1 usuário que já existem no seu banco
// local (dados de teste manual) não são tocados.
//
// `faker.seed(...)` fixo: rodar este script de novo produz o MESMO SQL. É
// proposital — o arquivo gerado é reprodutível e revisável no diff. Também
// significa que RODAR O SQL GERADO DUAS VEZES no mesmo banco vai falhar em
// UNIQUE/PK (proteção contra seed duplicado, não bug).
//
// Uso:
//   npm run seed:local:generate --workspace=api   # (re)gera o .sql
//   npm run seed:local:apply    --workspace=api   # aplica no D1 local
//
// Senha de todo usuário (admin/avaliador) semeado aqui: Cimatec@123
// ============================================================

import { pbkdf2Sync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fakerPT_BR as faker } from "@faker-js/faker";

faker.seed(20260821);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "seed-local.sql");

// ------------------------------------------------------------
// Helpers de SQL
// ------------------------------------------------------------

/** Aspas simples dobradas (escape padrão do SQLite). `null`/`undefined` viram NULL. */
function sqlStr(value) {
    if (value === null || value === undefined) return "NULL";
    return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBool(value) {
    return value ? 1 : 0;
}

function sqlNum(value) {
    if (value === null || value === undefined) return "NULL";
    return String(value);
}

function chunk(array, size) {
    const out = [];
    for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
    return out;
}

/** `Date` (instante UTC) -> `"AAAA-MM-DD HH:MM:SS"`, mesmo formato do `CURRENT_TIMESTAMP` do SQLite. */
function formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    );
}

function randomTimestampBetween(fromStr, toStr) {
    const from = new Date(`${fromStr.includes(" ") ? fromStr.replace(" ", "T") : `${fromStr}T00:00:00`}Z`);
    const to = new Date(`${toStr.includes(" ") ? toStr.replace(" ", "T") : `${toStr}T00:00:00`}Z`);
    return formatTimestamp(faker.date.between({ from, to }));
}

/** Timestamp aleatório entre `afterStr` (exclusive-ish) e `beforeStr`, para eventos que acontecem DEPOIS de outro (ex: check-in depois da inscrição). */
function randomTimestampAfter(afterStr, beforeStr) {
    const after = new Date(`${afterStr.replace(" ", "T")}Z`);
    const before = new Date(`${beforeStr.includes(" ") ? beforeStr.replace(" ", "T") : `${beforeStr}T23:59:59`}Z`);
    if (after >= before) return formatTimestamp(after);
    return formatTimestamp(faker.date.between({ from: after, to: before }));
}

function weightedPick(pairs) {
    const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = faker.number.float({ min: 0, max: total });
    for (const [value, weight] of pairs) {
        roll -= weight;
        if (roll <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
}

function stripAccents(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ------------------------------------------------------------
// Domínio (mesmos enums de `shared/src/schemas`)
// ------------------------------------------------------------

const COURSES = [
    ["eng-computacao", 0.22],
    ["eng-producao", 0.14],
    ["eng-eletrica", 0.12],
    ["eng-mecanica", 0.12],
    ["eng-civil", 0.12],
    ["eng-automacao", 0.12],
    ["eng-quimica", 0.08],
    ["arquitetura", 0.08],
];

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s, i) => [s, [5, 10, 12, 14, 14, 12, 10, 8, 8, 7][i]]);

const GENDERS = [
    ["masculino", 0.55],
    ["feminino", 0.4],
    ["outro", 0.05],
];

const ETHNICITIES = [
    ["branca", 0.35],
    ["parda", 0.32],
    ["preta", 0.15],
    ["amarela", 0.04],
    ["indigena", 0.02],
    ["nao-informado", 0.12],
];

const REFERRAL_SOURCES = [
    ["instagram", 0.45],
    ["campus", 0.2],
    ["indicacao", 0.2],
    ["linkedin", 0.08],
    ["outros", 0.07],
];

const REFERRAL_OTHER_TEXTS = [
    "Vi um cartaz no corredor da faculdade.",
    "Fiquei sabendo por um grupo de WhatsApp da turma.",
    "Um professor comentou sobre o processo seletivo em sala.",
    "Encontrei o formulário compartilhado no Discord da faculdade.",
    "Vi uma matéria sobre a empresa júnior no site da universidade.",
    "Vi em um evento de empreendedorismo no campus.",
    "Encontrei pesquisando sobre empresas juniores de engenharia.",
    "Um colega de outro curso comentou e resolvi me inscrever.",
];

const EXPERIENCE_FRAGMENTS = [
    "Já participei de uma liga de robótica na faculdade, onde ajudei a montar e programar o protótipo.",
    "Fiz um projeto de extensão universitária relacionado a energia solar durante um semestre.",
    "Trabalhei como monitor de uma disciplina de cálculo, o que me ensinou bastante sobre didática.",
    "Participei de uma maratona de programação e cheguei à fase estadual.",
    "Fui voluntário em uma ONG local organizando oficinas de tecnologia para adolescentes.",
    "Tenho experiência com projetos pessoais em Python, principalmente automação de tarefas simples.",
    "Já estagiei por alguns meses numa construtora, acompanhando o setor de planejamento.",
    "Participei de uma equipe de competição de Fórmula SAE cuidando da parte estrutural.",
    "Fiz um curso técnico antes da faculdade, então já tenho alguma vivência prática de laboratório.",
    "Nunca trabalhei formalmente ainda, mas participo de grupos de estudo e iniciação científica.",
    "Fui representante de turma por dois semestres, o que me deu prática em organizar pessoas.",
    "Participei de um hackathon universitário e ficamos entre os três primeiros colocados.",
    "Tenho experiência com Excel avançado de um estágio anterior em uma pequena empresa familiar.",
    "Já ajudei a organizar a semana acadêmica do meu curso, cuidando da parte de logística.",
];

const MOTIVATION_FRAGMENTS = [
    "Quero sair da teoria da sala de aula e aplicar o que aprendo em problemas reais.",
    "Sempre ouvi falar bem da empresa júnior e quero fazer parte da próxima geração.",
    "Busco desenvolver soft skills como trabalho em equipe e comunicação, que a faculdade não ensina sozinha.",
    "Quero construir um currículo mais forte antes de buscar meu primeiro estágio.",
    "Tenho interesse em empreendedorismo e vejo a empresa júnior como o primeiro passo nessa direção.",
    "Quero conhecer pessoas de outros períodos e cursos que compartilham os mesmos interesses.",
    "Acredito que aprender fazendo é mais efetivo do que só estudar para prova.",
    "Quero um ambiente onde eu possa errar, aprender rápido e crescer profissionalmente.",
    "Já pesquisei sobre os projetos que vocês desenvolvem e me identifiquei bastante.",
    "Busco desenvolver liderança, já que pretendo seguir carreira de gestão no futuro.",
    "Quero sair da minha zona de conforto e assumir mais responsabilidade do que hoje na faculdade.",
    "Vejo a empresa júnior como uma ponte entre a universidade e o mercado de trabalho.",
];

function sample(array, count) {
    return faker.helpers.arrayElements(array, count);
}

/**
 * `faker.person.fullName()` inclui prefixo/sufixo (`Dr.`, `Sra.`, `Jr.`)
 * boa parte das vezes — natural num gerador genérico, mas ninguém digita
 * "Dra. Fulana de Tal" no nome de um formulário de inscrição. Nome + sobrenome
 * puro é o que sai daqui.
 */
function randomFullName(sex) {
    return `${faker.person.firstName(sex)} ${faker.person.lastName(sex)}`;
}

function buildParagraph(fragments, count) {
    return sample(fragments, count).join(" ");
}

// ------------------------------------------------------------
// Telefones — Brasil, formato E.164 (candidatos) e mascarado (staff/tec).
// ------------------------------------------------------------

const REAL_DDDS = [
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
    49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
];

function randomMobileDigits() {
    const ddd = faker.helpers.arrayElement(REAL_DDDS);
    const subscriber = `9${String(faker.number.int({ min: 10_000_000, max: 99_999_999 }))}`; // 9 dígitos, começa com 9
    return { ddd, subscriber };
}

/** `+55` + DDD + 9 dígitos — mesmo formato que `toE164`/o CHECK de `candidates.phone` (0007) exigem. */
function randomE164Phone(used) {
    let value;
    do {
        const { ddd, subscriber } = randomMobileDigits();
        value = `+55${ddd}${subscriber}`;
    } while (used.has(value));
    used.add(value);
    return value;
}

/** Formato mascarado — dado "da tec", sem relação com a normalização de `candidates` (FEAT-0006). */
function randomMaskedPhone() {
    const { ddd, subscriber } = randomMobileDigits();
    return `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
}

function randomEmail(fullName, used) {
    const domain = weightedPick([
        ["gmail.com", 0.55],
        ["hotmail.com", 0.15],
        ["outlook.com", 0.1],
        ["icloud.com", 0.08],
        ["yahoo.com.br", 0.05],
        ["aln.senaicimatec.edu.br", 0.07],
    ]);

    const parts = stripAccents(fullName.toLowerCase())
        .replace(/[^a-z\s]/g, "")
        .trim()
        .split(/\s+/);
    const first = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : "cimatec";

    let email;
    do {
        const separator = faker.helpers.arrayElement([".", "", "_"]);
        const suffix = faker.datatype.boolean({ probability: 0.35 }) ? String(faker.number.int({ min: 1, max: 999 })) : "";
        email = `${first}${separator}${last}${suffix}@${domain}`;
    } while (used.has(email));
    used.add(email);
    return email;
}

const usedEmails = new Set();
const usedPhones = new Set();

// ------------------------------------------------------------
// SQL — buffer de saída
// ------------------------------------------------------------

const sql = [];
sql.push(`-- ============================================================
-- Seed de dados LOCAIS (dev) — gerado por scripts/seed-local.mjs
-- @faker-js/faker (locale pt_BR), faker.seed(20260821) => reprodutível.
--
-- NÃO roda em staging/produção. Não é uma migration (não segue numeração
-- 000N nem entra em migrations_dir) — é aplicado à parte, sob demanda:
--   npm run seed:local:apply --workspace=api
--
-- Não é destrutivo: só INSERT (e OR IGNORE nas duas edições que a 0006 já
-- semeia). Rodar este arquivo duas vezes no mesmo banco falha em UNIQUE/PK
-- de propósito — é a proteção contra seed duplicado.
--
-- Login de qualquer usuário (admin/avaliador) semeado aqui:
--   senha: Cimatec@123
-- ============================================================
`);

// ------------------------------------------------------------
// 1. Edições passadas do processo seletivo
//
// 2026.1 e 2026.2 já existem (migration 0006-candidate-checkin.sql). Esta
// seed acrescenta o histórico que só existiria em produção depois de anos
// de uso: 2024.1 até 2025.2. `INSERT OR IGNORE` porque as duas edições
// vigentes já estão lá, e reaplicar a migration num banco fresco cria as
// mesmas antes desta seed rodar.
// ------------------------------------------------------------

const EXISTING_EDITIONS = [
    { id: "a1cc2644-d85c-44a7-87cb-60781d8d7464", label: "2026.1", startsAt: "2026-01-01", endsAt: "2026-07-31 23:59:59" },
    { id: "ace24839-ec23-4942-9065-dbd45742034e", label: "2026.2", startsAt: "2026-08-01", endsAt: "2026-12-31 23:59:59" },
];

const PAST_EDITIONS_META = [
    { label: "2024.1", startsAt: "2024-01-01", endsAt: "2024-07-31 23:59:59", n: 35, turnout: 0.72 },
    { label: "2024.2", startsAt: "2024-08-01", endsAt: "2024-12-31 23:59:59", n: 48, turnout: 0.76 },
    { label: "2025.1", startsAt: "2025-01-01", endsAt: "2025-07-31 23:59:59", n: 60, turnout: 0.79 },
    { label: "2025.2", startsAt: "2025-08-01", endsAt: "2025-12-31 23:59:59", n: 75, turnout: 0.81 },
];

const NOW = "2026-08-21 12:00:00";

const editions = [
    ...PAST_EDITIONS_META.map((e) => ({ ...e, id: faker.string.uuid(), isNew: true })),
    { ...EXISTING_EDITIONS[0], n: 90, turnout: 0.83, isNew: false },
    { ...EXISTING_EDITIONS[1], n: 40, turnout: 0.12, isNew: false, current: true, cappedEndsAt: NOW },
];

sql.push("-- ------------------------------------------------------------");
sql.push("-- Edições passadas (2024.1 – 2025.2)");
sql.push("-- ------------------------------------------------------------\n");
sql.push("INSERT OR IGNORE INTO selection_processes (id, label, starts_at, ends_at) VALUES");
sql.push(
    editions
        .filter((e) => e.isNew)
        .map((e) => `  (${sqlStr(e.id)}, ${sqlStr(e.label)}, ${sqlStr(e.startsAt)}, ${sqlStr(e.endsAt)})`)
        .join(",\n") + ";\n",
);

// ------------------------------------------------------------
// 2. Staff (admin/avaliador) — usuários + snapshot de membro
// ------------------------------------------------------------

const PBKDF2_ITERATIONS = 25_000; // mesmo valor de `api/src/lib/password.ts` na data desta seed
const DEV_PASSWORD = "Cimatec@123";

function hashDevPassword() {
    const salt = Buffer.from(faker.string.hexadecimal({ length: 32, prefix: "" }), "hex");
    const derived = pbkdf2Sync(DEV_PASSWORD, salt, PBKDF2_ITERATIONS, 32, "sha256");
    return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const STAFF_COURSES = [
    "Engenharia de Computação",
    "Engenharia de Produção",
    "Engenharia Elétrica",
    "Engenharia Mecânica",
    "Engenharia Civil",
    "Engenharia de Automação Industrial",
    "Engenharia Química",
    "Arquitetura e Urbanismo",
];

const STAFF = [
    { role: "admin", createdAt: "2023-11-06 09:15:00" },
    { role: "avaliador", createdAt: "2024-01-15 10:00:00" },
    { role: "avaliador", createdAt: "2024-01-15 10:05:00" },
    { role: "avaliador", createdAt: "2024-07-20 14:30:00" },
    { role: "avaliador", createdAt: "2025-01-10 11:00:00" },
    { role: "avaliador", createdAt: "2025-02-03 16:45:00" },
    { role: "avaliador", createdAt: "2025-08-04 09:00:00" },
].map((base) => {
    const fullName = randomFullName();
    return {
        ...base,
        id: faker.string.uuid(),
        profileId: faker.string.uuid(),
        memberId: faker.string.uuid(),
        fullName,
        email: randomEmail(fullName, usedEmails),
        phone: randomMaskedPhone(),
        birthDate: formatTimestamp(faker.date.birthdate({ min: 19, max: 27, mode: "age" })).slice(0, 10),
        course: faker.helpers.arrayElement(STAFF_COURSES),
        semester: faker.number.int({ min: 3, max: 10 }),
        gender: faker.helpers.arrayElement(["Masculino", "Feminino", "Outro"]),
        ethnicity: faker.helpers.arrayElement(["Branca", "Preta", "Parda", "Amarela", "Indígena", "Não informado"]),
        manager: base.role === "admin" ? 1 : faker.datatype.boolean({ probability: 0.15 }) ? 1 : 0,
        passwordHash: hashDevPassword(),
    };
});

sql.push("-- ------------------------------------------------------------");
sql.push("-- Staff (admin/avaliador) — login local: qualquer email abaixo + senha Cimatec@123");
sql.push("-- ------------------------------------------------------------\n");

sql.push("INSERT INTO users (id, role_id, email, name, password, created_at) VALUES");
sql.push(
    STAFF.map(
        (u) =>
            `  (${sqlStr(u.id)}, ${sqlStr(u.role)}, ${sqlStr(u.email)}, ${sqlStr(u.fullName)}, ${sqlStr(u.passwordHash)}, ${sqlStr(u.createdAt)})`,
    ).join(",\n") + ";\n",
);

sql.push(
    "INSERT INTO member_profiles (id, user_id, member_id, full_name, phone, birth_date, course, semester, gender, ethnicity, status, manager, synced_at, created_at) VALUES",
);
sql.push(
    STAFF.map(
        (u) =>
            `  (${sqlStr(u.profileId)}, ${sqlStr(u.id)}, ${sqlStr(u.memberId)}, ${sqlStr(u.fullName)}, ${sqlStr(u.phone)}, ${sqlStr(u.birthDate)}, ${sqlStr(u.course)}, ${sqlNum(u.semester)}, ${sqlStr(u.gender)}, ${sqlStr(u.ethnicity)}, 'active', ${sqlNum(u.manager)}, ${sqlStr(u.createdAt)}, ${sqlStr(u.createdAt)})`,
    ).join(",\n") + ";\n",
);

// ------------------------------------------------------------
// 3. Candidatos + questionário, por edição
// ------------------------------------------------------------

sql.push("-- ------------------------------------------------------------");
sql.push("-- Candidatos + questionário (candidate_applications), por edição");
sql.push("-- ------------------------------------------------------------\n");

/** Guarda { candidateId, processId, createdAt } de todo mundo, pra fase de check-in mais abaixo. */
const allCandidates = [];

for (const edition of editions) {
    const rows = [];
    const appRows = [];
    const windowEnd = edition.cappedEndsAt ?? edition.endsAt;

    for (let i = 0; i < edition.n; i += 1) {
        const gender = weightedPick(GENDERS);
        const fullName = randomFullName(gender === "masculino" ? "male" : gender === "feminino" ? "female" : undefined);
        const candidateId = faker.string.uuid();
        const createdAt = randomTimestampBetween(edition.startsAt, windowEnd);
        const referralSource = weightedPick(REFERRAL_SOURCES);

        rows.push({
            id: candidateId,
            processId: edition.id,
            course: weightedPick(COURSES),
            semester: weightedPick(SEMESTERS),
            gender,
            ethnicity: weightedPick(ETHNICITIES),
            name: fullName,
            email: randomEmail(fullName, usedEmails),
            phone: randomE164Phone(usedPhones),
            createdAt,
        });

        appRows.push({
            id: faker.string.uuid(),
            candidateId,
            referralSource,
            referralSourceOther: referralSource === "outros" ? faker.helpers.arrayElement(REFERRAL_OTHER_TEXTS) : null,
            experience: buildParagraph(EXPERIENCE_FRAGMENTS, faker.number.int({ min: 1, max: 3 })),
            motivation: buildParagraph(MOTIVATION_FRAGMENTS, faker.number.int({ min: 1, max: 2 })),
            saturdayRestriction: faker.datatype.boolean({ probability: 0.25 }),
            specialNeeds: faker.datatype.boolean({ probability: 0.04 }),
            createdAt,
        });

        allCandidates.push({ candidateId, processId: edition.id, createdAt, windowEnd, turnout: edition.turnout });
    }

    sql.push(`-- Edição ${edition.label} — ${edition.n} candidatos`);
    for (const group of chunk(rows, 20)) {
        sql.push("INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at) VALUES");
        sql.push(
            group
                .map(
                    (c) =>
                        `  (${sqlStr(c.id)}, ${sqlStr(c.processId)}, ${sqlStr(c.course)}, ${sqlNum(c.semester)}, ${sqlStr(c.gender)}, ${sqlStr(c.ethnicity)}, ${sqlStr(c.name)}, ${sqlStr(c.email)}, ${sqlStr(c.phone)}, ${sqlStr(c.createdAt)})`,
                )
                .join(",\n") + ";",
        );
    }
    sql.push("");

    for (const group of chunk(appRows, 20)) {
        sql.push(
            "INSERT INTO candidate_applications (id, candidate_id, referral_source, referral_source_other, mej_acknowledged, experience, motivation, saturday_restriction, special_needs, created_at) VALUES",
        );
        sql.push(
            group
                .map(
                    (a) =>
                        `  (${sqlStr(a.id)}, ${sqlStr(a.candidateId)}, ${sqlStr(a.referralSource)}, ${sqlStr(a.referralSourceOther)}, 1, ${sqlStr(a.experience)}, ${sqlStr(a.motivation)}, ${sqlBool(a.saturdayRestriction)}, ${sqlBool(a.specialNeeds)}, ${sqlStr(a.createdAt)})`,
                )
                .join(",\n") + ";",
        );
    }
    sql.push("");
}

// ------------------------------------------------------------
// 4. Check-in — estado atual + histórico append-only
//
// Edições passadas: turnout "fechado" (a interação real já aconteceu).
// 2026.2 (corrente): turnout baixo — a edição está no ar há poucos dias.
// ------------------------------------------------------------

sql.push("-- ------------------------------------------------------------");
sql.push("-- Check-in (candidate_checkins + checkin_events)");
sql.push("-- ------------------------------------------------------------\n");

const checkinRows = [];
const eventRows = [];

for (const candidate of allCandidates) {
    if (faker.number.float({ min: 0, max: 1 }) > candidate.turnout) continue; // ausente: não gera linha nenhuma

    const actor = faker.helpers.arrayElement(STAFF.filter((u) => u.role === "avaliador"));
    const checkedInAt = randomTimestampAfter(candidate.createdAt, candidate.windowEnd);

    checkinRows.push({
        id: faker.string.uuid(),
        candidateId: candidate.candidateId,
        processId: candidate.processId,
        checkedInBy: actor.id,
        checkedInAt,
    });

    eventRows.push({
        id: faker.string.uuid(),
        candidateId: candidate.candidateId,
        processId: candidate.processId,
        actorId: actor.id,
        createdAt: checkedInAt,
    });
}

for (const group of chunk(checkinRows, 25)) {
    sql.push("INSERT INTO candidate_checkins (id, candidate_id, process_id, checked_in_by, checked_in_at) VALUES");
    sql.push(
        group
            .map(
                (c) =>
                    `  (${sqlStr(c.id)}, ${sqlStr(c.candidateId)}, ${sqlStr(c.processId)}, ${sqlStr(c.checkedInBy)}, ${sqlStr(c.checkedInAt)})`,
            )
            .join(",\n") + ";",
    );
}
sql.push("");

for (const group of chunk(eventRows, 25)) {
    sql.push("INSERT INTO checkin_events (id, candidate_id, process_id, action, actor_id, created_at) VALUES");
    sql.push(
        group
            .map(
                (e) => `  (${sqlStr(e.id)}, ${sqlStr(e.candidateId)}, ${sqlStr(e.processId)}, 'marcou', ${sqlStr(e.actorId)}, ${sqlStr(e.createdAt)})`,
            )
            .join(",\n") + ";",
    );
}
sql.push("");

// ------------------------------------------------------------
// Escreve o arquivo + resumo no stdout
// ------------------------------------------------------------

writeFileSync(OUTPUT_PATH, sql.join("\n"));

const totalCandidates = allCandidates.length;
console.log(`Gerado: ${OUTPUT_PATH}`);
console.log(`  Edições novas: ${editions.filter((e) => e.isNew).length}`);
console.log(`  Staff (users + member_profiles): ${STAFF.length}`);
console.log(`  Candidatos + questionários: ${totalCandidates}`);
console.log(`  Check-ins marcados: ${checkinRows.length}`);
for (const edition of editions) {
    console.log(`    ${edition.label}: ${edition.n} candidatos, turnout alvo ${(edition.turnout * 100).toFixed(0)}%`);
}
