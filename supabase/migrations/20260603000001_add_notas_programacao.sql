create table if not exists notas_programacao (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  cor text not null default 'amarelo',
  data date null,
  criado_em timestamptz default now()
);

alter table notas_programacao enable row level security;

create policy "allow all" on notas_programacao for all using (true) with check (true);
