CREATE TABLE IF NOT EXISTS public.inf_lab_fixa (
  formula_id TEXT PRIMARY KEY,
  texto TEXT NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.inf_lab_fixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage inf_lab_fixa"
  ON public.inf_lab_fixa FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
