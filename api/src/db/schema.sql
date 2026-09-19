-- Esquema do banco de gastos. Executado a cada boot (idempotente).

CREATE TABLE IF NOT EXISTS gastos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  valor             REAL    NOT NULL CHECK (valor > 0),
  categoria         TEXT    NOT NULL,
  descricao         TEXT,
  mensagem_original TEXT    NOT NULL,
  data_gasto        TEXT    NOT NULL,  -- YYYY-MM-DD (America/Sao_Paulo)
  criado_em         TEXT    NOT NULL   -- ISO 8601
);

-- Consultas por mes usam substr(data_gasto,1,7); indice ajuda no ORDER/filtro.
CREATE INDEX IF NOT EXISTS idx_gastos_data ON gastos (data_gasto);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos (categoria);

CREATE TABLE IF NOT EXISTS orcamentos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_referencia TEXT    NOT NULL UNIQUE,  -- YYYY-MM
  valor_total    REAL    NOT NULL CHECK (valor_total >= 0)
);

CREATE TABLE IF NOT EXISTS limites_categoria (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria      TEXT    NOT NULL,
  mes_referencia TEXT    NOT NULL,
  valor_limite   REAL    NOT NULL CHECK (valor_limite >= 0),
  UNIQUE (categoria, mes_referencia)
);

-- ---------------------------------------------------------------------------
-- Renda, contas fixas e parcelamentos.
-- O orcamento do mes nao e um numero unico: ele se decompoe em renda,
-- comprometido (contas fixas + parcelas) e gasto livre.
-- ---------------------------------------------------------------------------

-- Entradas do mes. Mais de uma por mes e permitido (salario + freela).
CREATE TABLE IF NOT EXISTS rendas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_referencia TEXT    NOT NULL,               -- YYYY-MM
  descricao      TEXT    NOT NULL,
  valor          REAL    NOT NULL CHECK (valor > 0),
  criado_em      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rendas_mes ON rendas (mes_referencia);

-- Obrigacao recorrente. Nao gera linha em `gastos`: e compromisso, nao gasto
-- pontual. Recorre todo mes enquanto ativa = 1.
CREATE TABLE IF NOT EXISTS contas_fixas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao      TEXT    NOT NULL,
  valor          REAL    NOT NULL CHECK (valor > 0),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  categoria      TEXT    NOT NULL,
  ativa          INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
  criado_em      TEXT    NOT NULL
);

-- Compra parcelada. As parcelas NAO sao materializadas como linhas: quais
-- parcelas incidem em cada mes e calculado sob demanda a partir de
-- mes_inicio + parcela_inicial + total_parcelas. Assim, corrigir o cadastro
-- recalcula o historico inteiro e a parcela para de contar sozinha no fim.
CREATE TABLE IF NOT EXISTS parcelamentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao       TEXT    NOT NULL,
  valor_parcela   REAL    NOT NULL CHECK (valor_parcela > 0),
  total_parcelas  INTEGER NOT NULL CHECK (total_parcelas > 0),
  -- Parcela correspondente a mes_inicio (permite cadastrar algo em andamento:
  -- ja paguei 8 de 12, cadastro comecando em 9).
  parcela_inicial INTEGER NOT NULL CHECK (parcela_inicial > 0),
  mes_inicio      TEXT    NOT NULL,              -- YYYY-MM da parcela_inicial
  categoria       TEXT    NOT NULL,
  criado_em       TEXT    NOT NULL,
  CHECK (parcela_inicial <= total_parcelas)
);

-- ---------------------------------------------------------------------------
-- Configuracao editavel em tempo de execucao.
-- O .env continua sendo o padrao de fabrica; o que estiver aqui vence.
-- Guardado como chave/valor texto porque sao poucas chaves e elas mudam
-- raramente -- uma tabela por assunto seria mais cerimonia que beneficio.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Caixinhas: divisao LOGICA da sobra do ciclo entre objetivos.
-- Nenhum dinheiro se move. O saldo fisico fica todo numa unica Caixinha Turbo
-- do Nubank; estas linhas so dizem quanto dele pertence a cada objetivo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objetivos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  -- A reserva de emergencia e unica e nunca guarda meta: a dela e calculada a
  -- cada leitura a partir das despesas medias, entao acompanha o custo de vida.
  e_reserva   INTEGER NOT NULL DEFAULT 0 CHECK (e_reserva IN (0, 1)),
  valor_meta  REAL    CHECK (valor_meta IS NULL OR valor_meta > 0),  -- null = sem meta
  saldo_atual REAL    NOT NULL DEFAULT 0 CHECK (saldo_atual >= 0),
  -- Peso na divisao da parte que nao vai para a reserva. Null = sem preferencia.
  peso        REAL    CHECK (peso IS NULL OR peso >= 0),
  criado_em   TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_objetivos_uma_reserva ON objetivos (e_reserva) WHERE e_reserva = 1;

-- A reserva existe desde o primeiro boot: a regra de divisao depende dela.
INSERT INTO objetivos (nome, e_reserva, criado_em)
SELECT 'Reserva de emergência', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM objetivos WHERE e_reserva = 1);

-- Uma divisao por ciclo: dividir a mesma sobra duas vezes inventaria dinheiro.
CREATE TABLE IF NOT EXISTS alocacoes_mensais (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_referencia TEXT    NOT NULL UNIQUE,  -- YYYY-MM do ciclo cuja sobra foi dividida
  total_sobra    REAL    NOT NULL CHECK (total_sobra > 0),
  criado_em      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS alocacao_divisoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  alocacao_id   INTEGER NOT NULL REFERENCES alocacoes_mensais (id) ON DELETE CASCADE,
  -- SET NULL + nome copiado: apagar um objetivo nao apaga o historico.
  objetivo_id   INTEGER REFERENCES objetivos (id) ON DELETE SET NULL,
  objetivo_nome TEXT    NOT NULL,
  percentual    REAL    NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  valor         REAL    NOT NULL CHECK (valor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_alocacao_divisoes_alocacao ON alocacao_divisoes (alocacao_id);

-- ---------------------------------------------------------------------------
-- Vocabulario aprendido: como o usuario chama as coisas.
-- Cada correcao de categoria feita no app grava o termo da mensagem original
-- ("halls" -> alimentacao). O atalho consulta esta tabela ANTES da lista fixa
-- de termos, entao a correcao do usuario sempre vence o palpite do codigo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vocabulario (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  termo         TEXT    NOT NULL UNIQUE,   -- minusculo, sem acento, sem numero
  categoria     TEXT    NOT NULL,
  descricao     TEXT,                      -- descricao gravada no gasto; null = o proprio termo
  origem        TEXT    NOT NULL CHECK (origem IN ('edicao', 'manual')),
  vezes         INTEGER NOT NULL DEFAULT 1, -- quantas vezes o usuario confirmou/corrigiu
  usos          INTEGER NOT NULL DEFAULT 0, -- quantos lancamentos ele ja resolveu
  criado_em     TEXT    NOT NULL,
  atualizado_em TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
-- Registro do consultor: cada pergunta, o que foi entendido dela e a resposta.
-- Pergunta marcada como errada vira caso de teste (ver casos-reclamados.js).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pergunta    TEXT    NOT NULL,
  mes         TEXT    NOT NULL,
  tipo        TEXT    NOT NULL,             -- compra | geral
  valor       REAL,
  parcelas    INTEGER,
  reserva     REAL,
  veredito    TEXT    NOT NULL,
  texto       TEXT,                         -- null enquanto a resposta e escrita
  analise     TEXT    NOT NULL,             -- JSON completo, para reproduzir o caso
  nota        INTEGER CHECK (nota IS NULL OR nota IN (-1, 1)),
  comentario  TEXT,
  criado_em   TEXT    NOT NULL,
  avaliado_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_consultas_nota ON consultas (nota);

-- ---------------------------------------------------------------------------
-- Passkeys (Face ID / Touch ID). Cada linha e um aparelho (ou chaveiro do
-- iCloud) autorizado a entrar sem senha. So a chave publica fica aqui.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passkeys (
  id            TEXT    PRIMARY KEY,        -- credential id, base64url
  chave_publica BLOB    NOT NULL,           -- COSE, como o autenticador entregou
  contador      INTEGER NOT NULL DEFAULT 0,
  transportes   TEXT,                       -- JSON, ex.: ["internal","hybrid"]
  nome          TEXT    NOT NULL,           -- rotulo para reconhecer na lista
  criado_em     TEXT    NOT NULL,
  usado_em      TEXT
);
