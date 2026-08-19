-- Saldo e mínimo por matéria-prima (uma linha por MP)
CREATE TABLE IF NOT EXISTS estoque_mp (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_mp_excel  TEXT NOT NULL UNIQUE,          -- casa com mp_depara.cod_excel
  materia_prima TEXT NOT NULL,                 -- nome (referência)
  saldo_kg      NUMERIC NOT NULL DEFAULT 0,
  minimo_kg     NUMERIC NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT now()
);

-- Histórico de todas as movimentações
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_mp_excel  TEXT NOT NULL,
  materia_prima TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('entrada','saida','estorno','ajuste','saldo_inicial')),
  quantidade_kg NUMERIC NOT NULL,              -- positivo entra, negativo sai
  saldo_apos    NUMERIC,                       -- saldo após a movimentação (para auditoria)
  ordem_id      UUID,                          -- quando a movimentação vem de uma OP
  ordem_lote    TEXT,
  observacao    TEXT,
  criado_por    TEXT,
  criado_em     TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_cod   ON estoque_movimentacoes(cod_mp_excel);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_ordem ON estoque_movimentacoes(ordem_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_data  ON estoque_movimentacoes(criado_em);
