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
