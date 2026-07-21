-- Tabela de consumo de matéria-prima (retiradas do laboratório)
create table if not exists consumo_mp (
  id             uuid        primary key default gen_random_uuid(),
  cod_mp_excel   text        not null,
  materia_prima  text        not null,
  quantidade_kg  numeric     not null check (quantidade_kg > 0),
  data_retirada  date        not null default current_date,
  observacao     text,
  retirado_por   text        not null,
  criado_em      timestamptz not null default now()
);

alter table consumo_mp enable row level security;

create policy "consumo_mp_public_all"
  on consumo_mp for all
  using (true)
  with check (true);

comment on table consumo_mp is 'Retiradas de matéria-prima registradas pelo laboratório/desenvolvimento';
