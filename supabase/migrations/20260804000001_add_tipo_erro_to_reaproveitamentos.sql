-- Adiciona campo tipo_erro à tabela reaproveitamentos
-- Valores: 'producao' | 'comercial' | NULL (registros antigos sem classificação)

ALTER TABLE reaproveitamentos
  ADD COLUMN IF NOT EXISTS tipo_erro TEXT
    CHECK (tipo_erro IN ('producao', 'comercial'));
