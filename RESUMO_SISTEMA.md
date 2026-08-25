# ZanCollor Produção — Resumo Completo do Sistema

> Atualizado em 25/08/2026. Descreve todas as funcionalidades, fluxos, regras de negócio, estrutura técnica e otimizações realizadas.

---

## 1. Visão Geral

O sistema **ZanCollor Produção** é uma aplicação web de gestão da linha de produção fabril. Ele substitui controles manuais e planilhas, conectando em tempo real todos os pontos da fábrica: pesagem, mistura, linhas de produção, liberação de qualidade, manutenção, comercial, laboratório e compras/estoque de matérias-primas.

**Stack:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase (PostgreSQL + Auth + Realtime)

---

## 2. Perfis de Usuário

O campo `papel` na tabela `perfis` determina o que cada usuário vê e pode fazer.

| Papel | Descrição | Acesso |
|---|---|---|
| `gestor` | Administrador de produção | Acesso completo a todos os grupos: Produção, Manutenção, Comercial, Laboratório, Compras |
| `operador` | Operador de chão de fábrica | Apenas a estação atribuída (via campo `balanca`) — sem sidebar de navegação |
| `tecnico` | Técnico de manutenção | Painel de Manutenção e Abrir OS |
| `comercial` | Equipe de vendas | Apenas o Painel Comercial (consulta de disponibilidade) |
| `desenvolvimento` | Laboratório / desenvolvimento | Grupo Laboratório completo: Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor |
| `compras` | Setor de compras | Grupos: Compras (Consumo MP, Média Mensal), Comercial (Painel Comercial), Estoque (Estoque MP ZC, Estoque MP PG, Histórico de Movimentações), Laboratório (MP Testada) |

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

O campo `status` da tabela `ordens` controla em qual etapa da produção a OP se encontra.

```
┌──────────────────┐
│  pre_programacao │  ← OP criada via Pré-Programação, ainda sem data/linha definida
└────────┬─────────┘
         │ gestor confirma e programa
┌────────▼─────────┐
│     pendente     │  ← OP programada aguardando início de pesagem
└────────┬─────────┘
         │ operador de balança inicia pesagem
┌────────▼─────────┐
│   em_pesagem     │
└────────┬─────────┘
         │ pesagem concluída
         ├─── requer_mistura = true ────────────────────────────────────┐
         │                                                               │
┌────────▼──────────────┐                                    ┌──────────▼──────────┐
│  aguardando_mistura   │                                    │  aguardando_linha   │
└────────┬──────────────┘                                    └──────────┬──────────┘
         │ operador de mistura inicia                                    │
┌────────▼─────────┐                                                    │
│   em_mistura     │                                                    │
└────────┬─────────┘                                                    │
         │ mistura concluída                                              │
         └────────────────────────────────────────────────────────────►──┤
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

**Rejeição na liberação:** a OP pode ser reprovada com preenchimento de `motivo_reprovacao`, voltando para `aguardando_liberacao` (ou para análise).

**Status `pre_programacao`:** OPs criadas na tela Pré-Programação antes de receberem data, linha e balança definitivas. Ficam em fila separada e não aparecem no kanban de programação até serem convertidas para `pendente`.

---

## 4. Navegação por Perfil — Estrutura de Menus (`Index.tsx`)

### 4.1 Gestor (acesso completo)

Sidebar com 6 grupos colapsáveis:

**Produção** (grupos internos):
- Pesagem → Balança 1, Balança 2
- Mistura → Mistura
- Linhas → Linha 1, Linha 2, Linha 3, Linha 4, Linha 5
- Qualidade → Liberação
- Análises → Análises da Produção, Histórico de Paradas
- Gestão → Painel do Gestor, Pré-Programação, Programação, Programação Balanças, Nova Ordem, Histórico, Consulta por Fórmula, Importar, Importar Excel Lab

**Manutenção:** Painel de Manutenção, Análise de Manutenção, Equipamentos, Abrir OS, Estoque, Ferramentas

**Comercial:** Painel Comercial

**Laboratório:** Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor

**Compras:** Estoque MP ZC, Estoque MP PG, Consumo de MP, Consumo Médio Mensal

### 4.2 Operador

Layout fixo sem sidebar de navegação. Vê apenas a tela da estação atribuída no campo `balanca` do perfil.

### 4.3 Técnico

Sidebar com: Painel de Manutenção, Abrir OS.

### 4.4 Comercial

Sidebar com: Painel Comercial (único item).

### 4.5 Desenvolvimento (Lab)

Sidebar com grupo Laboratório: Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor.

### 4.6 Compras

Sidebar com 4 grupos:
- Compras → Consumo de MP, Consumo Médio Mensal
- Comercial → Painel Comercial
- Estoque → Estoque MP ZC, Estoque MP PG, Histórico de Movimentações
- Laboratório → MP Testada

---

## 5. Páginas e Painéis

### 5.1 Login (`Login.tsx`)
- Autenticação via e-mail + senha (Supabase Auth).
- Após login, redireciona para a interface correta conforme o `papel` do usuário.

---

### 5.2 Painel do Gestor (`PainelGestor.tsx`)
**Quem usa:** gestor

Visão geral de tudo que está pendente ou em atraso na produção.

**Seções:**
- **Alerta de OPs de dias anteriores:** lista OPs com `data_programacao < hoje` e status `pendente` ou `aguardando_linha`. Permite reprogramar individualmente para hoje ou outra data.
- **OPs em atraso:** OPs onde `diasUteis(data_emissao, data_programacao) > 7` e status ≠ `aguardando_liberacao`. Exibe quantos dias de atraso.
- **Lotes pendentes de programação:** lotes em `cadastro_lotes` com status `Em Aberto` que ainda não têm nenhuma OP criada. Botão direto para criar a OP.
- **Ordens Programadas:** tabela de todas as OPs não concluídas com filtro de busca por material em tempo real.

**Filtros:** seletor de data + campo de busca por material.
**Tempo real:** Supabase Realtime com debounce de 300ms.

---

### 5.3 Pré-Programação (`PreProgramacao.tsx`)
**Quem usa:** gestor

Fila de OPs criadas com status `pre_programacao` — entradas que ainda não receberam data, linha e balança definitivas.

**Funcionalidades:**
- Lista de OPs em pré-programação, ordenadas por data de emissão.
- Editar: definir linha, balança, data de programação, marca, requer_mistura.
- Converter para `pendente` (promove a OP para a fila de produção normal).
- Excluir OP em pré-programação.
- Exibe fórmula ao clicar no card.

**Keep-alive:** sim — mantida no DOM após a primeira visita.

---

### 5.4 Programação de Produção (`PainelProgramacao.tsx`)
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
- **Excluir:** remove o registro do dia ou a OP inteira.
- **Voltar para Fila:** devolve uma OP de `em_linha` para `aguardando_linha`.
- **Notas de programação:** post-its por dia com cores (amarelo, azul, verde, rosa). Persistem em `notas_programacao`.
- **Copiar programação:** move OPs de um dia para outro (por linha ou todas).
- **Paradas:** registro de paradas de linha com motivo e horário.

**Indicadores no card:**
- Badge de status colorido.
- Quantidade produzida no dia (kg) e horário início–fim.
- Destaque vermelho + badge de atraso quando `diasUteis(data_emissao, data_programacao) > 7`.
- Ícone de "aguardando registro" para OPs em linha sem registro do dia.

**Realtime:** subscription filtra por relevância — só dispara refetch quando o evento toca o dia atual.

---

### 5.5 Programação por Balança (`PainelProgramacaoBalanca.tsx`)
**Quem usa:** gestor

Variante do kanban de programação organizado por balança em vez de linha. Permite visualizar a fila de cada balança (1 e 2).

---

### 5.6 Nova Ordem (`CriarOrdem.tsx`)
**Quem usa:** gestor

Formulário para criar uma nova OP a partir de um lote do cadastro.

**Fluxo:**
1. Buscar lote por número → dados preenchidos automaticamente de `cadastro_lotes`.
2. Customizar quantidades da fórmula (salvas em `ordens_formula`).
3. Definir: data de programação, linha, balança, marca (Pigma ou Zan Collor), se requer mistura.
4. Adicionar "adições para mistura" (campo `obs`, formato JSON `[{qty, mp}]`).
5. Comparador TID × Excel integrado: mostra divergências de fórmula antes de criar.
6. Salvar → OP criada com status `pendente`, posição calculada automaticamente.

**Regra:** não é possível criar duas OPs para o mesmo lote.

---

### 5.7 Painel Balança (`PainelBalanca.tsx`)
**Quem usa:** operador de balança (1 ou 2), gestor

Estação de pesagem.

**Funcionalidades:**
- Lista de OPs na fila (status `pendente` ou `aguardando_linha` para a balança).
- Iniciar pesagem → status muda para `em_pesagem`.
- Fórmula completa com itens, quantidades por batelada, adições para mistura (`obs`).
- Itens da fórmula com checkbox (visual, não persiste no banco).
- Calcular número de bateladas com base em `tamanho_batelada`.
- **Concluir pesagem:**
  - Se `requer_mistura = true` → status vai para `aguardando_mistura`.
  - Se `requer_mistura = false` → status vai para `aguardando_linha`.
- **Imprimir etiqueta** (label da OP com fonte Anton).

---

### 5.8 Painel Mistura (`PainelMistura.tsx`)
**Quem usa:** operador de mistura, gestor

Estação de mistura. Só recebe OPs com `requer_mistura = true`.

**Funcionalidades:**
- Fila de OPs com status `aguardando_mistura`.
- Iniciar mistura → status muda para `em_mistura`.
- Exibe fórmula, adições e orientações.
- **Concluir mistura** → status vai para `aguardando_linha`. `data_programacao` não é tocada.

---

### 5.9 Painel Linha (`PainelLinha.tsx`)
**Quem usa:** operador de linha (1 a 5), gestor

Estação de produção na linha.

**Funcionalidades:**
- Fila de OPs com status `aguardando_linha` para a linha do operador.
- Iniciar produção → status muda para `em_linha`, registra `hora_inicio`.
- Registrar fim do dia:
  - Registra `hora_fim`, itens produzidos (bateladas × peso), obs_linha.
  - Cria registro em `registros_diarios`.
  - Avança `data_programacao` para o próximo dia útil.
  - Se marcada como concluída → status vai para `aguardando_liberacao`.
- **Paradas de linha:** registra paralisações com motivo, hora início/fim.

---

### 5.10 Painel Liberação (`PainelLiberacao.tsx`)
**Quem usa:** gestor

Controle de qualidade.

**Funcionalidades:**
- Lista de OPs com status `aguardando_liberacao`.
- Exibe todos os registros diários da OP e paradas ocorridas na linha.
- Editar registros (horários, itens produzidos, quantidade real).
- **Aprovar** → status muda para `concluido`.
- **Reprovar** → preenche `motivo_reprovacao`, status retorna.
- Deletar registros individuais de dias.

---

### 5.11 Histórico (`PainelHistorico.tsx`)
**Quem usa:** gestor

Consulta e edição de OPs concluídas.

**Funcionalidades:**
- Visualização por dia ou por intervalo de datas.
- Edição de `hora_inicio`, `hora_fim`, `quantidade_real`.
- Reabrir OP (volta para `aguardando_liberacao`).
- Totais calculados com `useMemo`.

---

### 5.12 Análises de Produção (`PainelAnalises.tsx`)
**Quem usa:** gestor

Dashboard analítico com gráficos de produtividade.

**Indicadores:**
- Produção total do período e média kg/hora geral.
- Cards por linha: kg produzidos, média kg/h, número de OPs.
- Horas por linha: trabalhadas, manutenção, sem material, problema de processo, falta de energia, limpeza — com barra de eficiência.
- Gráficos: média kg/h por faixa de OP, volume por faixa, produção mensal (12 meses), produtividade kg/h por mês com linha de meta.
- Tabelas: Top 25 produtos por kg, Top 20 OPs mais repetidas.
- Filtros: período com atalhos rápidos, filtro por linha, autocomplete de produto.
- Dark mode via `buildPalette(dark)` + MutationObserver.

---

### 5.13 Histórico de Paradas (`HistoricoParadas.tsx`)
**Quem usa:** gestor

Consulta consolidada de todas as paradas de linha.

**Funcionalidades:**
- Filtros: período (default = mês atual), linha (1–5 ou todas), motivo.
- Tabela com paradas ordenadas por data/hora decrescente, com duração calculada.
- Resumo por linha: total de horas paradas por linha no período.
- Excluir paradas individuais (com confirmação).
- Exporta CSV.

**Motivos:** `manutencao`, `sem_material`, `problema_processo`, `falta_energia`, `reuniao`, `outros`.

---

### 5.14 Consulta por Fórmula (`PainelConsultaFormula.tsx`)
**Quem usa:** gestor

Busca e exibe o conteúdo completo de uma fórmula pelo `formula_id`. Inclui o comparador TID × Excel integrado.

---

### 5.15 Importar Programação (`ImportarProgramacao.tsx`)
**Quem usa:** gestor

Duas seções independentes de importação:

**Importar Programação (lotes):** arquivo TXT Windows-1252 gerado pelo TID/ERP, separador `;`. Popula `cadastro_lotes` com lote, produto, quantidade, `formula_id`, data de emissão, classe. O `formula_id` tem pontos de milhar removidos automaticamente (`.replace(/\./g, '')`).

**Importar Fórmulas (TID):** arquivo TXT latin-1, separador `;`, 20 colunas, sem cabeçalho.
- Linhas com **col 6 = `Formula`** → tabela `formulas`.
- Linhas com **col 6 = `Produto Acabado`** → tabela `produtos_tid`.
- Antes de inserir, limpa os registros existentes dos `formula_id` do arquivo (reimportação segura).

---

### 5.16 Importar Excel do Lab (`ImportarExcelLab.tsx` + `excelImport.worker.ts`)
**Quem usa:** gestor / lab

Importa a planilha Excel mensal do laboratório (`.xlsx`). O parsing pesado roda em um **Web Worker** para não travar a UI.

**Abas lidas:**
- `MATÉRIA PRIMA-OK!` → tabela `mp_depara`
- `Formulações Produção-OK!` → tabela `formulas_excel`

**Fluxo:**
1. Selecionar arquivo `.xlsx`.
2. Worker faz o parse e retorna: MPs, itens de fórmula e alertas.
3. Gestor revisa alertas (fórmulas duplicadas, cod_tid ambíguos, somas ≠ 1).
4. Confirmar → apaga `mp_depara` e `formulas_excel` inteiros e reinsere tudo.

**Alertas gerados:**
- `formulaIdsDuplicados`: mesmo `formula_id` em mais de um bloco.
- `codTidDuplicados`: mesmo `cod_tid` mapeado a mais de um código Excel.
- `formulasSomaNaoFecha`: soma de percentuais difere de 1 em mais de 6%.

> **⚠️ Detalhe crítico do parser:**
> A aba `Formulações Produção-OK!` usa dois formatos de cabeçalho de bloco:
> - Padrão: `col B = "MATÉRIA PRIMA"`
> - Alternativo: `col B = ""` **e** `col H = "VALOR MP"`
>
> Ambos marcam início de novo bloco. O parser (`isBlockHeader`) reconhece os dois.
> **Se a segunda condição for removida, blocos com cabeçalho `VALOR MP` serão silenciosamente ignorados.**
> (Bug descoberto em Jul/2026: fórmula 4507 recebia itens da 4496.)

---

### 5.17 Comparador TID × Excel (`lib/compararFormulas.ts` + `ComparatorPanel.tsx`)
**Quem usa:** gestor / lab (via CriarOrdem e PainelConsultaFormula)

Compara a fórmula cadastrada no TID com a importada do Excel, usando `mp_depara` como camada de tradução.

**Estados possíveis:** `ok`, `divergente`, `sem_depara`, `sem_excel`.

**Regra de negócio — variante "-1":** fórmulas cujo `produto_chave` termina em `-1` usam PEBD recuperado (500319) no lugar do virgem (500028). O comparador normaliza 500028 → 500319 simetricamente. Substituições em `SUBSTITUICOES_VARIANTE` em `compararFormulas.ts`.

---

### 5.18 Painel Comercial (`PainelComercial.tsx`)
**Quem usa:** comercial, gestor, compras

Consulta de disponibilidade de produtos para vendas.

**Modos:** por data específica ou busca de texto (≥ 3 caracteres) em todas as datas.

**Regra de disponibilidade:**

| Condição | Data de disponibilidade |
|---|---|
| `programacao_confirmada = true` | Próximo dia útil após `data_programacao` |
| `programacao_confirmada ≠ true` | `data_emissao` + 7 dias úteis |

---

### 5.19 Painel de Manutenção (`PainelManutencao.tsx`)
**Quem usa:** gestor, tecnico

Central de gestão de Ordens de Serviço (OS).

**Funcionalidades:**
- Lista de OS com filtros por status, prioridade e técnico.
- Criar, editar, iniciar e concluir OS.
- Registro de movimentações de peças por OS.
- Histórico de movimentações.
- Reabertura de OS concluídas.

---

### 5.20 Análise de Manutenção (`PainelAnaliseManutencao.tsx`)
**Quem usa:** gestor

Dashboard analítico das OS.

**Seções:**
- **Por Equipamento:** ranking por número de OS e tempo médio de reparo. Clique abre histórico completo do equipamento.
- **Por Tempo:** tempo médio de reparo, OS por mês, OS por dia da semana.

**Filtros:** período com atalhos + datas manuais + filtro por equipamento.
Dark mode via `buildPalette(dark)` + MutationObserver.

---

### 5.21 Abrir OS (`AbrirOS.tsx`)
**Quem usa:** gestor, tecnico

Formulário para abertura de nova Ordem de Serviço.

---

### 5.22 Cadastro de Equipamentos (`CadastroEquipamentos.tsx`)
**Quem usa:** gestor

CRUD de equipamentos da fábrica com campos de TAG e linha associada.

---

### 5.23 Estoque de Manutenção (`EstoqueManutencao.tsx`)
**Quem usa:** gestor, tecnico

Controle de peças e materiais de manutenção em estoque.

---

### 5.24 Ferramentas de Manutenção (`FerramentasManutencao.tsx`)
**Quem usa:** gestor, tecnico

Controle de ferramentas do setor de manutenção.

---

### 5.25 Consumo Real de MP — Lab (`ConsumoMP.tsx`)
**Quem usa:** gestor, desenvolvimento

Registro manual de retiradas reais de matéria-prima do estoque físico (consumo real, não teórico).

**Seção 1 — Lançar retirada:**
- Busca de MP por nome com autocomplete via tabela `mp_depara`.
- Campos: quantidade (kg), data da retirada, observação, responsável.
- Salva em `consumo_mp`.
- Histórico recente com opção de exclusão.

**Seção 2 — Relatório:**
- Período com atalhos (hoje, semana, mês, mês anterior, ano).
- Totais agrupados por MP com `cod_tid` e número de retiradas.
- Exporta CSV.

> Distinto do consumo teórico calculado pelo módulo Compras. O consumo real reflete o que efetivamente saiu do estoque físico.

---

### 5.26 Reaproveitamento / SDR (`Reaproveitamento.tsx`)
**Quem usa:** gestor, desenvolvimento

Sistema de Solicitação de Desenvolvimento/Reaproveitamento (SDR). Controla o ciclo de vida de materiais reaproveitados.

**Funcionalidades:**
- Criar SDR com código sequencial automático (`SDR-NNN`), produto, formula_id, quantidade (kg), tipo de erro (`producao` ou `comercial`), observação.
- Itens da fórmula carregados automaticamente de `formulas_excel`, com marcação de quais itens são do reaproveitamento (`eh_reaproveitado`).
- Status: `pendente` → `utilizado`.
- Ao marcar como utilizado: registra `utilizado_em` e `utilizado_por`.
- Histórico completo de SDRs com filtros por status, tipo de erro e período.
- Filtro de busca por código SDR ou produto.
- Exporta lista.

**Tabelas:** `reaproveitamentos`, `reaproveitamentos_itens`.

---

### 5.27 Análise de Reaproveitamento (`PainelAnaliseReaproveitamento.tsx`)
**Quem usa:** gestor, desenvolvimento

Dashboard analítico dos SDRs de reaproveitamento.

**Indicadores:**
- Total de SDRs por status (pendente / utilizado).
- Volume total em kg por período.
- Distribuição por tipo de erro (produção vs. comercial).
- Ranking de produtos mais reaproveitados.
- Tempo médio entre criação e utilização.

---

### 5.28 Controle de MP Testada (`ControleMPTestada.tsx`)
**Quem usa:** gestor, desenvolvimento, compras

Controle de aprovação de matérias-primas recebidas de fornecedores (testes de laboratório).

**Funcionalidades:**
- Registrar novo teste: pigmento ZC, código do cliente, fornecedor, data do teste, lote, situação, motivo.
- **Situações:** `aprovado`, `reprovado`, `observacao`, `aguardando`.
- Filtros: por situação, fornecedor, período.
- Editar registros existentes.
- Excluir registros (com confirmação).
- Histórico completo com badges coloridos por situação.

**Tabela:** `mp_testadas`.

---

### 5.29 Controle de Cor — CIELAB (`ControleCor.tsx`)
**Quem usa:** gestor, desenvolvimento

Banco de dados de cores medidas em espaço CIELAB (L\*a\*b\*).

**Funcionalidades:**
- Cadastrar cor com: `formula_id` (opcional), produto, valores L\*, a\*, b\*, observação.
- Calcular distância de cor (ΔE 2000) entre duas entradas do banco.
- Buscar cores próximas a um alvo L\*a\*b\* por limiar de ΔE.
- Editar e excluir entradas.
- Exporta CSV.

**Tabela:** `cores_formulas`.
**Utilitário:** `lib/colorUtils.ts` — funções CIELAB e cálculo de DeltaE 2000.

---

### 5.30 Estoque MP ZC (`EstoqueMP.tsx`)
**Quem usa:** gestor, compras

Controle de saldo de matérias-primas da marca Zan Collor.

**Funcionalidades:**
- Tabela de MPs com saldo atual (kg) e estoque mínimo.
- **Alerta visual** quando `saldo_kg < minimo_kg` (linha destacada em vermelho/âmbar).
- **Baixa por OP:** descontar consumo teórico de uma OP da fórmula (usando `estoqueUtils.ts`). Gera movimento do tipo `saida` em `estoque_movimentacoes`.
- **Estorno de OP:** reverter baixa anterior. Gera movimento do tipo `estorno`.
- **Ajuste manual:** entrada, saída ou ajuste de saldo com justificativa. Gera movimento do tipo `entrada`, `saida` ou `ajuste`.
- **Saldo inicial:** definir saldo inicial de uma MP. Gera movimento do tipo `saldo_inicial`.
- Editar estoque mínimo de cada MP.
- Busca por nome ou código.
- Exporta CSV do saldo atual.

**Tabelas:** `estoque_mp`, `estoque_movimentacoes`.

---

### 5.31 Estoque MP PG (`EstoqueMPPG.tsx`)
**Quem usa:** gestor, compras

Controle de saldo de matérias-primas da marca Pigma — mesmas funcionalidades do Estoque MP ZC, operando sobre registros da marca PG.

**Tabelas:** `estoque_mp` (mesmo schema, separação por campo de marca ou cod_mp_excel específico), `estoque_movimentacoes`.

---

### 5.32 Histórico de Movimentações MP (`HistoricoMovimentacoesMP.tsx`)
**Quem usa:** gestor, compras (via Estoque do perfil compras)

Auditoria completa de todas as movimentações de estoque de MP.

**Funcionalidades:**
- Tabela completa de movimentações: tipo, MP, quantidade, saldo após, ordem vinculada (se houver), responsável, data/hora.
- Filtros: período, tipo de movimento, busca por MP ou lote.
- Exporta CSV.

**Tabela:** `estoque_movimentacoes`.

---

## 6. Módulo Compras — Consumo de Matérias-Primas

Centraliza o controle de consumo **teórico** de MP calculado a partir das fórmulas das OPs. Hook central: `useCompras.ts`.

**Hook `useCompras.ts`:**
- `useComprasConsumo(dataInicio, dataFim, filtros?)` — busca OPs por `criado_em`. Retorna `ResultadoCompras` com `linhas`, `aviso` de cobertura e `mesesComDados`.
- `useComprasPrevisao(dataInicio, dataFim)` — busca OPs em aberto por `data_programacao`. Retorna colunas adicionais por status.
- **Cálculo central (`calcularCompras`):** `kg_mp = (percentual/100) × qtd_op`. Agrupa por `cod_mp` (prioridade) ou nome. Rastreia OPs sem fórmula (`sem_formula`) e fórmulas sem itens (`sem_itens`).
- `MesesComDados`: conjunto de meses distintos (YYYY-MM) com pelo menos 1 OP no período, e contagem de OPs por mês.

---

### 6.1 Consumo de MP por Período (`ComprasConsumo.tsx`)
**Quem usa:** gestor, compras

Total de consumo teórico de cada MP em um período.

- Atalhos de período: hoje, semana, mês, mês anterior, ano.
- Tabela: MP, Cód. TID, Total (kg), Nº de OPs — ordenada por volume.
- Busca por nome ou código TID.
- Modal com detalhamento por OP (lote, produto, data, kg da MP).
- Aviso de cobertura parcial.
- Exporta CSV.

---

### 6.2 Consumo Médio Mensal (`ComprasMediaMensal.tsx`)
**Quem usa:** gestor, compras

Média mensal de consumo teórico por MP.

**Regra de cálculo:**
```
meses_com_dados = COUNT(DISTINCT YYYY-MM de criado_em das OPs no período)
media_mensal = total_kg / meses_com_dados
```

> **Importante:** divide pelo número de meses que **efetivamente têm OPs**, não pelos meses do calendário. Evita que meses sem dados artificialmente reduzam a média.

- Atalhos: últimos 3, 6, 12 meses ou este ano.
- Banner informativo com os meses considerados no cálculo.
- **Alerta de mês parcial** (âmbar): mês corrente no período ou mês com volume < 30% da média dos demais.
- Summary cards: Meses com dados, MPs distintas, OPs consideradas.
- Modal com detalhamento por OP.
- Exporta CSV com mesma base de divisão.

> Nota: `ComprasPrevisao.tsx` existe no código (lazy import) mas não está no menu atual.

---

## 7. Regras de Negócio

### 7.1 Regra dos 7 Dias Úteis
- Toda OP não confirmada tem disponibilidade estimada como: `data_emissao + 7 dias úteis`.
- Dias úteis excluem sábados, domingos e feriados nacionais brasileiros (fixos + Páscoa e derivados: Carnaval, Sexta-feira Santa, Corpus Christi).
- Se `diasUteis(data_emissao, data_programacao) > 7` → OP é considerada **em atraso** (alerta vermelho na programação e no painel do gestor).

### 7.2 Fórmulas e Bateladas
- A fórmula define ingredientes como `percentual` do total.
- `quantidade_kg = (percentual / 100) × tamanho_batelada`.
- Customizações por OP são salvas em `ordens_formula` e têm prioridade sobre a fórmula base.
- Número de bateladas: `round(quantidade / tamanho_batelada)`.

### 7.3 Posição na Fila
- Cada OP tem `posicao` (inteiro) que define a ordem na fila da linha.
- Após qualquer alteração (criação, drag-and-drop, mudança de linha), `recalcularPosicoes(linha)` renumera sequencialmente as OPs não concluídas daquela linha.

### 7.4 Registros Diários
- OPs em linha podem ter produção registrada dia a dia (OPs que duram múltiplos dias).
- Cada registro em `registros_diarios`: data, hora início/fim, itens produzidos (JSONB `[{qty, peso}]`).
- Ao registrar o dia, `data_programacao` avança para o próximo dia útil.

### 7.5 Lotes e Ordens
- O lote é o identificador primário vindo do ERP (SAP).
- Um lote só pode ter **uma OP ativa** no sistema.
- Ao criar a OP, `data_emissao` é sincronizada de volta para `cadastro_lotes`.

### 7.6 Marca
- Cada OP pertence a uma marca: **Pigma** ou **Zan Collor**.
- Exibida como badge colorido nos cards e tabelas.

### 7.7 Garantias de Atualização de Status
- **Concluir pesagem** (`PainelBalanca`): apenas `status` é atualizado.
- **Concluir mistura** (`PainelMistura`): apenas `status` e `linha`. `data_programacao` não é tocada.
- **Confirmar/desconfirmar** (`PainelProgramacao`): apenas `programacao_confirmada`.

### 7.8 Consumo Teórico vs. Real
- **Teórico (módulo Compras):** calculado via `fracao × qtd_op` da fórmula base. Reflete o planejado.
- **Real (ConsumoMP):** lançado manualmente pelo lab ao retirar MP do estoque físico. Salvo em `consumo_mp`. As duas visões coexistem e não são sincronizadas automaticamente.

### 7.9 Estoque de MP — Baixa Automática por OP
- `estoqueUtils.ts` calcula o consumo teórico de cada MP para uma OP (formula_id + quantidade) e aplica as baixas no `estoque_mp`.
- Cada baixa gera um registro em `estoque_movimentacoes` com o `ordem_id` vinculado.
- O estorno também é gerenciado pelo mesmo utilitário.

### 7.10 SDR — Reaproveitamento
- Código SDR gerado automaticamente em formato `SDR-NNN` (sequencial).
- Tipo de erro define a origem: `producao` (erro de fabricação) ou `comercial` (produto devolvido / cancelamento de venda).
- SDR em status `pendente` aparece na lista de aprovação; ao utilizar, registra quem e quando.

### 7.11 `formula_id` — Sem Formatação de Milhar
- O `formula_id` deve sempre ser gravado **sem ponto de milhar** (ex: `5500`, nunca `5.500`).
- O parser de `ImportarProgramacao.tsx` aplica `.replace(/\./g, '')` automaticamente.
- **Nunca inserir manualmente com ponto** — causaria duplicatas invisíveis.

---

## 8. Estrutura do Banco de Dados

### Tabela `ordens`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `lote` | TEXT | Número do lote (vem do ERP) |
| `produto` | TEXT | Nome do produto |
| `quantidade` | NUMERIC | Quantidade total em kg |
| `linha` | INTEGER | Linha de produção (1–5) |
| `balanca` | INTEGER | Balança de pesagem (1–2) |
| `status` | TEXT | `pre_programacao`, `pendente`, `em_pesagem`, `aguardando_mistura`, `em_mistura`, `aguardando_linha`, `em_linha`, `aguardando_liberacao`, `concluido` |
| `data_programacao` | DATE | Data programada para produção |
| `data_emissao` | DATE | Data de emissão do lote |
| `data_conclusao` | TIMESTAMP | Quando foi concluída |
| `posicao` | INTEGER | Posição na fila da linha |
| `formula_id` | TEXT | Referência à fórmula (sem ponto de milhar) |
| `tamanho_batelada` | NUMERIC | Tamanho de cada batelada em kg |
| `marca` | TEXT | `Pigma` ou `Zan Collor` |
| `obs` | TEXT | JSON: adições para mistura `[{qty, mp}]` |
| `obs_linha` | TEXT | Obs do operador de linha |
| `obs_laboratorio` | TEXT | Anotações do laboratório |
| `requer_mistura` | BOOLEAN | Se deve passar pela etapa de mistura |
| `programacao_confirmada` | BOOLEAN | Confirmação comercial da programação |
| `hora_inicio` | TIME | Hora de início na linha |
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
| `formula_id` | TEXT | Identificador (sem ponto de milhar) |
| `produto` | TEXT | Produto ao qual pertence |
| `sequencia` | INTEGER | Ordem dos ingredientes |
| `cod_mp` | TEXT | Código da MP no TID |
| `materia_prima` | TEXT | Nome da MP |
| `unidade` | TEXT | Unidade (kg, l, etc.) |
| `percentual` | NUMERIC | % da batelada |
| `ativo` | BOOLEAN | Se o item está ativo |

### Tabela `produtos_tid`
| Campo | Tipo | Descrição |
|---|---|---|
| `cod_produto` | INTEGER | Código do produto no TID |
| `produto` | TEXT | Nome do produto |
| `unidade` | TEXT | Unidade de medida |
| `formula_id` | TEXT | Referência à fórmula |
| `ativo` | BOOLEAN | Se está ativo |

### Tabela `ordens_formula`
| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `sequencia` | INTEGER | Sequência do item |
| `materia_prima` | TEXT | Nome |
| `quantidade_kg` | NUMERIC | Quantidade customizada para a OP |

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
| `id` | UUID | PK |
| `linha` | INTEGER | Linha afetada |
| `data` | DATE | Data da parada |
| `motivo` | TEXT | `manutencao`, `sem_material`, `problema_processo`, `falta_energia`, `reuniao`, `outros` |
| `hora_inicio` | TIME | Início da parada |
| `hora_fim` | TIME | Fim da parada |
| `criado_em` | TIMESTAMP | Criação |

### Tabela `notas_programacao`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `texto` | TEXT | Conteúdo da nota |
| `cor` | TEXT | `amarelo`, `azul`, `verde`, `rosa` |
| `data` | DATE | Dia ao qual a nota pertence (null = global) |
| `criado_em` | TIMESTAMP | Criação |

### Tabela `historico`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `ordem_id` | UUID | FK para ordens |
| `status_anterior` | TEXT | Status antes |
| `status_novo` | TEXT | Status depois |
| `alterado_em` | TIMESTAMP | Quando ocorreu |

### Tabela `ordens_servico`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `descricao_problema` | TEXT | Descrição do problema |
| `prioridade` | TEXT | `baixa`, `media`, `alta`, `critica` |
| `status` | TEXT | `aberta`, `em_andamento`, `aguardando_aprovacao`, `concluida` |
| `aberta_por` | TEXT | Nome de quem abriu |
| `tecnico_nome` | TEXT | Nome do técnico responsável |
| `solucao_aplicada` | TEXT | Solução ao concluir |
| `aberta_em` | TIMESTAMP | Data/hora de abertura |
| `iniciado_em` | TIMESTAMP | Início do atendimento |
| `concluido_em` | TIMESTAMP | Conclusão |
| `equipamentos` | FK | Relação com equipamentos |
| `tipo` | TEXT | Tipo da OS |
| `externa` | BOOLEAN | Se é OS externa |
| `reprovacao` | TEXT | Motivo de reprovação (se houver) |

### Tabela `equipamentos`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `nome` | TEXT | Nome do equipamento |
| `tag` | TEXT | TAG de identificação |
| `linha` | INTEGER | Linha associada (opcional) |

### Tabela `estoque_manutencao`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `descricao` | TEXT | Descrição da peça/material |
| `quantidade` | NUMERIC | Quantidade em estoque |
| `minimo` | NUMERIC | Estoque mínimo |

### Tabela `pecas_avulsas_os`
Movimentações de peças de estoque vinculadas a uma OS de manutenção.

### Tabela `perfis`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | UUID do usuário (Supabase Auth) |
| `nome` | TEXT | Nome de exibição |
| `papel` | TEXT | `gestor`, `operador`, `tecnico`, `comercial`, `desenvolvimento`, `compras` |
| `balanca` | TEXT | Estação do operador (apenas para papel `operador`) |

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
| `sequencia` | INTEGER | Ordem do item |
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

### Tabela `reaproveitamentos`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `codigo` | TEXT | Código SDR (ex.: `SDR-001`) — gerado automaticamente |
| `produto` | TEXT | Produto a reaproveitar |
| `formula_id` | TEXT | Fórmula do produto |
| `quantidade_kg` | NUMERIC | Quantidade em kg |
| `status` | TEXT | `pendente` ou `utilizado` |
| `observacao` | TEXT | Observação |
| `tipo_erro` | TEXT | `producao` ou `comercial` |
| `criado_por` | TEXT | Nome de quem criou |
| `criado_em` | TIMESTAMP | Criação |
| `utilizado_em` | TIMESTAMP | Quando foi utilizado |
| `utilizado_por` | TEXT | Quem utilizou |

### Tabela `reaproveitamentos_itens`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `reaproveitamento_id` | UUID | FK para reaproveitamentos |
| `sequencia` | INTEGER | Ordem do item na fórmula |
| `materia_prima` | TEXT | Nome da MP |
| `cod_mp_excel` | TEXT | Código Excel da MP |
| `percentual` | NUMERIC | % na fórmula |
| `eh_reaproveitado` | BOOLEAN | Se este item é o material sendo reaproveitado |

### Tabela `mp_testadas`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `pigmento_zc` | TEXT | Nome do pigmento (identificação interna ZC) |
| `codigo_cliente` | TEXT | Código do cliente/fornecedor |
| `fornecedor` | TEXT | Nome do fornecedor |
| `data_teste` | DATE | Data do teste laboratorial |
| `lote` | TEXT | Lote do material testado |
| `situacao` | TEXT | `aprovado`, `reprovado`, `observacao`, `aguardando` |
| `motivo` | TEXT | Motivo da situação (obrigatório em reprovação/observação) |
| `criado_por` | TEXT | Nome de quem registrou |
| `criado_em` | TIMESTAMP | Criação |

### Tabela `cores_formulas`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `formula_id` | TEXT | Referência à fórmula (nullable — cor pode não ter fórmula associada) |
| `produto` | TEXT | Nome do produto/cor |
| `lab_l` | NUMERIC | Valor L\* (luminosidade) no espaço CIELAB |
| `lab_a` | NUMERIC | Valor a\* (verde→vermelho) no espaço CIELAB |
| `lab_b` | NUMERIC | Valor b\* (azul→amarelo) no espaço CIELAB |
| `observacao` | TEXT | Observação opcional |
| `criado_por` | TEXT | Quem cadastrou |
| `criado_em` | TIMESTAMP | Criação |

### Tabela `estoque_mp`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `cod_mp_excel` | TEXT | Código Excel da MP (unique) |
| `materia_prima` | TEXT | Nome da MP |
| `saldo_kg` | NUMERIC | Saldo atual em kg |
| `minimo_kg` | NUMERIC | Estoque mínimo em kg |
| `atualizado_em` | TIMESTAMP | Última atualização |

### Tabela `estoque_movimentacoes`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `cod_mp_excel` | TEXT | Código Excel da MP |
| `materia_prima` | TEXT | Nome da MP |
| `tipo` | TEXT | `entrada`, `saida`, `estorno`, `ajuste`, `saldo_inicial` |
| `quantidade_kg` | NUMERIC | Quantidade da movimentação |
| `saldo_apos` | NUMERIC | Saldo resultante após a movimentação |
| `ordem_id` | UUID | FK para ordens (nullable — apenas em baixas/estornos por OP) |
| `ordem_lote` | TEXT | Número do lote da OP vinculada |
| `observacao` | TEXT | Justificativa (obrigatória em ajustes) |
| `criado_por` | TEXT | Nome do responsável |
| `criado_em` | TIMESTAMP | Criação |

---

## 9. Hooks

### `useAuth.ts`
- Busca o perfil do usuário autenticado na tabela `perfis`.
- Retorna: `perfil`, `email`, `loading`, `logout`.
- Escuta mudanças de sessão via `onAuthStateChange`.

### `useOrdens.ts`
Sub-hooks exportados:
- `useOrdens(date?)` — OPs por data ou todas as não concluídas. Realtime com debounce de 1500ms.
- `useHistorico(dataInicio?, dataFim?)` — OPs concluídas com todos os detalhes.
- `useAnalises(dataInicio, dataFim)` — OPs para dashboard analítico.
- `useParadasLinha(linha, data)` — Paradas de uma linha em uma data.
- `useParadasAnalises(dataInicio, dataFim)` — Paradas para analytics.
- `useRegistrosDiariosOrdem(ordemId)` — Registros diários de uma OP específica.
- `useRegistrosDiariosAnalises(dataInicio, dataFim)` — Registros para analytics.

### `useFormula.ts`
- Busca itens da fórmula (`materia_prima`, `percentual`, `quantidade_kg`).
- Calcula quantidades baseadas no tamanho da batelada.
- Permite editar quantidades por item.
- Retorna: `itens`, `loading`, `error`, `setQuantidade`.

### `useCompras.ts`
- `useComprasConsumo(dataInicio, dataFim, filtros?)` — consumo teórico por período.
- `useComprasPrevisao(dataInicio, dataFim)` — previsão para OPs em aberto.
- Cálculo central: `kg_mp = (percentual/100) × qtd_op`.
- Rastreia `mesesComDados` para média correta.

### `useTheme.ts`
- Detecta dark/light mode via `class="dark"` no `<html>`.
- Retorna: `theme`, `toggle`.

### `use-toast.ts`
- Sistema de notificações toast (Sonner provider).

---

## 10. Utilitários e Funções Principais (`src/lib/`)

| Arquivo | Função | O que faz |
|---|---|---|
| `diasUteis.ts` | `diasUteis(de, ate)` | Conta dias úteis entre duas datas (exclui feriados brasileiros) |
| `diasUteis.ts` | `proximoDiaUtil(data)` | Retorna o próximo dia útil após a data |
| `diasUteis.ts` | `somarDiasUteis(data, n)` | Soma N dias úteis a uma data |
| `recalcularPosicoes.ts` | `recalcularPosicoes(linha)` | Renumera a fila de uma linha no banco |
| `printEtiqueta.ts` | `printEtiqueta(ordem, itens)` | Gera e imprime a etiqueta da OP (fonte Anton) |
| `obsUtils.ts` | `parseObsItems(obs)` | Decodifica o JSON de adições para mistura |
| `compararFormulas.ts` | `compararFormulas(...)` | Compara fórmula TID vs. Excel com suporte à variante -1 |
| `colorUtils.ts` | `deltaE2000(lab1, lab2)` | Calcula distância perceptual de cor (DeltaE 2000) |
| `colorUtils.ts` | `labToXyz`, `xyzToLab`, etc. | Conversões do espaço CIELAB |
| `estoqueUtils.ts` | `baixarEstoqueOP(...)` | Calcula e aplica baixa de estoque por OP |
| `estoqueUtils.ts` | `estornarBaixaOP(...)` | Reverte baixa de estoque de uma OP |
| `formulasCache.ts` | — | Cache in-memory de fórmulas para evitar re-fetch |
| `deparaCache.ts` | — | Cache in-memory do de-para de MPs |
| `antonFont.ts` | — | Fonte Anton embutida para etiqueta impressa |
| `utils.ts` | `sortOrdens(ordens)` | Ordena OPs: concluídas/em liberação no topo, depois por posição |
| `utils.ts` | `formatKg(valor)` | Formata número como kg (3 casas, pt-BR) |
| `utils.ts` | `parseHoras(inicio, fim)` | Calcula horas entre dois horários HH:MM |

---

## 11. Componentes Reutilizáveis

| Componente | Descrição |
|---|---|
| `StatusBadge` | Badge colorido com o status da OP |
| `MarcaBadge` | Badge da marca (Pigma / Zan Collor) |
| `MarcaCard` | Card de métrica com ícone de marca |
| `EditarOrdemDialog` | Modal de edição completa de uma OP |
| `DetalheOrdemDialog` | Modal com histórico completo de registros da OP |
| `EditarRegistrosDiariosModal` | Modal para editar/deletar registros diários |
| `ComparatorPanel` | Painel visual de comparação TID × Excel |
| `ErrorBoundary` | Captura erros React e exibe fallback amigável |

---

## 12. Funcionalidades em Tempo Real

| Painel | Canal | Debounce |
|---|---|---|
| Painel Gestor | `gestor-pendentes-global` | 300ms |
| Programação | `programacao-ordens` | 1500ms (com filtro por relevância de data) |
| Balança | Canal por balança | 300ms |
| Mistura | `mistura-realtime` | 300ms |
| Linha | Canal por linha | 300ms |
| Paradas | Canal por linha | imediato |
| Registros diários | Canal por ordem | imediato |

> **Nota:** A subscription do PainelProgramacao filtra eventos por relevância — só dispara refetch quando o evento toca o dia atual (`data_programacao`, `data_reprovacao` ou `data` do registro).

---

## 13. Keep-Alive de Abas (`Index.tsx`)

Painéis com fetch de dados montam apenas na **primeira visita** e ficam no DOM com `display: none` nas demais, evitando re-fetch ao trocar de aba.

**Abas com keep-alive:**
`gestor`, `programacao`, `programacao_balanca`, `pre_programacao`, `historico`, `liberacao`, `analises`, `comercial`, `balanca1`, `balanca2`, `mistura`, `linha1`–`linha5`, `painel_manutencao`, `analise_manutencao`, `cadastro_equipamentos`, `estoque_manutencao`, `consumo_mp`, `compras_consumo`, `compras_media_mensal`, `reaproveitamento`, `analise_reaproveitamento`, `mp_testadas`, `controle_cor`, `estoque_mp`, `estoque_mp_pg`, `historico_mov_mp`.

**Abas que sempre remontam (formulários/one-shot):**
`criar`, `importar`, `importar_excel`, `abrir_os`, `consulta_formula`, `ferramentas_manutencao`, `historico_paradas`.

---

## 14. Dark Mode

Suporte completo a dark mode via Tailwind (`dark:` classes) em todas as páginas e via paleta dinâmica (`buildPalette(dark)`) nos painéis com gráficos Recharts.

Detecção do tema: `MutationObserver` no `document.documentElement` observando mudanças na classe `dark`. Toggle disponível na sidebar de todos os perfis.

Páginas com `buildPalette` + MutationObserver:
- `PainelAnalises.tsx`
- `PainelAnaliseManutencao.tsx`
- `ComprasConsumo.tsx`, `ComprasPrevisao.tsx`, `ComprasMediaMensal.tsx`

---

## 15. Estrutura de Arquivos

```
src/
├── pages/
│   ├── Index.tsx                        # Shell principal, roteamento por papel + keep-alive
│   ├── Login.tsx                        # Autenticação
│   ├── PaginaInicial.tsx                # Landing page de boas-vindas
│   ├── PainelGestor.tsx                 # Dashboard do gestor
│   ├── PreProgramacao.tsx               # Fila de OPs em pré-programação
│   ├── PainelProgramacao.tsx            # Kanban de programação (5 linhas)
│   ├── PainelProgramacaoBalanca.tsx     # Programação por balança
│   ├── CriarOrdem.tsx                   # Criação de nova OP
│   ├── PainelBalanca.tsx                # Estação de pesagem
│   ├── PainelMistura.tsx                # Estação de mistura
│   ├── PainelLinha.tsx                  # Linha de produção
│   ├── PainelLiberacao.tsx              # Liberação/qualidade
│   ├── PainelHistorico.tsx              # Histórico de OPs concluídas
│   ├── HistoricoParadas.tsx             # Histórico de paradas por linha
│   ├── PainelAnalises.tsx               # Dashboard analítico de produção
│   ├── PainelAnaliseManutencao.tsx      # Dashboard analítico de manutenção
│   ├── PainelAnaliseReaproveitamento.tsx# Dashboard analítico de reaproveitamento
│   ├── PainelComercial.tsx              # Consulta de disponibilidade
│   ├── PainelConsultaFormula.tsx        # Consulta de fórmulas
│   ├── PainelManutencao.tsx             # Central de OS de manutenção
│   ├── AbrirOS.tsx                      # Formulário de nova OS
│   ├── CadastroEquipamentos.tsx         # CRUD de equipamentos
│   ├── EstoqueManutencao.tsx            # Estoque de manutenção
│   ├── FerramentasManutencao.tsx        # Ferramentas de manutenção
│   ├── ImportarProgramacao.tsx          # Importação TXT (lotes + fórmulas TID)
│   ├── ImportarExcelLab.tsx             # Importação Excel do lab (MPs + fórmulas)
│   ├── ConsumoMP.tsx                    # Registro de retiradas reais de MP (lab)
│   ├── Reaproveitamento.tsx             # Sistema SDR de reaproveitamento
│   ├── ControleMPTestada.tsx            # Controle de aprovação de MP por fornecedor
│   ├── ControleCor.tsx                  # Banco de cores CIELAB
│   ├── EstoqueMP.tsx                    # Estoque de MP ZC (saldo + mínimo)
│   ├── EstoqueMPPG.tsx                  # Estoque de MP PG (saldo + mínimo)
│   ├── HistoricoMovimentacoesMP.tsx     # Auditoria de movimentações de estoque de MP
│   ├── ComprasConsumo.tsx               # Consumo teórico de MP por período
│   ├── ComprasPrevisao.tsx              # Previsão de consumo (OPs em aberto)
│   └── ComprasMediaMensal.tsx           # Média mensal de consumo de MP
├── components/
│   ├── StatusBadge.tsx
│   ├── MarcaBadge.tsx
│   ├── MarcaCard.tsx
│   ├── EditarOrdemDialog.tsx
│   ├── DetalheOrdemDialog.tsx
│   ├── EditarRegistrosDiariosModal.tsx
│   ├── ComparatorPanel.tsx
│   ├── ErrorBoundary.tsx
│   └── ui/                              # Componentes shadcn/ui (40+ componentes Radix UI)
├── hooks/
│   ├── useAuth.ts                       # Autenticação e perfil do usuário
│   ├── useTheme.ts                      # Tema dark/light
│   ├── useOrdens.ts                     # Busca e atualização de OPs
│   ├── useFormula.ts                    # Busca de fórmulas
│   ├── useCompras.ts                    # Consumo e previsão de MP (módulo Compras)
│   └── use-toast.ts                     # Sistema de notificações toast
├── lib/
│   ├── diasUteis.ts                     # Cálculo de dias úteis e feriados brasileiros
│   ├── recalcularPosicoes.ts            # Reordenação da fila por linha
│   ├── obsUtils.ts                      # Parse do JSON de adições para mistura
│   ├── printEtiqueta.ts                 # Geração e impressão de etiqueta
│   ├── compararFormulas.ts              # Comparador TID × Excel (com variante -1)
│   ├── colorUtils.ts                    # CIELAB e DeltaE 2000
│   ├── estoqueUtils.ts                  # Baixa e estorno de estoque por OP
│   ├── formulasCache.ts                 # Cache in-memory de fórmulas
│   ├── deparaCache.ts                   # Cache in-memory do de-para de MPs
│   ├── antonFont.ts                     # Fonte Anton para etiqueta impressa
│   └── utils.ts                         # sortOrdens, formatKg, parseHoras
└── integrations/supabase/
    ├── client.ts
    └── types.ts

supabase/                                # Configuração e seeds Supabase
```

---

## 16. Otimizações de Performance

### `PainelProgramacao.tsx`
- Subscription realtime filtra por relevância: eventos que não tocam o dia atual são descartados antes do debounce.
- `handleDeletarRegistro`: usa `registrosDoDiaRef` em vez de dependência instável para evitar invalidar o memo das 5 `LinhaColumn`.
- `handleMoverLinha`: envolvido em `useCallback` — `FormulaDialog` (memoizado) deixa de re-renderizar em todo `setState` do pai.
- `notasVisiveis` e `todayStr`: movidos para `useMemo`.

### `PainelHistorico.tsx`
- Totais do `<tfoot>` extraídos para `useMemo` — não recalculam mais a cada render.

### `PainelLinha.tsx`
- Constante `today` em `useMemo(() => ..., [])` dentro do componente — corrige bug onde a data não atualizava se o app ficasse aberto após meia-noite.

### `Index.tsx`
- `handleCriarOP` envolvido em `useCallback`.
- `activeLabel` movido para `useMemo`.
- Keep-alive de abas via `mountedTabs`: elimina re-fetch ao Supabase em cada troca de aba.
- Pre-fetch lazy de painéis críticos (Linha, Balança, Programação, Liberação, Histórico) 200ms após montagem.

### `use-toast.ts`
- Dep array `[state]` → `[]` no `useEffect` do listener. Antes, o listener era re-registrado a cada toast disparado.

### `PainelAnaliseManutencao.tsx`
- `PRIORIDADE_CONFIG` e `STATUS_CONFIG` convertidos para funções `getPrioridadeConfig(D)` / `getStatusConfig(D)` para refletir o tema atual.

---

## 17. Histórico de Mudanças Relevantes

### Jul/2026 — Importador Excel e comparador TID × Excel
- `ImportarExcelLab.tsx` + `excelImport.worker.ts`: importação via Web Worker.
- `lib/compararFormulas.ts` + `ComparatorPanel.tsx`: comparador com variante "-1".
- Tabelas: `mp_depara`, `formulas_excel`.
- **Bug corrigido:** segundo formato de cabeçalho de bloco (`VALOR MP`) não reconhecido — fórmula 4507 recebia itens da 4496. Corrigido com `isBlockHeader` dual.

### Jul/2026 — Migração da base de fórmulas
- 4.486 fórmulas duplicadas (com ponto de milhar no ID) removidas.
- 453 OPs e `cadastro_lotes` normalizados.
- Coluna `cod_mp` adicionada à tabela `formulas`.
- Tabela `produtos_tid` criada.
- Regra permanente: `formula_id` sem ponto de milhar.

### Jul/2026 — Módulo Compras e Consumo Real de MP
- `useCompras.ts`, `ComprasConsumo.tsx`, `ComprasPrevisao.tsx`, `ComprasMediaMensal.tsx`.
- `ConsumoMP.tsx` + tabela `consumo_mp`.
- `HistoricoParadas.tsx`.
- Regra de média mensal por meses com dados (não por calendário).

### Ago/2026 — Laboratório, Estoque e Reaproveitamento
- `Reaproveitamento.tsx` — sistema SDR completo.
- `PainelAnaliseReaproveitamento.tsx`.
- `ControleMPTestada.tsx` + tabela `mp_testadas`.
- `ControleCor.tsx` + tabela `cores_formulas`.
- `lib/colorUtils.ts` — CIELAB e DeltaE 2000.
- `EstoqueMP.tsx` + `EstoqueMPPG.tsx` + tabelas `estoque_mp`, `estoque_movimentacoes`.
- `HistoricoMovimentacoesMP.tsx`.
- `lib/estoqueUtils.ts` — baixa e estorno de estoque por OP.
- `PreProgramacao.tsx` — status `pre_programacao` adicionado ao fluxo.
- Perfis `desenvolvimento` e `compras` adicionados ao sistema.
