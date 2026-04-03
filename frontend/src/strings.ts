/**
 * All player-facing strings in pt-BR.
 * Admin panel uses English — it's developer-facing.
 */
export const pt = {
  // Status labels
  status: {
    waiting_payment: "Aguardando pagamento",
    active: "Ativo",
    cashed_out: "Encerrado",
  },

  // Join page
  join: {
    title: "Entrar na Mesa",
    nameLabel: "Nome",
    namePlaceholder: "Seu nome",
    phoneLabel: "Telefone",
    phonePlaceholder: "(11) 99999-9999",
    submit: "Entrar na Mesa",
    welcomeBack: (name: string) => `Bem-vindo de volta, ${name}!`,
    sessionClosed: "Esta sessão foi encerrada",
    sessionNotFound: "Sessão não encontrada",
    phoneError: "Telefone deve ter 10 ou 11 dígitos (com DDD)",
    nameError: "Nome deve ter pelo menos 2 caracteres",
  },

  // Player page
  player: {
    chipsIn: "Fichas compradas",
    rebuys: "Rebuys",
    rebuyButton: "Rebuy",
    pixTitle: "Pague com Pix",
    copyCode: "Copiar código",
    copied: "Copiado!",
    waitingPayment: "Aguardando confirmação do pagamento...",
    paymentExpired: "Pagamento expirado",
    generateNew: "Gerar novo QR",
    sessionClosed: "Sessão encerrada. Obrigado por jogar!",
    invalidLink: "Link inválido. Escaneie o QR code novamente.",
    transactionHistory: "Histórico",
    paymentUnavailable: "Serviço de pagamento indisponível. Tente novamente.",
  },

  // TV Lobby
  tv: {
    scanToJoin: "Escaneie para entrar",
    players: "Jogadores",
    noPlayers: "Aguardando jogadores...",
    reconnecting: "Reconectando...",
  },

  // Transaction types
  txType: {
    buy_in: "Buy-in",
    rebuy: "Rebuy",
    cash_out: "Cashout",
  },

  // Payment methods
  paymentMethod: {
    pix: "Pix",
    cash: "Dinheiro",
  },

  // General
  loading: "Carregando...",
  error: "Ocorreu um erro. Tente novamente.",
  currency: (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
};
