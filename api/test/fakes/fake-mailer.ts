import type { Mailer, SendOtcEmailParams } from "../../src/lib/mailer";

/**
 * Mailer de teste: nunca chama o Resend de verdade. Captura os emails
 * "enviados" para que o teste possa extrair o código em texto plano
 * (o único lugar onde ele existe fora do hash) e simular confirmação.
 */
export class FakeMailer implements Mailer {
    readonly sent: SendOtcEmailParams[] = [];

    async sendOtcEmail(params: SendOtcEmailParams): Promise<void> {
        this.sent.push(params);
    }

    lastCode(): string {
        const last = this.sent.at(-1);
        if (!last) throw new Error("FakeMailer: nenhum email enviado ainda");
        return last.code;
    }
}
