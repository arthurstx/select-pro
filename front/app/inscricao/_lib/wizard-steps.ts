/**
 * Rótulos e ordem das 6 etapas do wizard de inscrição (FEAT-0001-UI v2.0,
 * seção 3). Fonte única para o stepper visual — cada página de etapa importa
 * o `number` correspondente para indicar ao <WizardStepper /> qual destacar.
 */
export const WIZARD_STEPS = [
  { number: 1, label: "Dados Pessoais", path: "/inscricao" },
  { number: 2, label: "Como conheceu", path: "/inscricao/como-conheceu" },
  { number: 3, label: "Movimento EJ", path: "/inscricao/movimento-ej" },
  { number: 4, label: "Sobre você", path: "/inscricao/sobre-voce" },
  { number: 5, label: "Disponibilidade", path: "/inscricao/disponibilidade" },
  { number: 6, label: "Finalização", path: "/inscricao/finalizacao" },
] as const;

export type WizardStepNumber = (typeof WIZARD_STEPS)[number]["number"];
