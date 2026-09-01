-- Tabela de materiais provenientes por SDR (suporta múltiplos materiais de origem)
create table if not exists reaproveitamentos_materiais (
  id                      uuid    primary key default gen_random_uuid(),
  reaproveitamento_id     uuid    not null references reaproveitamentos(id) on delete cascade,
  sequencia               integer not null default 1,
  produto_origem          text    not null,
  formula_id_origem       text,
  quantidade_material     numeric not null check (quantidade_material > 0),
  quantidade_utilizada    numeric check (quantidade_utilizada > 0),
  percentual_reaproveitado numeric not null check (percentual_reaproveitado > 0 and percentual_reaproveitado <= 100),
  criado_em               timestamptz not null default now()
);

alter table reaproveitamentos_materiais enable row level security;

create policy "reaproveitamentos_materiais_public_all"
  on reaproveitamentos_materiais for all using (true) with check (true);

comment on table reaproveitamentos_materiais is 'Materiais provenientes de cada SDR — um SDR pode ter N origens';

-- Migração dos dados existentes: move o material único dos campos da tabela
-- reaproveitamentos para a nova tabela reaproveitamentos_materiais
insert into reaproveitamentos_materiais
  (reaproveitamento_id, sequencia, produto_origem, formula_id_origem, quantidade_material, quantidade_utilizada, percentual_reaproveitado)
select
  id,
  1,
  produto_origem,
  formula_id_origem,
  quantidade_material,
  quantidade_utilizada,
  percentual_reaproveitado
from reaproveitamentos
where produto_origem is not null
  and percentual_reaproveitado is not null
  and quantidade_material > 0;
