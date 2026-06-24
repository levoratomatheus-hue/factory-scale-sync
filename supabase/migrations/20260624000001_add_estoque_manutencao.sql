-- Itens do estoque de manutenção
CREATE TABLE IF NOT EXISTS public.estoque_manutencao (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome           TEXT NOT NULL,
  codigo         TEXT,
  unidade        TEXT NOT NULL DEFAULT 'un',
  quantidade_atual  NUMERIC NOT NULL DEFAULT 0,
  quantidade_minima NUMERIC NOT NULL DEFAULT 0,
  localizacao    TEXT,
  criado_em      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.estoque_manutencao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque_manutencao_public" ON public.estoque_manutencao
  FOR ALL USING (true) WITH CHECK (true);

-- Histórico de movimentações do estoque
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id     UUID NOT NULL REFERENCES public.estoque_manutencao(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade  NUMERIC NOT NULL,
  motivo      TEXT,
  os_id       UUID,
  criado_por  TEXT,
  criado_em   TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque_movimentacoes_public" ON public.estoque_movimentacoes
  FOR ALL USING (true) WITH CHECK (true);
