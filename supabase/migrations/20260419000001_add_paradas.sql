CREATE TABLE IF NOT EXISTS public.paradas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  linha INTEGER NOT NULL,
  data DATE NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN ('manutencao','sem_material','problema_processo','falta_energia')),
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.paradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage paradas"
  ON public.paradas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
