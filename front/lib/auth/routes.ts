export const AUTH_ROUTES = {
  login: "/login",
  register: "/cadastro",
  forgotPassword: "/recuperar-senha",
  resetPassword: "/redefinir-senha",
  privacy: "/privacidade",
} as const;

/** Destino após cadastro e login. */
export const AFTER_LOGIN_ROUTE = "/painel";

/** Avisos que uma tela deixa para o `/login` via query string. */
export const LOGIN_NOTICE_PARAM = "aviso";

export const LoginNotice = {
  SESSION_EXPIRED: "sessao-expirada",
  PASSWORD_CHANGED: "senha-alterada",
} as const;

export type LoginNotice = (typeof LoginNotice)[keyof typeof LoginNotice];

export function loginWithNotice(notice: LoginNotice): string {
  return `${AUTH_ROUTES.login}?${LOGIN_NOTICE_PARAM}=${notice}`;
}
