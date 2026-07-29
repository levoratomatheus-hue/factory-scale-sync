-- Tabela de controle de matéria-prima testada (laboratório)
create table if not exists mp_testadas (
  id              uuid        primary key default gen_random_uuid(),
  pigmento_zc     text        not null,
  codigo_cliente  text,
  fornecedor      text,
  data_teste      date,
  lote            text,
  situacao        text        not null default 'aguardando'
                  check (situacao in ('aprovado', 'reprovado', 'observacao', 'aguardando')),
  motivo          text,
  criado_por      text,
  criado_em       timestamptz not null default now()
);

alter table mp_testadas enable row level security;

create policy "mp_testadas_public_all"
  on mp_testadas for all using (true) with check (true);

-- Índices para buscas mais comuns
create index if not exists mp_testadas_situacao_idx   on mp_testadas (situacao);
create index if not exists mp_testadas_fornecedor_idx on mp_testadas (fornecedor);
create index if not exists mp_testadas_data_teste_idx on mp_testadas (data_teste desc);

comment on table mp_testadas is 'Controle de matérias-primas testadas pelo laboratório por fornecedor/cliente';
