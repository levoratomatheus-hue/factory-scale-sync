-- Marca OPs concluídas diretamente da Pré-Programação (sem produção medida)
-- Essas OPs não entram nos cálculos de kg/hora e produtividade do Painel de Análises
ALTER TABLE ordens ADD COLUMN IF NOT EXISTS conclusao_direta boolean NOT NULL DEFAULT false;
