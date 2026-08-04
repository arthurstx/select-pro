import { importPKCS8, SignJWT } from "jose";

/** Escopo mínimo para ler e escrever valores numa planilha (FEAT-0002, seção 5.2 do guia). */
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Célula de planilha: o job só escreve texto e número (FEAT-0002, seção 8.2). */
export type CellValue = string | number;

/**
 * Superfície mínima da planilha usada pelo service. Existe para que
 * `SheetSyncService` seja testável sem rede — a implementação real é
 * `GoogleSheetsClient` (FEAT-0002, seção 9).
 */
export interface SheetsClient {
    /** Valores de um intervalo. Devolve `[]` quando o intervalo está vazio. */
    readValues(range: string): Promise<CellValue[][]>;
    /** Acrescenta linhas ao fim do intervalo, sem sobrescrever nada. */
    appendRows(range: string, rows: CellValue[][]): Promise<void>;
}

/** Campos do JSON da service account que este cliente usa; o resto é metadado. */
interface ServiceAccountCredentials {
    client_email: string;
    private_key: string;
}

function parseCredentials(rawJson: string): ServiceAccountCredentials {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        // Sem detalhe do conteúdo: a mensagem vai para o log e o valor é a chave privada.
        throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY não é um JSON válido");
    }

    const { client_email, private_key } = parsed as Partial<ServiceAccountCredentials>;
    if (!client_email || !private_key) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY não contém client_email e private_key");
    }

    return { client_email, private_key };
}

export class GoogleSheetsClient implements SheetsClient {
    private readonly credentials: ServiceAccountCredentials;

    /**
     * Token memoizado **por instância**, não entre execuções: uma execução do
     * cron faz até três chamadas (cabeçalho, ids, append) e não há motivo para
     * pedir um token novo em cada uma. Cachear entre execuções exigiria
     * reintroduzir o KV, removido do projeto na FEAT-0001 v3.0 — complexidade
     * maior que o ganho de um round-trip por hora (FEAT-0002, seção 9).
     */
    private tokenPromise: Promise<string> | null = null;

    constructor(
        serviceAccountJson: string,
        private readonly spreadsheetId: string,
    ) {
        this.credentials = parseCredentials(serviceAccountJson);
    }

    async readValues(range: string): Promise<CellValue[][]> {
        const url = `${SHEETS_API}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`;
        const response = await this.authorizedFetch(url);

        const body = (await response.json()) as { values?: CellValue[][] };
        // A API omite `values` quando o intervalo não tem nenhuma célula preenchida.
        return body.values ?? [];
    }

    async appendRows(range: string, rows: CellValue[][]): Promise<void> {
        if (rows.length === 0) return;

        // `valueInputOption=RAW` é o que impede a planilha de interpretar um
        // texto livre começando com "=" como fórmula (FEAT-0002, seção 8.2).
        const query = new URLSearchParams({
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
        });
        const url = `${SHEETS_API}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?${query}`;

        await this.authorizedFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values: rows }),
        });
    }

    private async authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
        const token = await this.getAccessToken();

        const response = await fetch(url, {
            ...init,
            headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            // O corpo do erro do Google traz a causa real (planilha não
            // compartilhada, id errado, quota) e não contém segredo — vale
            // propagar para encurtar a depuração (FEAT-0002, E1-E3).
            const detail = await response.text().catch(() => "");
            throw new Error(`Sheets API ${response.status}: ${detail.slice(0, 500)}`);
        }

        return response;
    }

    private getAccessToken(): Promise<string> {
        this.tokenPromise ??= this.requestAccessToken();
        return this.tokenPromise;
    }

    /**
     * Fluxo JWT bearer da service account: assina um JWT com a chave privada e
     * troca por um access token de 1 hora. É o único modelo de auth do Google
     * que funciona sem interação humana.
     */
    private async requestAccessToken(): Promise<string> {
        // `private_key` vem do JSON em PKCS#8 (com as quebras de linha já
        // desescapadas pelo JSON.parse) — é o formato que `importPKCS8` espera.
        const key = await importPKCS8(this.credentials.private_key, "RS256");

        const jwt = await new SignJWT({ scope: SHEETS_SCOPE })
            .setProtectedHeader({ alg: "RS256" })
            .setIssuer(this.credentials.client_email)
            .setAudience(TOKEN_URL)
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(key);

        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: jwt,
            }),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(`Falha ao obter access token do Google (${response.status}): ${detail.slice(0, 300)}`);
        }

        const body = (await response.json()) as { access_token?: string };
        if (!body.access_token) {
            throw new Error("Resposta do Google não trouxe access_token");
        }

        return body.access_token;
    }
}
