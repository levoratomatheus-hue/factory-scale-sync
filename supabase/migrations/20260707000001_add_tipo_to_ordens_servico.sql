-- Add tipo column to ordens_servico
-- Values: 'preventiva' | 'corretiva', default 'corretiva'
ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'corretiva'
    CHECK (tipo IN ('preventiva', 'corretiva'));
