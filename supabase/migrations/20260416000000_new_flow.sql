
-- 1. Create ordens_formula table (custom quantities per order, used only in pesagem)
CREATE TABLE public.ordens_formula (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_id UUID NOT NULL REFERENCES public.ordens(id) ON DELETE CASCADE,
  sequencia INTEGER,
  materia_prima TEXT NOT NULL,
  quantidade_kg NUMERIC NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.ordens_formula ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on ordens_formula" ON public.ordens_formula FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Change perfis.balanca from INTEGER to TEXT to support 'mistura', 'linha1', etc.
ALTER TABLE public.perfis ALTER COLUMN balanca TYPE TEXT USING balanca::TEXT;

-- 3. Update ordens default status to new snake_case value
ALTER TABLE public.ordens ALTER COLUMN status SET DEFAULT 'pendente';

-- 4. Migrate existing status values to new snake_case format
UPDATE public.ordens SET status = 'pendente'        WHERE status = 'Em Aberto';
UPDATE public.ordens SET status = 'em_pesagem'      WHERE status = 'Em Pesagem';
UPDATE public.ordens SET status = 'concluido'       WHERE status = 'Concluído';

-- 5. Migrate historico records
UPDATE public.historico SET status_anterior = 'pendente'   WHERE status_anterior = 'Em Aberto';
UPDATE public.historico SET status_anterior = 'em_pesagem' WHERE status_anterior = 'Em Pesagem';
UPDATE public.historico SET status_anterior = 'concluido'  WHERE status_anterior = 'Concluído';
UPDATE public.historico SET status_novo = 'pendente'       WHERE status_novo = 'Em Aberto';
UPDATE public.historico SET status_novo = 'em_pesagem'     WHERE status_novo = 'Em Pesagem';
UPDATE public.historico SET status_novo = 'concluido'      WHERE status_novo = 'Concluído';
