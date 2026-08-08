/** Rotas das telas de auth (FEAT-0003-UI, seção 3). */
export const AUTH_ROUTES = {
  login: "/login",
  register: "/cadastro",
  forgotPassword: "/recuperar-senha",
  resetPassword: "/redefinir-senha",
  /** Página ainda inexistente — o link é posicionado agora (seção 12). */
  privacy: "/privacidade",
} as const;

/**
 * Destino após cadastro e login. A área logada em si pertence a outras specs;
 * hoje aponta para um placeholder que serve de porta de entrada.
 */
export const AFTER_LOGIN_ROUTE = "/painel";

/**
 * Avisos que uma tela deixa para o `/login` via query string — o que a seção
 * 4.4 chama de "navega para /login com um aviso".
 */
export const LOGIN_NOTICE_PARAM = "aviso";

export const LoginNotice = {
  SESSION_EXPIRED: "sessao-expirada",
  PASSWORD_CHANGED: "senha-alterada",
} as const;

export type LoginNotice = (typeof LoginNotice)[keyof typeof LoginNotice];

export function loginWithNotice(notice: LoginNotice): string {
  return `${AUTH_ROUTES.login}?${LOGIN_NOTICE_PARAM}=${notice}`;
}
