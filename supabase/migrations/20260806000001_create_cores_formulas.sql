-- Controle de Cor (CIELAB) — banco de cores por fórmula
CREATE TABLE IF NOT EXISTS cores_formulas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id   TEXT,                 -- fórmula do sistema (opcional; pode ser cor avulsa)
  produto      TEXT NOT NULL,        -- nome/descrição do produto ou cor
  lab_l        NUMERIC NOT NULL,     -- L*
  lab_a        NUMERIC NOT NULL,     -- a*
  lab_b        NUMERIC NOT NULL,     -- b*
  observacao   TEXT,
  criado_por   TEXT,
  criado_em    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cores_formula_id ON cores_formulas(formula_id);
CREATE INDEX IF NOT EXISTS idx_cores_criado_em  ON cores_formulas(criado_em DESC);
