-- Habilita Realtime nas tabelas do módulo de manutenção
ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_servico;
ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque_manutencao;
ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque_movimentacoes;
