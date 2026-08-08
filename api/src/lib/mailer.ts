import { logger } from "./logger";

// Envio do email de recuperação de senha (FEAT-0003, seção 9).

export interface Mailer {
    sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void>;
}

/** Direto no endpoint HTTP em vez do SDK `resend`: evita o bundle size do cold start. */
export class ResendMailer implements Mailer {
    constructor(
        private readonly apiKey: string,
        private readonly fromEmail: string,
    ) {}

    async sendPasswordResetEmail({ to, resetUrl }: { to: string; resetUrl: string }): Promise<void> {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: this.fromEmail,
                to,
                subject: "Redefinição de senha — CIMATEC jr",
                text: [
                    "Recebemos um pedido para redefinir a senha da sua conta.",
                    "",
                    `Abra este link para escolher uma nova senha: ${resetUrl}`,
                    "",
                    "O link vale por 30 minutos e só pode ser usado uma vez.",
                    "Se não foi você quem pediu, ignore este email — nada muda na sua conta.",
                ].join("\n"),
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            // Sem retry/dead-letter (Cloudflare Queues exige plano pago). O log
            // nunca inclui o link, que é credencial de troca de senha.
            const body = await response.text().catch(() => "");
            logger.error("mailer.password_reset.failed", {
                status: response.status,
                body: body.slice(0, 200),
            });
            throw new Error(`Resend respondeu ${response.status}`);
        }

        logger.info("mailer.password_reset.sent", {});
    }
}
