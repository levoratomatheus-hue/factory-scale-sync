
-- Create ordens table
CREATE TABLE public.ordens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lote TEXT NOT NULL,
  produto TEXT NOT NULL,
  quantidade NUMERIC NOT NULL,
  linha INTEGER NOT NULL,
  balanca INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Em Aberto',
  data_programacao DATE NOT NULL,
  data_conclusao TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create historico table
CREATE TABLE public.historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_id UUID REFERENCES public.ordens(id) ON DELETE CASCADE NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  alterado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ordens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required per spec)
CREATE POLICY "Allow all select on ordens" ON public.ordens FOR SELECT USING (true);
CREATE POLICY "Allow all insert on ordens" ON public.ordens FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on ordens" ON public.ordens FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on ordens" ON public.ordens FOR DELETE USING (true);

CREATE POLICY "Allow all select on historico" ON public.historico FOR SELECT USING (true);
CREATE POLICY "Allow all insert on historico" ON public.historico FOR INSERT WITH CHECK (true);

-- Enable realtime on ordens
ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens;
