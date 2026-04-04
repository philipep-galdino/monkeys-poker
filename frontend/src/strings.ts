/**
 * All strings in pt-BR.
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
    chipsIn: "Valor do Buy-in",
    rebuys: "Total Rebuys (R$)",
    rebuyButton: "Rebuy",
    pixTitle: "Pague com Pix",
    copyCode: "Copiar código",
    copied: "Copiado!",
    waitingPayment: "Aguardando confirmação do pagamento...",
    paymentExpired: "Pagamento expirado",
    generateNew: "Gerar novo QR",
    sessionClosed: "Sessão encerrada. Obrigado por jogar!",
    invalidLink: "Link inválido. Escaneie o QR code novamente.",
    transactionHistory: "Histórico da sessão atual",
    verifyChips: "Verificar minhas fichas",
    totalChipsCount: "Total de Fichas",
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

  // Admin sections
  admin: {
    login: {
      title: "Administração",
      phoneLabel: "Telefone",
      phonePlaceholder: "Seu telefone cadastrado",
      codeLabel: "Código Secreto",
      codePlaceholder: "Sua senha de admin",
      submit: "Entrar",
      loggingIn: "Entrando...",
    },
    clubs: {
      title: "Seus Clubes",
      newClub: "Novo Clube",
      noClubs: "Você ainda não possui clubes.",
      settingsTitle: "Configurações do Clube",
      saveSettings: "Salvar Configurações",
      saving: "Salvando...",
      deleteClub: "Excluir Clube",
    },
    dashboard: {
      title: "Painel da Sessão",
      newSession: "Nova Sessão",
      closeSession: "Encerrar Sessão",
      tvLobby: "Lobby TV",
      noOpenSession: "Nenhuma sessão aberta.",
      createSessionTitle: "Abrir Nova Sessão",
      createSessionSubmit: "Abrir Sessão",
      creating: "Abrindo...",
      sessionLabel: "Nome da Sessão",
      blindsLabel: "Blinds",
      buyinLabel: "Buy-in (R$)",
      rebuyLabel: "Rebuy (R$)",
      tableLimit: "Limite de Jogadores",
      allowRebuys: "Permitir Rebuys",
      summary: {
        players: "Jogadores",
        chipsIn: "Fichas In",
        chipsOut: "Fichas Out",
        discrepancy: "Discrepância",
        rake: "Rake Total",
      },
      playersTable: {
        name: "Nome",
        phone: "Telefone",
        status: "Status",
        chipsIn: "Fichas In",
        chipsOut: "Fichas Out",
        actions: "Ações",
        noPlayers: "Nenhum jogador na mesa ainda.",
      },
      actions: {
        addPlayer: "Adicionar Jogador",
        verifyPayment: "Verificar",
        markCash: "Pago (Dinheiro)",
        cashout: "Cashout",
        history: "Histórico",
      },
    },
    playerHistory: {
      title: "Histórico do Jogador",
      aggregate: {
        totalSessions: "Sessões",
        totalBuyin: "In Total",
        totalCashout: "Out Total",
        netResult: "Saldo Geral",
      },
      table: {
        session: "Sessão",
        date: "Data",
        buyin: "Em Fichas",
        cashout: "Retirada",
        net: "Net",
      }
    },
    settings: {
      allowMultipleBuyins: "Permitir múltiplos buy-ins ao adicionar jogador",
      chipInventory: "Inventário de Fichas",
      addChip: "Adicionar Denominação",
      chipLabel: "Etiqueta",
      chipValue: "Valor",
      chipQty: "Qtd. Total",
      chipActive: "Ativa",
      rakeDefaults: "Padrões de Rake",
      rakeBuyin: "Rake por Buy-in (R$)",
      rakeRebuy: "Rake por Rebuy (R$)",
    },
    modals: {
      addPlayerTitle: "Adicionar Jogador Manualmente",
      cashoutTitle: "Encerrar Participação (Cashout)",
      closeSessionConfirm: "Deseja encerrar esta sessão?",
      closeSessionWarning: "Existem jogadores que ainda não realizaram o cashout.",
      reconciliationTitle: "Resumo de Fechamento",
    }
  },

  // General
  loading: "Carregando...",
  error: "Ocorreu um erro. Tente novamente.",
  currency: (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
};
