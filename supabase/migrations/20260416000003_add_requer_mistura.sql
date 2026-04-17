ALTER TABLE ordens
  ADD COLUMN IF NOT EXISTS requer_mistura boolean NOT NULL DEFAULT true;
