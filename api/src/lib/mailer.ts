import { Resend } from "resend";

export interface SendOtcEmailParams {
    to: string;
    name: string;
    code: string;
}

export interface Mailer {
    sendOtcEmail(params: SendOtcEmailParams): Promise<void>;
}

/**
 * Client Resend isolado atrás da interface `Mailer` — troca fácil por um
 * mock nos testes (prompt de implementação, seção 9: fluxo feliz com mock
 * do Resend).
 */
export class ResendMailer implements Mailer {
    constructor(
        private readonly apiKey: string,
        private readonly fromEmail: string,
    ) {}

    async sendOtcEmail({ to, name, code }: SendOtcEmailParams): Promise<void> {
        const resend = new Resend(this.apiKey);

        // Sem timeout aqui, um provedor de email fora do ar prende a resposta
        // do /pre-register indefinidamente (o service já trata falha de envio
        // como não-fatal, mas isso só ajuda se o await eventualmente resolver).
        const { error } = await resend.emails.send(
            {
                from: this.fromEmail,
                to,
                subject: "Confirme seu cadastro — CIMATEC Jr",
                text: `Olá, ${name}!\n\nSeu código de confirmação é: ${code}\n\nEsse código expira em alguns minutos.`,
            },
            { signal: AbortSignal.timeout(10_000) },
        );

        // O SDK do Resend retorna `{ error }` em vez de lançar em falhas da API —
        // convertemos em throw para que o chamador (service) trate uniformemente
        // sucesso/falha de envio (decisão #4, prompt seção 8: loga e segue, não reverte o KV).
        if (error) {
            throw new Error(`Resend API error: ${error.message}`);
        }
    }
}
