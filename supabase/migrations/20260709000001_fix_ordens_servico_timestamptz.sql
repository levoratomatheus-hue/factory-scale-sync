-- Converte colunas de timestamp para timestamptz em ordens_servico
-- Garante que os valores já armazenados (que estão em UTC) sejam interpretados como UTC
ALTER TABLE public.ordens_servico
  ALTER COLUMN aberta_em   TYPE TIMESTAMPTZ USING aberta_em   AT TIME ZONE 'UTC',
  ALTER COLUMN iniciado_em TYPE TIMESTAMPTZ USING iniciado_em AT TIME ZONE 'UTC',
  ALTER COLUMN concluido_em TYPE TIMESTAMPTZ USING concluido_em AT TIME ZONE 'UTC';
