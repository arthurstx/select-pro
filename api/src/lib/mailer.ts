import { logger } from "./logger";

// Envio de email transacional — recuperação de senha (FEAT-0003, seção 9) e
// solicitações de cadastro pendentes de aprovação (FEAT-0008).

export interface Mailer {
    sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void>;

    /** Para a caixa institucional (FR-020), não para um admin específico. */
    sendSignupApprovalRequest(params: {
        to: string;
        memberName: string;
        memberStatusLabel: string;
        reviewUrl: string;
    }): Promise<void>;

    /** Para o solicitante, depois que um admin decide (FR-012). */
    sendSignupDecisionResult(params: { to: string; approved: boolean }): Promise<void>;
}

/** Direto no endpoint HTTP em vez do SDK `resend`: evita o bundle size do cold start. */
export class ResendMailer implements Mailer {
    constructor(
        private readonly apiKey: string,
        private readonly fromEmail: string,
    ) {}

    private async send(params: { to: string; subject: string; text: string; logKey: string }): Promise<void> {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: this.fromEmail,
                to: params.to,
                subject: params.subject,
                text: params.text,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            // Sem retry/dead-letter (Cloudflare Queues exige plano pago). O log
            // nunca inclui o corpo do email, que pode carregar um link-credencial.
            const body = await response.text().catch(() => "");
            logger.error(`mailer.${params.logKey}.failed`, {
                status: response.status,
                body: body.slice(0, 200),
            });
            throw new Error(`Resend respondeu ${response.status}`);
        }

        logger.info(`mailer.${params.logKey}.sent`, {});
    }

    async sendPasswordResetEmail({ to, resetUrl }: { to: string; resetUrl: string }): Promise<void> {
        await this.send({
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
            logKey: "password_reset",
        });
    }

    async sendSignupApprovalRequest({
        to,
        memberName,
        memberStatusLabel,
        reviewUrl,
    }: {
        to: string;
        memberName: string;
        memberStatusLabel: string;
        reviewUrl: string;
    }): Promise<void> {
        await this.send({
            to,
            subject: `Solicitação de cadastro — ${memberName}`,
            text: [
                `${memberName} (${memberStatusLabel}) solicitou acesso à plataforma da CIMATEC jr.`,
                "",
                `Veja os detalhes e decida: ${reviewUrl}`,
                "",
                "Abrir o link não aprova nem recusa nada — a decisão é feita na tela, e exige login.",
                "O link vale por 7 dias. Depois disso, a solicitação continua disponível no painel administrativo.",
            ].join("\n"),
            logKey: "signup_approval_request",
        });
    }

    async sendSignupDecisionResult({ to, approved }: { to: string; approved: boolean }): Promise<void> {
        await this.send({
            to,
            subject: approved
                ? "Seu cadastro foi aprovado — CIMATEC jr"
                : "Sobre sua solicitação de cadastro — CIMATEC jr",
            text: approved
                ? [
                      "Seu cadastro na plataforma da CIMATEC jr foi aprovado.",
                      "",
                      "Você já pode entrar com o email e a senha que cadastrou.",
                  ].join("\n")
                : [
                      "Sua solicitação de cadastro na plataforma da CIMATEC jr não foi aprovada desta vez.",
                      "",
                      "Você pode enviar uma nova solicitação quando quiser.",
                  ].join("\n"),
            logKey: "signup_decision_result",
        });
    }
}
