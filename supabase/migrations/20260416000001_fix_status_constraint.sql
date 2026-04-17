-- Drop the old check constraint that only allowed legacy status values
ALTER TABLE public.ordens DROP CONSTRAINT IF EXISTS ordens_status_check;

-- Add new constraint with the full snake_case status flow
ALTER TABLE public.ordens
  ADD CONSTRAINT ordens_status_check
  CHECK (status IN (
    'pendente',
    'em_pesagem',
    'aguardando_mistura',
    'em_mistura',
    'aguardando_linha',
    'em_linha',
    'concluido'
  ));
