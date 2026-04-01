CREATE TABLE public.cadastro_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote bigint NOT NULL UNIQUE,
  produto text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  classe text DEFAULT '',
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.cadastro_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on cadastro_lotes" ON public.cadastro_lotes FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert on cadastro_lotes" ON public.cadastro_lotes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update on cadastro_lotes" ON public.cadastro_lotes FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete on cadastro_lotes" ON public.cadastro_lotes FOR DELETE TO public USING (true);