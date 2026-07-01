-- Atualiza a constraint de motivo para incluir reuniao e outros
ALTER TABLE public.paradas DROP CONSTRAINT IF EXISTS paradas_motivo_check;
ALTER TABLE public.paradas ADD CONSTRAINT paradas_motivo_check
  CHECK (motivo IN ('manutencao','sem_material','problema_processo','falta_energia','reuniao','outros'));
