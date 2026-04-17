ALTER TABLE public.ordens DROP CONSTRAINT IF EXISTS ordens_status_check;

ALTER TABLE public.ordens
  ADD CONSTRAINT ordens_status_check
  CHECK (status IN (
    'pendente',
    'em_pesagem',
    'aguardando_mistura',
    'em_mistura',
    'aguardando_linha',
    'em_linha',
    'aguardando_liberacao',
    'concluido'
  ));
