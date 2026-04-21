CREATE TABLE IF NOT EXISTS public.registros_diarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_id UUID NOT NULL REFERENCES public.ordens(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  registro_producao JSONB,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.registros_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registros_diarios_public" ON public.registros_diarios
  FOR ALL USING (true) WITH CHECK (true);
