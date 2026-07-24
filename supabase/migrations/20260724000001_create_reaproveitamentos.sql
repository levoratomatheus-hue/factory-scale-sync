-- Sequência para código SDR
create sequence if not exists reaproveitamentos_codigo_seq start 1;

-- Função que gera o próximo código SDR-NNN
create or replace function next_sdr_code()
returns text language sql volatile as $$
  select 'SDR-' || lpad(nextval('reaproveitamentos_codigo_seq')::text, 3, '0')
$$;

-- Tabela principal de reaproveitamentos
create table if not exists reaproveitamentos (
  id            uuid        primary key default gen_random_uuid(),
  codigo        text        not null unique default next_sdr_code(),
  produto       text        not null,
  formula_id    text,
  quantidade_kg numeric     not null check (quantidade_kg > 0),
  status        text        not null default 'pendente' check (status in ('pendente', 'utilizado')),
  observacao    text,
  criado_por    text        not null,
  criado_em     timestamptz not null default now(),
  utilizado_em  timestamptz,
  utilizado_por text
);

-- Itens da fórmula de cada reaproveitamento
create table if not exists reaproveitamentos_itens (
  id                    uuid    primary key default gen_random_uuid(),
  reaproveitamento_id   uuid    not null references reaproveitamentos(id) on delete cascade,
  sequencia             integer not null,
  materia_prima         text    not null,
  cod_mp_excel          text,
  percentual            numeric not null check (percentual > 0),
  material_reaproveitado boolean not null default false
);

alter table reaproveitamentos       enable row level security;
alter table reaproveitamentos_itens enable row level security;

create policy "reaproveitamentos_public_all"
  on reaproveitamentos for all using (true) with check (true);

create policy "reaproveitamentos_itens_public_all"
  on reaproveitamentos_itens for all using (true) with check (true);

comment on table reaproveitamentos       is 'SDRs — Solicitações de Desenvolvimento/Reaproveitamento de material';
comment on table reaproveitamentos_itens is 'Itens da fórmula de cada SDR (percentuais gravados; kg calculados na exibição)';
