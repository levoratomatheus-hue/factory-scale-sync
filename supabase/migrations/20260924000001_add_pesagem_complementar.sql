-- Registra a quantidade que foi efetivamente pesada ao concluir a pesagem.
-- Permite detectar se a OP precisa de pesagem complementar quando a quantidade aumentar depois.
ALTER TABLE ordens ADD COLUMN IF NOT EXISTS quantidade_pesada NUMERIC;

-- Flag que indica que a quantidade aumentou após a pesagem e há material extra a pesar.
ALTER TABLE ordens ADD COLUMN IF NOT EXISTS pesagem_complementar_pendente BOOLEAN NOT NULL DEFAULT false;
