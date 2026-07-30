-- Peças avulsas registradas em texto livre em uma OS de manutenção
-- Não vinculadas ao estoque — não geram movimentação de estoque
CREATE TABLE IF NOT EXISTS public.pecas_avulsas_os (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id      UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  descricao  TEXT NOT NULL,
  criado_por TEXT,
  criado_em  TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.pecas_avulsas_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pecas_avulsas_os_public" ON public.pecas_avulsas_os
  FOR ALL USING (true) WITH CHECK (true);
