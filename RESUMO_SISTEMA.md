# ZanCollor Produção — Resumo Completo do Sistema

> Atualizado em 24/07/2026. Descreve todas as funcionalidades, fluxos, regras de negócio, estrutura técnica e otimizações realizadas.

---

## 1. Visão Geral

O sistema **ZanCollor Produção** é uma aplicação web de gestão da linha de produção fabril. Ele substitui controles manuais e planilhas, conectando em tempo real todos os pontos da fábrica: pesagem, mistura, linhas de produção, liberação de qualidade, manutenção, comercial e o módulo de compras/consumo de matérias-primas.

**Stack:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase (PostgreSQL + Auth + Realtime)

---

## 2. Perfis de Usuário

O campo `papel` na tabela `perfis` determina o que cada usuário vê e pode fazer.

| Papel | Descrição | Acesso |
|---|---|---|
| `gestor` | Administrador de produção | Acesso completo a todos os painéis |
| `operador` | Operador de chão de fábrica | Apenas a estação atribuída (via campo `balanca`) |
| `tecnico` | Técnico de manutenção | Painel de Manutenção, Abrir OS, Ferramentas |
| `comercial` | Equipe de vendas | Apenas o Painel Comercial (consulta de disponibilidade) |

### Atribuição de estação para `operador`

O campo `balanca` do perfil determina qual tela o operador vê ao fazer login:

| Valor de `balanca` | Tela exibida |
|---|---|
| `'1'` | Painel Balança 1 |
| `'2'` | Painel Balança 2 |
| `'mistura'` | Painel Mistura |
| `'linha1'` a `'linha5'` | Painel Linha 1 a 5 |

---

## 3. Fluxo de Status de uma Ordem de Produção (OP)

O campo `status` da tabela `ordens` controla em qual etapa da produção a OP se encontra. O fluxo depende do flag `requer_mistura`.

```
┌─────────────┐
│   pendente  │  ← OP criada aguardando início
└──────┬──────┘
       │ operador de balança inicia pesagem
┌──────▼──────┐
│ em_pesagem  │
└──────┬──────┘
       │ pesagem concluída
       ├─── requer_mistura = true ──────────────────────┐
       │                                                 │
┌──────▼──────────────┐                      ┌──────────▼──────────┐
│ aguardando_mistura  │                      │  aguardando_linha   │
└──────┬──────────────┘                      └──────────┬──────────┘
       │ operador de mistura inicia                     │
┌──────▼──────┐                                         │
│  em_mistura │                                         │
└──────┬──────┘                                         │
       │ mistura concluída                               │
       └──────────────────────────────────────────────►──┤
                                                         │
                                              ┌──────────▼──────────┐
                                              │      em_linha        │
                                              └──────────┬──────────┘
                                                         │ produção registrada
                                              ┌──────────▼──────────┐
                                              │ aguardando_liberacao │
                                              └──────────┬──────────┘
                                                         │ aprovado pelo gestor
                                              ┌──────────▼──────────┐
                                              │      concluido       │
                                              └─────────────────────┘
```

**Rejeição na liberação:** a OP pode ser reprovada com preenchimento de `motivo_reprovacao`, voltando para análise.

---

## 4. Páginas e Painéis

### 4.1 Login (`Login.tsx`)
- Autenticação via e-mail + senha (Supabase Auth).
- Após login, redireciona para a interface correta conforme o `papel` do usuário.

---

### 4.2 Painel do Gestor (`PainelGestor.tsx`)
**Quem usa:** gestor

Visão geral de tudo que está pendente ou em atraso na produção.

**Seções:**
- **Alerta de OPs de dias anteriores:** lista OPs com `data_programacao < hoje` e status `pendente` ou `aguardando_linha`. Permite reprogramar individualmente para hoje ou outra data escolhida.
- **OPs em atraso:** OPs onde `diasUteis(data_emissao, data_programacao) > 7` e status ≠ `aguardando_liberacao`. Exibe quantos dias de atraso.
- **Lotes pendentes de programação:** lotes em `cadastro_lotes` com status `Em Aberto` que ainda não têm nenhuma OP criada. Botão direto para criar a OP.
- **Ordens Programadas:** tabela de todas as OPs não concluídas com filtro de busca por nome do material em tempo real.

**Filtros:** seletor de data (visualizar o passado ou futuro) + campo de busca por material.

**Tempo real:** Supabase Realtime atualiza automaticamente a lista com debounce de 300ms.

---

### 4.3 Programação de Produção (`PainelProgramacao.tsx`)
**Quem usa:** gestor

Kanban diário com 5 colunas (Linha 1 a 5).

**Funcionalidades:**
- **Drag-and-drop:** reordena OPs dentro da mesma linha ou move entre linhas. A `posicao` é recalculada automaticamente.
- **Clique no card:** abre o dialog de fórmula (ingredientes e quantidades por batelada).
- **Confirmar programação (cadeado):** alterna `programacao_confirmada`. Verde = confirmado; afeta o cálculo de disponibilidade no painel comercial.
- **Reprogramar:** muda a `data_programacao` para outra data.
- **Editar:** abre `EditarOrdemDialog` para alterar produto, linha, balança, marca etc.
- **Registrar Dia:** registra produção parcial do dia com hora início/fim e itens produzidos, avançando a `data_programacao` para o próximo dia útil.
- **Forçar Conclusão:** gestor registra produção diretamente (equivalente ao operador de linha).
- **Obs. Laboratório:** campo de anotações internas.
- **Excluir:** remove apenas o registro do dia ou a OP inteira.
- **Voltar para Fila:** devolve uma OP de `em_linha` para `aguardando_linha`.
- **Notas de programação:** post-its por dia com cores (amarelo, azul, verde, rosa). Persistem em `notas_programacao`.
- **Copiar programação:** move OPs de um dia para outro (por linha ou todas).
- **Paradas:** registro de paradas de linha com motivo e horário.

**Indicadores no card:**
- Badge de status colorido.
- Quantidade produzida no dia (kg) e horário início–fim.
- Destaque vermelho + badge de atraso quando `diasUteis(data_emissao, data_programacao) > 7`.
- Ícone de "aguardando registro" para OPs em linha sem registro do dia.

---

### 4.4 Nova Ordem (`CriarOrdem.tsx`)
**Quem usa:** gestor

Formulário para criar uma nova OP a partir de um lote do cadastro.

**Fluxo:**
1. Buscar lote por número → dados preenchidos automaticamente de `cadastro_lotes` (produto, quantidade, fórmula, tamanho_batelada).
2. Customizar quantidades da fórmula (salvas em `ordens_formula`).
3. Definir: data de programação, linha, balança, marca (Pigma ou Zan Collor), se requer mistura.
4. Adicionar "adições para mistura" (campo `obs`, formato JSON `[{qty, mp}]`).
5. Salvar → OP criada com status `pendente`, posição calculada automaticamente.

**Regra:** não é possível criar duas OPs para o mesmo lote.

---

### 4.5 Painel Balança (`PainelBalanca.tsx`)
**Quem usa:** operador de balança (balança 1 ou 2), gestor

Estação de pesagem. Operador vê apenas as OPs da sua balança.

**Funcionalidades:**
- Lista de OPs na fila (status `pendente` ou `aguardando_linha` para a balança).
- Iniciar pesagem → status muda para `em_pesagem`.
- Exibe a fórmula completa com itens e quantidades calculadas por batelada.
- Exibe adições para mistura (`obs`) e orientações.
- Itens da fórmula com checkbox (controle visual, não persiste no banco).
- Calcular número de bateladas com base em `tamanho_batelada`.
- **Concluir pesagem:**
  - Se `requer_mistura = true` → status vai para `aguardando_mistura`.
  - Se `requer_mistura = false` → status vai para `aguardando_linha`.
- **Imprimir etiqueta** (label da OP).

---

### 4.6 Painel Mistura (`PainelMistura.tsx`)
**Quem usa:** operador de mistura, gestor

Estação de mistura. Só recebe OPs com `requer_mistura = true`.

**Funcionalidades:**
- Fila de OPs com status `aguardando_mistura`.
- Iniciar mistura → status muda para `em_mistura`.
- Exibe fórmula, adições e orientações.
- **Concluir mistura** → status vai para `aguardando_linha` (apenas `status` e `linha` são atualizados; `data_programacao` não é tocada).

---

### 4.7 Painel Linha (`PainelLinha.tsx`)
**Quem usa:** operador de linha (1 a 5), gestor

Estação de produção na linha. Cada operador vê apenas a sua linha.

**Funcionalidades:**
- Fila de OPs com status `aguardando_linha` para a linha do operador.
- Iniciar produção → status muda para `em_linha`, registra `hora_inicio`.
- Registrar fim do dia:
  - Registra `hora_fim`, itens produzidos (bateladas × peso), obs_linha.
  - Cria registro em `registros_diarios`.
  - Avança `data_programacao` para o próximo dia útil (OP continua se não concluída).
  - Se a OP for marcada como concluída → status vai para `aguardando_liberacao`.
- **Paradas de linha:** registra paralisações com motivo (manutenção, sem material, problema de processo, falta de energia), hora início/fim.

---

### 4.8 Painel Liberação (`PainelLiberacao.tsx`)
**Quem usa:** gestor

Controle de qualidade. OPs que terminaram a produção na linha aguardam aprovação aqui.

**Funcionalidades:**
- Lista de OPs com status `aguardando_liberacao`.
- Exibe todos os registros diários da OP (cada dia produzido).
- Exibe paradas que ocorreram na linha durante a produção.
- Editar registros (horários, itens produzidos, quantidade real).
- **Aprovar** → status muda para `concluido`.
- **Reprovar** → preenche `motivo_reprovacao`, status retorna para análise.
- Deletar registros individuais de dias.

---

### 4.9 Histórico (`PainelHistorico.tsx`)
**Quem usa:** gestor

Consulta e edição de OPs concluídas.

**Funcionalidades:**
- Visualização por dia ou por intervalo de datas.
- Edição de `hora_inicio`, `hora_fim`, `quantidade_real`.
- Reabrir OP (volta para `aguardando_liberacao`).
- Totais de quantidade e quantidade real calculados com `useMemo`.

---

### 4.10 Análises de Produção (`PainelAnalises.tsx`)
**Quem usa:** gestor

Dashboard analítico com gráficos de produtividade.

**Indicadores:**
- Produção total do período e média kg/hora geral.
- Cards por linha: kg produzidos, média kg/h, número de OPs.
- Horas por linha: trabalhadas, manutenção, sem material, problema de processo, falta energia, limpeza — com barra de eficiência.
- Gráficos: média kg/h por faixa de OP, volume por faixa, produção mensal (12 meses), produtividade kg/h por mês com linha de meta.
- Tabelas: Top 25 produtos por kg, Top 20 OPs mais repetidas.
- Filtros: período com atalhos rápidos, filtro por linha, autocomplete de produto.

**Suporte a dark mode:** usa `buildPalette(dark)` com MutationObserver para detectar `class="dark"` no `<html>`.

---

### 4.11 Consulta por Fórmula (`PainelConsultaFormula.tsx`)
**Quem usa:** gestor

Busca e exibe o conteúdo completo de uma fórmula pelo `formula_id`.

---

### 4.12 Importar Programação (`ImportarProgramacao.tsx`)
**Quem usa:** gestor

Duas seções independentes de importação:

**Importar Programação (lotes):** arquivo TXT Windows-1252 gerado pelo TID/ERP, separador `;`. Popula `cadastro_lotes` com lote, produto, quantidade, `formula_id`, data de emissão, classe. O `formula_id` tem pontos de milhar removidos automaticamente.

**Importar Fórmulas (TID):** arquivo TXT latin-1, separador `;`, 20 colunas, sem cabeçalho.
- Linhas com **col 6 = `Formula`** → tabela `formulas` (col 1=formula_id, col 2=produto, col 4=ativo, col 5=sequencia, col 7=cod_mp+materia_prima separados no 1º espaço, col 9=unidade, col 10=percentual pt-BR).
- Linhas com **col 6 = `Produto Acabado`** → tabela `produtos_tid` (col 11=cod_produto, col 12=produto, col 13=unidade, col 1=formula_id, col 14=ativo).
- Antes de inserir, limpa `formulas` e `produtos_tid` para todos os `formula_id` do arquivo (reimportação segura sem duplicatas).
- Exibe resumo final: X fórmulas, Y itens, Z produtos importados.

---

### 4.13 Importar Excel do Lab (`ImportarExcelLab.tsx` + `excelImport.worker.ts`)
**Quem usa:** gestor / lab

Importa a planilha Excel mensal do laboratório (`.xlsx`) que contém a tabela de matérias-primas e as fórmulas de cada produto. Todo o parsing pesado roda em um **Web Worker** (`excelImport.worker.ts`) para não travar a UI.

**Abas lidas do arquivo:**
- `MATÉRIA PRIMA-OK!` → tabela `mp_depara` (código Excel, código TID, tipo, descrição)
- `Formulações Produção-OK!` → tabela `formulas_excel` (formula_id, sequência, cod_mp_excel, materia_prima, percentual, produto_chave)

**Fluxo:**
1. Selecionar arquivo `.xlsx`.
2. Worker faz o parse e retorna: MPs, itens de fórmula e resumo de alertas.
3. Gestor revisa alertas (fórmulas duplicadas, cod_tid ambíguos, somas ≠ 1).
4. Confirmar → gravação no Supabase: apaga `mp_depara` e `formulas_excel` inteiros e reinsere tudo.

**Alertas gerados pelo parser:**
- `formulaIdsDuplicados`: mesmo `formula_id` aparece em mais de um bloco — verificar planilha.
- `codTidDuplicados`: mesmo `cod_tid` mapeado a mais de um código Excel — ambiguidade no de-para.
- `formulasSomaNaoFecha`: soma dos percentuais da fórmula difere de 1 em mais de 6% — possível erro no Excel.

**Tabelas populadas:**

| Tabela | Conteúdo |
|---|---|
| `mp_depara` | De-para entre código Excel e código TID de cada MP |
| `formulas_excel` | Itens das fórmulas com produto_chave e formula_id |

> **⚠️ Detalhe crítico do parser — não remover sem ler:**
>
> A aba `Formulações Produção-OK!` usa **dois formatos de cabeçalho de bloco**:
>
> | Formato | Condição de detecção |
> |---|---|
> | Padrão | `col B = "MATÉRIA PRIMA"` |
> | Alternativo | `col B = ""` (vazia) **e** `col H = "VALOR MP"` |
>
> Ambos marcam o início de um novo bloco de itens. O parser (`isBlockHeader`) reconhece os dois.
> **Se algum dia o parser for reescrito e essa condição for simplificada para checar só `MATÉRIA PRIMA`,
> todos os blocos com cabeçalho `VALOR MP` serão silenciosamente ignorados — os itens desses blocos
> vão cair no formula_id do bloco anterior.** Esse bug não gera erro, só dados errados.
>
> Esse foi o bug que fez a fórmula 4507 (MBM-10-3602-1) receber os itens da 4496 (VERMELHO PR 254)
> em vez dos seus próprios (Verde Ftalo + Amarelo), descoberto e corrigido em Jul/2026.

**Estrutura do bloco na planilha:**
```
[cabeçalho: MATÉRIA PRIMA ou VALOR MP]
  linha de item: col A = código MP, col B = nome, col I = percentual
  ...
[Totalizador]
  linha de produto: col U = formula_id, col S = produto_chave
  ...
[próximo cabeçalho → flush do bloco anterior]
```

---

### 4.13-B Comparador TID × Excel (`lib/compararFormulas.ts` + `ComparatorPanel.tsx`)
**Quem usa:** gestor / lab (via CriarOrdem e PainelConsultaFormula)

Compara a fórmula cadastrada no TID com a importada do Excel, usando `mp_depara` como camada de tradução (cod_tid → cod_excel).

**Estados possíveis:**
- `ok` — percentuais batem (tolerância ±0,01%)
- `divergente` — há diferença de percentual ou MP extra/faltando
- `sem_depara` — alguma MP do TID não tem cod_tid preenchido em mp_depara
- `sem_excel` — produto não tem fórmula importada do Excel

**Regra de negócio — variante "-1":**
Fórmulas cujo `produto_chave` termina em `-1` (ex.: `MBG-10-3593-1`) usam PEBD recuperado (500319) no lugar do virgem (500028). A planilha Excel ainda lista o virgem nos dois lados; o comparador normaliza 500028 → 500319 simetricamente antes de comparar. Tabela de substituições em `SUBSTITUICOES_VARIANTE` em `compararFormulas.ts` — adicionar entradas lá para cobrir novos casos.

---

### 4.14 Painel Comercial (`PainelComercial.tsx`)
**Quem usa:** comercial, gestor

Consulta de disponibilidade de produtos para o setor de vendas.

**Modos de uso:**
- **Por data:** informa quais produtos estarão disponíveis em uma data específica.
- **Por busca de texto:** busca produto ou lote por nome (mínimo 3 caracteres) em todas as datas.

**Regra de disponibilidade:**

| Condição | Data de disponibilidade exibida |
|---|---|
| `programacao_confirmada = true` | Próximo dia útil após `data_programacao` |
| `programacao_confirmada ≠ true` | `data_emissao` + 7 dias úteis |

---

### 4.15 Painel de Manutenção (`PainelManutencao.tsx`)
**Quem usa:** gestor, tecnico

Central de gestão de Ordens de Serviço (OS).

**Funcionalidades:**
- Lista de OS com filtros por status, prioridade e técnico.
- Criar, editar, iniciar e concluir OS.
- Registro de movimentações de peças de estoque por OS.
- Histórico de movimentações.
- Reabertura de OS concluídas.

---

### 4.16 Análise de Manutenção (`PainelAnaliseManutencao.tsx`)
**Quem usa:** gestor

Dashboard analítico das OS.

**Seções:**
- **Por Equipamento:** ranking por número de OS, tempo médio de reparo por equipamento (gráficos de barra horizontal). Clique no equipamento abre modal com histórico completo de todas as OS daquele equipamento.
- **Por Tempo:** tempo médio geral de reparo, OS abertas por mês, OS por dia da semana (destaque do dia com mais OS em amarelo).

**Filtros:** atalhos de período (Hoje, Esta semana, Este mês, Este ano) + datas manuais + filtro por equipamento.

**Suporte a dark mode:** usa `buildPalette(dark)` com MutationObserver — mesmo padrão do `PainelAnalises`.

---

### 4.17 Abrir OS (`AbrirOS.tsx`)
**Quem usa:** gestor, tecnico

Formulário para abertura de nova Ordem de Serviço.

---

### 4.18 Cadastro de Equipamentos (`CadastroEquipamentos.tsx`)
**Quem usa:** gestor

CRUD de equipamentos da fábrica com campos de TAG e linha associada.

---

### 4.19 Estoque de Manutenção (`EstoqueManutencao.tsx`)
**Quem usa:** gestor, tecnico

Controle de peças e materiais de manutenção em estoque.

---

### 4.20 Ferramentas de Manutenção (`FerramentasManutencao.tsx`)
**Quem usa:** gestor, tecnico

Controle de ferramentas do setor de manutenção.

---

### 4.21 Histórico de Paradas (`HistoricoParadas.tsx`)
**Quem usa:** gestor

Consulta consolidada de todas as paradas de linha registradas no sistema.

**Funcionalidades:**
- Filtros: período (datas manuais com default = mês atual), linha (1–5 ou todas), motivo.
- Tabela com paradas ordenadas por data/hora decrescente, com duração calculada.
- Resumo por linha: total de horas paradas por linha no período.
- Excluir paradas individuais (com confirmação).
- Exporta CSV do período.

**Motivos suportados:** `manutencao`, `sem_material`, `problema_processo`, `falta_energia`, `reuniao`, `outros`.

> Complementa o registro de paradas feito no `PainelLinha` e `PainelProgramacao`. Serve para análise posterior e auditoria.

---

### 4.22 Consumo Real de MP — Lab (`ConsumoMP.tsx`)
**Quem usa:** gestor / lab

Módulo para registro manual de retiradas reais de matéria-prima do estoque físico (consumo real, não teórico).

**Seção 1 — Lançar retirada:**
- Busca de MP por nome com autocomplete via tabela `mp_depara`.
- Campos: quantidade (kg), data da retirada, observação, responsável.
- Salva em `consumo_mp`.
- Histórico recente com opção de exclusão.

**Seção 2 — Relatório:**
- Período com atalhos (hoje, semana, mês, mês anterior, ano).
- Totais agrupados por MP com `cod_tid` e número de retiradas.
- Exporta CSV.

> Distinto do consumo teórico calculado pelo módulo Compras. O consumo real reflete o que efetivamente saiu do estoque físico; o teórico vem das fórmulas das OPs.

---

## 5. Módulo Compras — Consumo de Matérias-Primas

O módulo Compras centraliza o controle de consumo teórico de MP calculado a partir das fórmulas das OPs. Três telas com dados compartilhados pelo hook `useCompras.ts`.

**Hook central: `useCompras.ts`**
- `useComprasConsumo(dataInicio, dataFim, filtros?)` — busca OPs por `criado_em` (sem filtro de status). Retorna `ResultadoCompras` com `linhas`, `aviso` de cobertura e `mesesComDados`.
- `useComprasPrevisao(dataInicio, dataFim)` — busca OPs em aberto (≠ `concluido`) por `data_programacao`. Retorna `ResultadoPrevisao` com colunas adicionais por status.
- **Cálculo central (`calcularCompras`):** para cada OP, aplica a fórmula base (`fracao = percentual/100`) e acumula `kg_mp = fracao × qtd_op`. Agrupa por `cod_mp` (prioridade) ou nome. Rastreia OPs sem fórmula (`sem_formula`) e fórmulas inexistentes (`sem_itens`) — exibe aviso de cobertura parcial.
- `MesesComDados`: conjunto de meses distintos (YYYY-MM) com pelo menos 1 OP no período, e contagem de OPs por mês. Usado para dividir a média corretamente.

---

### 5.1 Consumo de MP por Período (`ComprasConsumo.tsx`)
**Quem usa:** gestor

Total de consumo teórico de cada MP em um período.

**Funcionalidades:**
- Atalhos de período: hoje, semana, mês, mês anterior, ano.
- Tabela: MP, Cód. TID, Total (kg), Nº de OPs — ordenada por volume.
- Busca por nome ou código TID.
- Modal com detalhamento por OP (lote, produto, data, kg da MP).
- Aviso de cobertura parcial quando há OPs sem fórmula.
- Exporta CSV.

---

### 5.2 Previsão de Compra (`ComprasPrevisao.tsx`)
**Quem usa:** gestor

Consumo previsto de MP para as OPs em aberto, filtradas por `data_programacao`.

**Funcionalidades:**
- Período selecionável para simular janelas de compra.
- Tabela com colunas: Total previsto (kg), Em produção (kg), Não iniciada (kg).
  - **Em produção:** OPs com status `em_pesagem`, `aguardando_mistura`, `em_mistura`, `aguardando_linha`, `em_linha`.
  - **Não iniciada:** OPs com status `pendente`, `aguardando_liberacao`.
- Modal com detalhamento por OP e badge de status.
- Exporta CSV.

---

### 5.3 Consumo Médio Mensal (`ComprasMediaMensal.tsx`)
**Quem usa:** gestor

Média mensal de consumo teórico por MP para apoiar decisões de compra recorrente.

**Regra de cálculo:**
```
meses_com_dados = COUNT(DISTINCT YYYY-MM de criado_em das OPs no período)
media_mensal = total_kg / meses_com_dados
```

> **Importante:** divide pelo número de meses que **efetivamente têm OPs**, não pelos meses do calendário entre as datas selecionadas. Isso evita que meses sem dados na base (antes da implantação do sistema) artificialmente reduzam a média.

**Funcionalidades:**
- Atalhos: últimos 3, 6, 12 meses ou este ano.
- **Banner informativo** no topo após o cálculo: "Média sobre N meses (mmm/AAAA a mmm/AAAA) — meses considerados: mai/2026, jun/2026, jul/2026". O usuário sempre sabe a base da divisão.
- **Alerta de mês parcial** (âmbar) em dois casos:
  1. O mês corrente está no período (ainda em andamento — pode subestimar a média).
  2. Algum mês tem volume de OPs < 30% da média dos demais (possivelmente incompleto).
- Summary cards: Meses com dados, MPs distintas, OPs consideradas.
- Busca por nome ou código TID.
- Modal com detalhamento por OP.
- Exporta CSV com a mesma base de divisão.

---

## 6. Regras de Negócio

### 6.1 Regra dos 7 Dias Úteis
- Toda OP não confirmada tem disponibilidade estimada calculada como: `data_emissao + 7 dias úteis`.
- Dias úteis excluem sábados, domingos e feriados nacionais brasileiros (fixos + Páscoa e seus derivados: Carnaval, Sexta-feira Santa, Corpus Christi).
- Se `diasUteis(data_emissao, data_programacao) > 7` → OP é considerada **em atraso** (alerta vermelho na programação e no painel do gestor).

### 6.2 Fórmulas e Bateladas
- A fórmula define ingredientes como `percentual` do total.
- `quantidade_kg = (percentual / 100) × tamanho_batelada`.
- Customizações por OP são salvas em `ordens_formula` e têm prioridade sobre a fórmula base.
- O número de bateladas é calculado como `round(quantidade / tamanho_batelada)`.

### 6.3 Posição na Fila
- Cada OP tem um campo `posicao` (inteiro) que define a ordem na fila da linha.
- Após qualquer alteração (criação, drag-and-drop, mudança de linha), `recalcularPosicoes(linha)` é chamado para renumerar sequencialmente as OPs não concluídas daquela linha.

### 6.4 Registros Diários
- OPs em linha podem ter produção registrada dia a dia (permite OPs que duram múltiplos dias).
- Cada registro em `registros_diarios` contém: data, hora início/fim, itens produzidos (bateladas × peso unitário em kg).
- Ao registrar o dia, a `data_programacao` avança para o próximo dia útil, movendo a OP para o dia seguinte no kanban.

### 6.5 Lotes e Ordens
- O lote é o identificador primário vindo do ERP (SAP).
- Um lote só pode ter **uma OP ativa** no sistema.
- Ao criar a OP, `data_emissao` é sincronizada de volta para `cadastro_lotes`.

### 6.6 Marca
- Cada OP pertence a uma marca: **Pigma** ou **Zan Collor**.
- Exibida como badge colorido nos cards e na tabela de gestor.

### 6.7 Atualização de Status — Garantias
- Ao **concluir pesagem** (`PainelBalanca`): apenas `status` é atualizado.
- Ao **concluir mistura** (`PainelMistura`): apenas `status` e `linha` são atualizados. `data_programacao` não é tocada.
- Ao **confirmar/desconfirmar** (`PainelProgramacao`): apenas `programacao_confirmada` é atualizado.

### 6.8 Consumo Teórico vs. Real
- **Teórico (módulo Compras):** calculado via `fracao × qtd_op` da fórmula base. Reflete o planejado.
- **Real (ConsumoMP):** lançado manualmente pelo lab ao retirar MP do estoque físico. Salvo em `consumo_mp`. As duas visões coexistem e não são sincronizadas automaticamente.

---

## 7. Estrutura do Banco de Dados

### Tabela `ordens`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `lote` | TEXT | Número do lote (vem do ERP) |
| `produto` | TEXT | Nome do produto |
| `quantidade` | NUMERIC | Quantidade total em kg |
| `linha` | INTEGER | Linha de produção (1–5) |
| `balanca` | INTEGER | Balança de pesagem (1–2) |
| `status` | TEXT | Ver fluxo de status |
| `data_programacao` | DATE | Data programada para produção |
| `data_emissao` | DATE | Data de emissão do lote |
| `data_conclusao` | TIMESTAMP | Quando foi concluída |
| `posicao` | INTEGER | Posição na fila da linha |
| `formula_id` | TEXT | Referência à fórmula |
| `tamanho_batelada` | NUMERIC | Tamanho de cada batelada em kg |
| `marca` | TEXT | `Pigma` ou `Zan Collor` |
| `obs` | TEXT | JSON: adições para mistura `[{qty, mp}]` |
| `obs_linha` | TEXT | Obs do operador de linha |
| `obs_laboratorio` | TEXT | Anotações do laboratório |
| `requer_mistura` | BOOLEAN | Se deve passar pela etapa de mistura |
| `programacao_confirmada` | BOOLEAN | Confirmação comercial da programação |
| `hora_inicio` | TIME | Hora de início da produção na linha |
| `hora_fim` | TIME | Hora de fim |
| `quantidade_real` | NUMERIC | Quantidade efetivamente produzida (kg) |
| `motivo_reprovacao` | TEXT | Motivo em caso de reprovação |
| `data_reprovacao` | DATE | Data da reprovação |
| `tipo_op` | TEXT | Tipo da ordem de produção |
| `criado_em` | TIMESTAMP | Criação do registro |

### Tabela `cadastro_lotes`
| Campo | Tipo | Descrição |
|---|---|---|
| `lote` | NUMBER | Identificador único do lote |
| `produto` | TEXT | Nome do produto |
| `quantidade` | NUMERIC | Quantidade em kg |
| `classe` | TEXT | Classe do produto |
| `formula_id` | TEXT | Fórmula padrão |
| `tamanho_batelada` | NUMERIC | Batelada padrão |
| `status` | TEXT | `Em Aberto` = aguardando OP |
| `data_emissao` | DATE | Sincronizado da OP ao criar |

### Tabela `formulas`
| Campo | Tipo | Descrição |
|---|---|---|
| `formula_id` | TEXT | Identificador da fórmula — **sem ponto de milhar** (ex: `5500`, nunca `5.500`) |
| `produto` | TEXT | Produto ao qual pertence |
| `sequencia` | INTEGER | Ordem dos ingredientes |
| `cod_mp` | TEXT | Código da matéria-prima no TID (parte antes do 1º espaço da col 7) |
| `materia_prima` | TEXT | Nome da matéria-prima (parte após o 1º espaço da col 7) |
| `unidade` | TEXT | Unidade (kg, l, etc.) |
| `percentual` | NUMERIC | % da batelada |
| `ativo` | BOOLEAN | Se o item está ativo na fórmula |

> **Importante:** `formula_id` deve sempre ser gravado sem formatação de milhar. O parser de `ImportarProgramacao.tsx` remove automaticamente os pontos (`.replace(/\./g, '')`). Nunca inserir manualmente com ponto — isso causaria duplicatas invisíveis.

### Tabela `produtos_tid`
| Campo | Tipo | Descrição |
|---|---|---|
| `cod_produto` | INTEGER | Código do produto no TID (sem zeros à esquerda) |
| `produto` | TEXT | Nome do produto |
| `unidade` | TEXT | Unidade de medida |
| `formula_id` | TEXT | Referência à fórmula correspondente |
| `ativo` | BOOLEAN | Se o produto está ativo |

> Populada pela importação do relatório TID. Linhas com col 6 = `Produto Acabado` vão para esta tabela — nunca para `formulas`.

### Tabela `ordens_formula`
| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `sequencia` | INTEGER | Sequência do item |
| `materia_prima` | TEXT | Nome |
| `quantidade_kg` | NUMERIC | Quantidade customizada |

### Tabela `registros_diarios`
| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `data` | DATE | Data do registro |
| `hora_inicio` | TIME | Início |
| `hora_fim` | TIME | Fim |
| `registro_producao` | JSONB | Array de `{qty, peso}` (bateladas × kg) |

### Tabela `paradas`
| Campo | Tipo | Descrição |
|---|---|---|
| `linha` | INTEGER | Linha afetada |
| `data` | DATE | Data da parada |
| `motivo` | TEXT | `manutencao`, `sem_material`, `problema_processo`, `falta_energia`, `reuniao`, `outros` |
| `hora_inicio` | TIME | Início da parada |
| `hora_fim` | TIME | Fim da parada |

### Tabela `notas_programacao`
Post-its do painel de programação.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `texto` | TEXT | Conteúdo da nota |
| `cor` | TEXT | `amarelo`, `azul`, `verde`, `rosa` |
| `data` | DATE | Dia ao qual a nota pertence (null = global) |
| `criado_em` | TIMESTAMP | Criação |

### Tabela `ordens_servico`
Ordens de Serviço de manutenção.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `descricao_problema` | TEXT | Descrição do problema |
| `prioridade` | TEXT | `baixa`, `media`, `alta`, `critica` |
| `status` | TEXT | `aberta`, `em_andamento`, `aguardando_aprovacao`, `concluida` |
| `aberta_por` | TEXT | Nome de quem abriu |
| `tecnico_nome` | TEXT | Nome do técnico responsável |
| `solucao_aplicada` | TEXT | Solução descrita ao concluir |
| `aberta_em` | TIMESTAMP | Data/hora de abertura |
| `iniciado_em` | TIMESTAMP | Início do atendimento |
| `concluido_em` | TIMESTAMP | Conclusão |
| `equipamentos` | FK | Relação com equipamentos |

### Tabela `equipamentos`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `nome` | TEXT | Nome do equipamento |
| `tag` | TEXT | TAG de identificação |
| `linha` | INTEGER | Linha associada (opcional) |

### Tabela `historico`
| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `status_anterior` | TEXT | Status antes |
| `status_novo` | TEXT | Status depois |
| `alterado_em` | TIMESTAMP | Quando ocorreu |

### Tabela `perfis`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT | UUID do usuário (Supabase Auth) |
| `nome` | TEXT | Nome de exibição |
| `papel` | TEXT | `gestor`, `operador`, `tecnico`, `comercial` |
| `balanca` | TEXT | Estação do operador |

### Tabela `mp_depara`
| Campo | Tipo | Descrição |
|---|---|---|
| `cod_excel` | TEXT | Código da MP na planilha Excel do lab |
| `cod_tid` | TEXT | Código TID correspondente |
| `tipo` | TEXT | Tipo da MP (opcional) |
| `descricao` | TEXT | Nome/descrição da MP |

### Tabela `formulas_excel`
| Campo | Tipo | Descrição |
|---|---|---|
| `formula_id` | TEXT | ID da fórmula |
| `sequencia` | INTEGER | Ordem do item na fórmula |
| `cod_mp_excel` | TEXT | Código Excel da MP |
| `materia_prima` | TEXT | Nome da MP |
| `percentual` | NUMERIC | % na fórmula |
| `produto_chave` | TEXT | Chave do produto (ex.: `MBG-10-3593-1`) |

### Tabela `consumo_mp`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `cod_mp_excel` | TEXT | Código Excel da MP retirada |
| `materia_prima` | TEXT | Nome da MP |
| `quantidade_kg` | NUMERIC | Quantidade retirada |
| `data_retirada` | DATE | Data da retirada física |
| `observacao` | TEXT | Observação opcional |
| `retirado_por` | TEXT | Nome do responsável |
| `criado_em` | TIMESTAMP | Criação do registro |

---

## 8. Funcionalidades em Tempo Real

| Painel | Canal | Debounce |
|---|---|---|
| Painel Gestor | `gestor-pendentes-global` | 300ms |
| Programação | `programacao-ordens` | 1500ms (com filtro por data) |
| Balança | Canal por balança | 300ms |
| Mistura | `mistura-realtime` | 300ms |
| Linha | Canal por linha | 300ms |
| Paradas | Canal por linha | imediato |
| Registros diários | Canal por ordem | imediato |

> **Nota:** A subscription do PainelProgramacao filtra eventos por relevância — só dispara refetch quando o evento toca o dia atual (`data_programacao`, `data_reprovacao` ou `data` do registro).

---

## 9. Navegação e Layout (`Index.tsx`)

O `Index.tsx` é o shell principal. Após autenticação, roteia o usuário para o layout correto conforme o `papel`:

- **operador:** layout fixo para a estação atribuída (sem sidebar de navegação).
- **tecnico:** sidebar com 3 abas (Painel de Manutenção, Abrir OS, Ferramentas).
- **comercial:** sidebar com 1 aba (Painel Comercial).
- **gestor:** sidebar completa com grupos colapsáveis (Produção, Manutenção, Comercial, Compras).

### Keep-Alive de Abas (gestor)

Painéis com fetch de dados montam apenas na **primeira visita** e ficam no DOM com `display: none` nas demais, evitando re-fetch ao trocar de aba.

Abas com keep-alive: Gestor, Programação, Programação Balanças, Histórico, Liberação, Análises, Consulta Fórmula, Comercial, Balanças 1 e 2, Mistura, Linhas 1–5, todos os painéis de Manutenção, Compras (Consumo, Previsão, Média Mensal).

Abas que sempre remontam (formulários/one-shot): Nova Ordem, Importar, Abrir OS.

---

## 10. Dark Mode

Suporte completo a dark mode via Tailwind (`dark:` classes) em todas as páginas e via paleta dinâmica (`buildPalette(dark)`) nos painéis com gráficos Recharts.

Páginas com suporte a dark mode implementado:
- `Index.tsx` (shell e sidebar)
- `PainelAnalises.tsx`
- `PainelAnaliseManutencao.tsx`
- `PainelProgramacao.tsx` (cards Kanban via `SortableCard`)
- `PaginaInicial.tsx` (landing page)
- `ComprasConsumo.tsx`, `ComprasPrevisao.tsx`, `ComprasMediaMensal.tsx` (buildPalette)

A detecção do tema usa `MutationObserver` no `document.documentElement` observando mudanças na classe `dark`.

---

## 11. Utilitários e Funções Principais

| Arquivo | Função | O que faz |
|---|---|---|
| `lib/diasUteis.ts` | `diasUteis(de, ate)` | Conta dias úteis entre duas datas |
| `lib/diasUteis.ts` | `proximoDiaUtil(data)` | Retorna o próximo dia útil após a data |
| `lib/diasUteis.ts` | `somarDiasUteis(data, n)` | Soma N dias úteis a uma data |
| `lib/recalcularPosicoes.ts` | `recalcularPosicoes(linha)` | Renumera a fila de uma linha |
| `lib/printEtiqueta.ts` | `printEtiqueta(ordem, itens)` | Gera e imprime a etiqueta da OP |
| `lib/obsUtils.ts` | `parseObsItems(obs)` | Decodifica o JSON de adições para mistura |
| `lib/compararFormulas.ts` | `compararFormulas(...)` | Compara fórmula TID vs. Excel com suporte à variante -1 |
| `lib/utils.ts` | `sortOrdens(ordens)` | Ordena OPs: concluídas/em liberação no topo, depois por posição |
| `lib/utils.ts` | `formatKg(valor)` | Formata número como kg (3 casas, pt-BR) |
| `lib/utils.ts` | `parseHoras(inicio, fim)` | Calcula horas entre dois horários HH:MM |

---

## 12. Componentes Reutilizáveis

| Componente | Descrição |
|---|---|
| `StatusBadge` | Badge colorido com o status da OP |
| `MarcaBadge` | Badge da marca (Pigma / Zan Collor) |
| `EditarOrdemDialog` | Modal de edição completa de uma OP |
| `DetalheOrdemDialog` | Modal com histórico completo de registros da OP |
| `EditarRegistrosDiariosModal` | Modal para editar/deletar registros diários |
| `ErrorBoundary` | Captura erros React e exibe fallback amigável |

---

## 13. Estrutura de Arquivos

```
src/
├── pages/
│   ├── Index.tsx                     # Shell principal, roteamento por papel + keep-alive
│   ├── Login.tsx                     # Autenticação
│   ├── PaginaInicial.tsx             # Landing page de boas-vindas
│   ├── PainelGestor.tsx              # Dashboard do gestor
│   ├── PainelProgramacao.tsx         # Kanban de programação (5 linhas)
│   ├── PainelProgramacaoBalanca.tsx  # Programação por balança
│   ├── CriarOrdem.tsx                # Criação de nova OP
│   ├── PainelBalanca.tsx             # Estação de pesagem
│   ├── PainelMistura.tsx             # Estação de mistura
│   ├── PainelLinha.tsx               # Linha de produção
│   ├── PainelLiberacao.tsx           # Liberação/qualidade
│   ├── PainelHistorico.tsx           # Histórico de OPs concluídas
│   ├── HistoricoParadas.tsx          # Histórico de paradas por linha
│   ├── PainelAnalises.tsx            # Dashboard analítico de produção
│   ├── PainelAnaliseManutencao.tsx   # Dashboard analítico de manutenção
│   ├── PainelComercial.tsx           # Consulta de disponibilidade
│   ├── PainelConsultaFormula.tsx     # Consulta de fórmulas
│   ├── PainelManutencao.tsx          # Central de OS de manutenção
│   ├── AbrirOS.tsx                   # Formulário de nova OS
│   ├── CadastroEquipamentos.tsx      # CRUD de equipamentos
│   ├── EstoqueManutencao.tsx         # Estoque de manutenção
│   ├── FerramentasManutencao.tsx     # Ferramentas de manutenção
│   ├── ImportarProgramacao.tsx       # Importação TXT (lotes + fórmulas TID)
│   ├── ImportarExcelLab.tsx          # Importação Excel do lab (MPs + fórmulas)
│   ├── ConsumoMP.tsx                 # Registro de retiradas reais de MP (lab)
│   ├── ComprasConsumo.tsx            # Consumo teórico de MP por período
│   ├── ComprasPrevisao.tsx           # Previsão de consumo (OPs em aberto)
│   └── ComprasMediaMensal.tsx        # Média mensal de consumo de MP
├── components/
│   ├── StatusBadge.tsx
│   ├── MarcaBadge.tsx
│   ├── EditarOrdemDialog.tsx
│   ├── DetalheOrdemDialog.tsx
│   ├── EditarRegistrosDiariosModal.tsx
│   ├── ErrorBoundary.tsx
│   └── ui/                           # Componentes shadcn/ui
├── hooks/
│   ├── useAuth.ts                    # Autenticação e perfil do usuário
│   ├── useTheme.ts                   # Tema dark/light
│   ├── useOrdens.ts                  # Busca e atualização de OPs
│   ├── useFormula.ts                 # Busca de fórmulas
│   ├── useCompras.ts                 # Consumo e previsão de MP (módulo Compras)
│   └── use-toast.ts                  # Sistema de notificações
├── lib/
│   ├── diasUteis.ts                  # Cálculo de dias úteis e feriados
│   ├── recalcularPosicoes.ts         # Reordenação da fila por linha
│   ├── obsUtils.ts                   # Parse do JSON de adições para mistura
│   ├── printEtiqueta.ts              # Geração e impressão de etiqueta
│   ├── compararFormulas.ts           # Comparador TID × Excel
│   ├── antonFont.ts                  # Fonte Anton (usada na etiqueta impressa)
│   └── utils.ts                      # sortOrdens, formatKg, parseHoras
└── integrations/supabase/
    ├── client.ts
    └── types.ts

supabase/migrations/                  # Histórico de alterações no banco
```

---

## 14. Otimizações de Performance Realizadas (Jun/2026)

### `use-toast.ts`
- Corrigido dep array `[state]` → `[]` no `useEffect` do listener. Antes, o listener era re-registrado a cada toast disparado.

### `PainelLinha.tsx`
- Constante `today` movida do escopo de módulo para `useMemo(() => ..., [])` dentro do componente — corrige bug onde a data não atualizava se o app ficasse aberto após meia-noite.
- Removido import `OctagonX` não utilizado.

### `PainelHistorico.tsx`
- Totais do `<tfoot>` (dois `reduce()` + IIFE) extraídos para `useMemo` — não recalculam mais a cada render.

### `PainelProgramacao.tsx`
- **Subscription realtime** passa a filtrar por relevância: eventos que não tocam o dia atual (`data_programacao`, `data_reprovacao`, `data`) são descartados antes do debounce, eliminando re-fetches espúrios quando outro usuário salva algo em outro dia.
- **`handleDeletarRegistro`**: substituída dependência instável `[registrosDoDia]` por `registrosDoDiaRef` — callback agora é estável e não invalida o `memo` das 5 `LinhaColumn` a cada fetch.
- **`handleMoverLinha`**: envolvido em `useCallback` — `FormulaDialog` (memoizado) deixa de re-renderizar em todo `setState` do pai.
- **`notasVisiveis`**: movido para `useMemo([notas, data])`.
- **`todayStr`**: movido para `useMemo([])`.
- Removidos 3 `console.log` de debug esquecidos em produção.

### `PainelLiberacao.tsx`
- Removido `console.log` de debug esquecido em produção.

### `Index.tsx`
- `handleCriarOP` envolvido em `useCallback`.
- `activeLabel` movido para `useMemo`.
- **Keep-alive de abas**: painéis montam apenas na primeira visita e permanecem no DOM (`display: none`) nas demais — elimina re-fetch ao Supabase em cada troca de aba.

### `PainelAnaliseManutencao.tsx`
- Dark mode completo implementado com `buildPalette(dark)` + MutationObserver, matching o padrão do `PainelAnalises.tsx`.
- `PRIORIDADE_CONFIG` e `STATUS_CONFIG` convertidos para funções `getPrioridadeConfig(D)` / `getStatusConfig(D)` para refletir o tema atual.
- `colorScheme` adicionado nos inputs de data.

---

## 15. Histórico de Mudanças na Base de Dados e Sistema

### Jul/2026 — Importador Excel e comparador TID × Excel

**Novos módulos:**
- `ImportarExcelLab.tsx` + `excelImport.worker.ts`: importação da planilha mensal do lab (MPs e fórmulas) via Web Worker.
- `lib/compararFormulas.ts` + `ComparatorPanel.tsx`: comparador TID × Excel com suporte a variante "-1" (PEBD recuperado).
- Tabelas novas: `mp_depara` (de-para Excel↔TID) e `formulas_excel` (fórmulas do Excel).

**Bugs corrigidos no parser da aba Formulações Produção-OK!:**

1. **Estado `AWAIT_CLASSE` bloqueava bloco sem linha CLASSE** — o parser ficava preso esperando `col B = "CLASSE"` antes de coletar formula_ids. Em blocos sem essa linha, os itens nunca eram pareados com o formula_id correto, caindo no bloco adjacente. Corrigido eliminando `AWAIT_CLASSE`; o parser agora vai direto de `Totalizador` para `IN_PRODUCTS`.

2. **Segundo formato de cabeçalho de bloco não reconhecido** — a aba tem dois formatos de cabeçalho:
   - Padrão: `col B = "MATÉRIA PRIMA"`
   - Alternativo: `col B = ""` + `col H = "VALOR MP"`
   O parser só reconhecia o formato padrão; blocos com `VALOR MP` eram ignorados e seus itens caíam no bloco anterior. Corrigido com `isBlockHeader = (colB === 'MATÉRIA PRIMA') || (colB === '' && colH === 'VALOR MP')`. **Esse detalhe é crítico — nunca remover a segunda condição.**

   Exemplo concreto: fórmula 4507 (MBM-10-3602-1) recebia os itens da 4496 (VERMELHO PR 254) em vez dos seus (Verde Ftalo + Amarelo) porque seu cabeçalho era `VALOR MP`.

---

### Jul/2026 — Migração da base de fórmulas
- Tabela `formulas` ganhou a coluna `cod_mp` (código da matéria-prima no TID, parte antes do 1º espaço da coluna 7 do relatório).
- Tabela `produtos_tid` criada para receber linhas do tipo `Produto Acabado` do relatório TID.
- Base migrada 100% para o formato novo: **5.479 fórmulas** (IDs 1–5500), **36.849 itens**.
- **Limpeza realizada:** removidas 4.486 fórmulas duplicadas do import antigo (IDs com ponto de milhar, ex: `"1.000"` vs `"1000"`) e 35 registros inválidos de 1 item.
- **453 OPs** e o `cadastro_lotes` tiveram `formula_id` normalizado (ponto removido) sem perda de histórico.
- **Regra permanente:** `formula_id` deve sempre ser gravado sem formatação de milhar. O parser de `ImportarProgramacao.tsx` aplica `.replace(/\./g, '')` tanto na importação de lotes quanto na de fórmulas. Importações futuras do TID mantêm essa normalização automaticamente.

---

### Jul/2026 — Módulo Compras e telas de consumo de MP

**Novos módulos:**
- `hooks/useCompras.ts`: hook central com `useComprasConsumo` e `useComprasPrevisao`. Cálculo de consumo teórico via `fracao × qtd_op` da fórmula base. Tipo `MesesComDados` para rastreamento de meses com OPs.
- `ComprasConsumo.tsx`: consumo total de MP por período com detalhamento por OP.
- `ComprasPrevisao.tsx`: previsão de consumo para OPs em aberto, segmentado por status.
- `ComprasMediaMensal.tsx`: média mensal por MP, dividida por meses com dados reais (não por calendário).
- `ConsumoMP.tsx`: registro manual de retiradas físicas de MP pelo lab. Tabela `consumo_mp`.
- `HistoricoParadas.tsx`: consulta consolidada de paradas por linha e período com resumo de horas.

**Regra de média mensal (implementada em Jul/2026):**
A divisão usa `COUNT(DISTINCT YYYY-MM de criado_em)` no período — apenas meses que efetivamente têm OPs. Meses anteriores à implantação do sistema não contam, evitando redução artificial da média. O usuário vê no banner quais meses entraram no cálculo, e recebe alerta se o mês corrente estiver em andamento ou se algum mês tiver volume muito abaixo dos demais.
