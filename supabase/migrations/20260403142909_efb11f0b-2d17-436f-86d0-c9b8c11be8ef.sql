
CREATE TABLE public.perfis (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'operador' CHECK (papel IN ('gestor', 'operador')),
  balanca INTEGER,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on perfis" ON public.perfis FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert on perfis" ON public.perfis FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update on perfis" ON public.perfis FOR UPDATE TO public USING (true);
