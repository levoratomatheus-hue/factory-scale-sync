-- Adiciona coluna contou_volume em registros_diarios
-- Semântica:
--   reprovado = false                          → aprovado (conta volume e kg/h)
--   reprovado = true, contou_volume = false    → reprovação normal (não conta em nada, OP volta pra linha)
--   reprovado = true, contou_volume = true     → reprovado contando volume (conta no volume total, NÃO no kg/h, OP conclui)
ALTER TABLE public.registros_diarios
  ADD COLUMN IF NOT EXISTS contou_volume BOOLEAN NOT NULL DEFAULT false;
