-- Adiciona colunas para manutenção externa (terceiros) em ordens_servico
ALTER TABLE ordens_servico
  ADD COLUMN IF NOT EXISTS externa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS empresa_externa text,
  ADD COLUMN IF NOT EXISTS contato_externo text,
  ADD COLUMN IF NOT EXISTS prazo_retorno date;
