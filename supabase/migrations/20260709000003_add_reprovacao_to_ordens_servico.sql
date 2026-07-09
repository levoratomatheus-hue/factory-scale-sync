-- Adiciona campos de reprovação à tabela ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT,
  ADD COLUMN IF NOT EXISTS reprovada_em      TIMESTAMPTZ;
