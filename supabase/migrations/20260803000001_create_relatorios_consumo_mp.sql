-- Tabela principal: cabeçalho do relatório salvo
create table if not exists relatorios_consumo_mp (
  id          uuid primary key default gen_random_uuid(),
  titulo      text,
  data_inicio date not null,
  data_fim    date not null,
  setor       text not null,          -- 'laboratorio' | 'producao' | 'ambos'
  total_kg    numeric(14,3) not null,
  num_mps     integer not null,
  criado_por  text not null,
  criado_em   timestamptz not null default now()
);

-- Tabela de itens congelados: uma linha por matéria-prima × setor
-- Quando o relatório usa filtro 'ambos', lab e prod ficam em linhas separadas
create table if not exists relatorios_consumo_mp_itens (
  id            uuid primary key default gen_random_uuid(),
  relatorio_id  uuid not null references relatorios_consumo_mp(id) on delete cascade,
  materia_prima text not null,
  cod_mp_excel  text not null,
  cod_tid       text,
  total_kg      numeric(14,3) not null,
  percentual    numeric(10,6) not null,
  setor         text not null          -- setor desta linha: 'laboratorio' | 'producao' | 'ambos'
);

-- RLS: acesso público (mesma política das outras tabelas do projeto)
alter table relatorios_consumo_mp enable row level security;
alter table relatorios_consumo_mp_itens enable row level security;

create policy "public_all_relatorios_consumo_mp"
  on relatorios_consumo_mp for all using (true) with check (true);

create policy "public_all_relatorios_consumo_mp_itens"
  on relatorios_consumo_mp_itens for all using (true) with check (true);

-- Índices úteis
create index if not exists idx_relatorios_consumo_mp_criado_em
  on relatorios_consumo_mp (criado_em desc);

create index if not exists idx_relatorios_consumo_mp_itens_relatorio
  on relatorios_consumo_mp_itens (relatorio_id);
