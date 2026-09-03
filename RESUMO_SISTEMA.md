# RESUMO DO SISTEMA — Factory Scale Sync

> Documento gerado em 2026-08-31. Reflete o estado atual do código-fonte.

---

## 1. Visão Geral e Stack

**Objetivo**: ERP de produção industrial para gestão de Ordens de Produção (OP), pesagem, mistura, linhas de produção, liberação de qualidade, estoque de matéria-prima e laboratório.

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime) |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| Gráficos | recharts |
| PDF | jsPDF (carregado sob demanda) |
| Excel | xlsx (carregado sob demanda) |
| Etiquetas | ZPL (Zebra Programming Language) |
| Roteamento | React Router v6 (rota única `/app`) |

**Ponto de entrada**: `src/pages/Index.tsx` — renderização condicional por papel de usuário, sem sub-rotas.

**Performance**:
- Lazy loading de páginas pesadas via `React.lazy` + `Suspense`
- Keep-alive de abas visitadas (estado preservado em memória)
- Cache de 5 min para tabelas `formulas` e `mp_depara`
- jsPDF e xlsx carregados via `dynamic import()` apenas quando usados
- Realtime com debounce de 600–800ms por canal

---

## 2. Perfis de Acesso

O campo `perfis.papel` (text) define o nível de acesso. O campo `perfis.balanca` (text|null) refina o acesso dos operadores.

### GESTOR
Acesso completo ao sistema. Vê todos os grupos de menu.

**Produção**: Painel Gestor, Balança 1 e 2, Mistura, Linha 1–5, Liberação, Análises, Histórico de Paradas, Programação, Programação Balanças, Pré-Programação, Nova Ordem, Histórico de OPs, Consulta Fórmula, Importar Programação, Importar Excel Lab

**Manutenção**: Painel Manutenção, Análise Manutenção, Equipamentos, Abrir OS, Estoque Manutenção, Ferramentas

**Comercial**: Painel Comercial

**Laboratório**: Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor

**Compras**: Estoque MP ZC, Estoque MP PG, Histórico de Movimentações, Conferência de Estoque, Consumo de MP (compras), Consumo Médio Mensal

### OPERADOR
Interface full-screen dedicada (sem sidebar), determinada por `perfis.balanca`:

| Valor de `balanca` | Tela exibida |
|--------------------|-------------|
| `"1"` | Painel Balança 1 exclusivo |
| `"2"` | Painel Balança 2 exclusivo |
| `"mistura"` | Painel Mistura exclusivo |
| `"linha1"` a `"linha5"` | Painel Linha N exclusivo |

### TÉCNICO
Sidebar com: Painel Manutenção, Abrir OS, Ferramentas Manutenção.
Pode abrir OS. Não aprova nem conclui OS (exclusivo do gestor).

### COMERCIAL
Acesso exclusivo ao Painel Comercial.

### COMPRAS
- **Compras**: Consumo de MP, Consumo Médio Mensal
- **Comercial**: Painel Comercial
- **Estoque**: Estoque MP ZC, Estoque MP PG, Histórico de Movimentações, Conferência de Estoque
- **Laboratório**: somente MP Testada

### DESENVOLVIMENTO (Laboratório)
- **Laboratório**: Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor

---

## 3. Todas as Páginas por Grupo

### Produção

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `gestor` | PainelGestor.tsx | Dashboard com KPIs: OPs do dia por status, kg/hora, linhas ativas. Filtra status ≠ `pre_programacao`. |
| `balanca1` / `balanca2` | PainelBalanca.tsx | Pesagem de OP: exibe fórmula, bateladas feitas, pausa/retomada, imprime etiqueta ZPL/PDF. |
| `mistura` | PainelMistura.tsx | Exibe OP em mistura com fórmula e bateladas, fila de aguardando_mistura, iniciar/concluir mistura, imprimir etiqueta. |
| `linha1`–`linha5` | PainelLinha.tsx | Produção na linha: iniciar, registrar produção por dia, registrar paradas, registrar hora início/fim, concluir OP. |
| `liberacao` | PainelLiberacao.tsx | Aprovar ou reprovar OPs em `aguardando_liberacao`. Reprovação normal (volta à fila) ou contando volume (conclui a OP mas não conta em kg/h). |
| `analises` | PainelAnalises.tsx | Análise de produção: kg/h por linha, produção total, volume por mês, relatório de retrabalho (reprovados contando volume). |
| `historico_paradas` | HistoricoParadas.tsx | Histórico de paradas de linha por período. |
| `programacao` | PainelProgramacao.tsx | Programação diária por linha. Drag-and-drop entre linhas, editar, excluir, reprogramar, registrar dia, forçar conclusão. |
| `programacao_balanca` | PainelProgramacaoBalanca.tsx | Programação vista por balança. |
| `pre_programacao` | PreProgramacao.tsx | OPs em status `pre_programacao` aguardando ser programadas (definir data/linha/balança). |
| `criar` | CriarOrdem.tsx | Criar nova OP: seleciona lote do cadastro, define quantidade, marca, linha, balança, fórmula, data. Alerta de acertos de material registrados para a fórmula. Baixa automática de estoque ao confirmar. |
| `historico` | PainelHistorico.tsx | Histórico de OPs concluídas com filtros. |
| `consulta_formula` | PainelConsultaFormula.tsx | Consulta e comparação de fórmulas (TID vs. Excel via mp_depara). |
| `importar` | ImportarProgramacao.tsx | Importa programação de arquivo texto (formato específico). |
| `importar_excel` | ImportarExcelLab.tsx | Importa formulas_excel e mp_depara de planilha Excel do laboratório. Limpa e repopula as tabelas a cada execução. |

### Manutenção

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `painel_manutencao` | PainelManutencao.tsx | Dashboard de OS abertas, em andamento e concluídas. |
| `analise_manutencao` | PainelAnaliseManutencao.tsx | Análise de indicadores de manutenção. |
| `cadastro_equipamentos` | CadastroEquipamentos.tsx | CRUD de equipamentos. |
| `abrir_os` | AbrirOS.tsx | Abertura de Ordem de Serviço. Disponível para técnico e gestor. |
| `estoque_manutencao` | EstoqueManutencao.tsx | Estoque de peças e ferramentas de manutenção. |
| `ferramentas_manutencao` | FerramentasManutencao.tsx | Gestão de ferramentas e localizações. |

### Comercial

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `comercial` | PainelComercial.tsx | Dados comerciais das OPs (tipo estoque/venda, destino). |

### Laboratório

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `consumo_mp` | ConsumoMP.tsx | Registra consumo de MP no laboratório. Suporta flag "é acerto de material" (vincula a uma OP). Baixa de estoque_mp. Gera relatórios de consumo salvos em `relatorios_consumo_mp`. |
| `reaproveitamento` | Reaproveitamento.tsx | Cadastra material para reaproveitamento com origem, destino, quantidade, percentual e tipo de erro. |
| `analise_reaproveitamento` | PainelAnaliseReaproveitamento.tsx | Dashboard de reaproveitamentos pendentes e utilizados. Permite marcar como "utilizado". |
| `mp_testadas` | ControleMPTestada.tsx | Rastreia testes de qualidade de matéria-prima. Situações: aprovado, reprovado, observação, aguardando. |
| `controle_cor` | ControleCor.tsx | Registra cores de fórmulas em CIE L*a*b*. Calcula Delta E 2000 entre amostras. |

### Compras

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `compras_consumo` | ComprasConsumo.tsx | Consumo de MP por período baseado em OPs concluídas × percentuais das fórmulas. |
| `compras_media_mensal` | ComprasMediaMensal.tsx | Média mensal de consumo de MP. |
| `estoque_mp` | EstoqueMP.tsx | Saldo de estoque ZC (cod_tid). Entrada manual, saída manual, importação Excel. |
| `estoque_mp_pg` | EstoqueMPPG.tsx | Saldo de estoque PG (cod_pg). Mesmas funções. |
| `historico_mov_mp` | HistoricoMovimentacoesMP.tsx | Histórico de movimentações de estoque (saída, estorno, entrada). |
| `conferencia_estoque` | ConferenciaEstoque.tsx | Confronta saldo atual com lançamentos para conferência. |

---

## 4. Fluxo de Status da OP

```
[Criação]
    ↓
pre_programacao  ←  OP criada aguardando ser programada (sem data/linha definida)
    ↓  (gestor define data + linha em Pré-Programação)
pendente         ←  OP programada, aguardando pesagem
    ↓  (balança inicia)
em_pesagem       ←  Pesagem em andamento
    ↓
    ├─ requer_mistura = true  →  aguardando_mistura  →  em_mistura  →  aguardando_linha
    └─ requer_mistura = false →  aguardando_linha
                                       ↓
                                   em_linha        ←  Produção na linha em andamento
                                       ↓
                               aguardando_liberacao ←  Produção concluída, aguardando QC
                                       ↓
                    ┌──────────────────┴──────────────────────────┐
                    ↓                                             ↓
               concluido                                     reprovado
          (aprovado pelo gestor)               (motivo_reprovacao + data_reprovacao)

Variante "contando volume" (reprovar mas contabilizar produção):
    aguardando_liberacao → reprovado=true + contou_volume=true + status=concluido
    (OP encerra, kg conta no volume total mas NÃO entra no cálculo de kg/h)
```

**Todos os valores de status usados no código**:
`pre_programacao`, `pendente`, `em_pesagem`, `aguardando_mistura`, `em_mistura`, `aguardando_linha`, `em_linha`, `aguardando_liberacao`, `concluido`, `reprovado`

---

## 5. Módulos de Laboratório — Detalhamento

### 5.1 Consumo de MP (`ConsumoMP.tsx`)
- Registra cada retirada de MP: `cod_mp_excel`, `materia_prima`, `quantidade_kg`, `data_retirada`, `observacao`, `retirado_por`.
- Flag **"É acerto de material?"**: se ativada, o usuário busca a OP que está sendo acertada (por lote/produto). O consumo é vinculado a ela e o sistema sugere o item de fórmula correspondente.
- Baixa automática: deduz de `estoque_mp` (ZC, por cod_tid) ou `estoque_mp_pg` (PG, por cod_pg).
- Relatórios salvos em `relatorios_consumo_mp` (cabeçalho) e `relatorios_consumo_mp_itens` (detalhe por MP).

### 5.2 Reaproveitamento (`Reaproveitamento.tsx`)
- Cadastra material a reaproveitar: produto de origem, produto de destino, `formula_id_origem`, `formula_id_destino`, `quantidade_material`, `quantidade_utilizada`, `percentual_reaproveitado`.
- `status`: `"pendente"` (disponível) | `"utilizado"` (já consumido).
- `tipo_erro`: `"producao"` | `"comercial"` — identifica origem do erro.
- Itens detalhados em `reaproveitamentos_itens`.

### 5.3 Análise de Reaproveitamento (`PainelAnaliseReaproveitamento.tsx`)
- Dashboard de reaproveitamentos. Permite filtrar por status, marcar como "utilizado" e ver métricas.

### 5.4 MP Testada (`ControleMPTestada.tsx`)
- Rastreia testes de qualidade de MPs recebidas.
- `situacao`: `"aprovado"` | `"reprovado"` | `"observacao"` | `"aguardando"`.
- Campos: `pigmento_zc`, `codigo_cliente`, `fornecedor`, `data_teste`, `lote`, `motivo`, `criado_por`.
- Visível para: gestor, desenvolvimento, compras.

### 5.5 Controle de Cor (`ControleCor.tsx`)
- Armazena cor de referência de cada fórmula em CIE L\*a\*b\*.
- Campos: `formula_id`, `produto`, `lab_l`, `lab_a`, `lab_b`, `observacao`, `aplicacao`.
- Calcula Delta E 2000 entre amostras via `deltaE2000()` em `colorUtils.ts`.

---

## 6. Estoque de Matéria-Prima

### 6.1 Estoque ZC — `estoque_mp`
- Chave: `cod_tid` (text, PK)
- Campos: `materia_prima`, `saldo_kg`, `atualizado_em`
- Tela `EstoqueMP.tsx`: entrada manual, saída manual, importação via Excel.

### 6.2 Estoque PG — `estoque_mp_pg`
- Chave: `cod_pg` (text, PK)
- Campos: `materia_prima`, `saldo_kg`, `atualizado_em`
- Tela `EstoqueMPPG.tsx`: mesmas funções.

### 6.3 Histórico — `estoque_movimentacoes`
Toda movimentação (automática ou manual) é registrada aqui com: `cod_tid`, `materia_prima`, `tipo` (`saida` | `estorno` | `entrada`), `quantidade_kg`, `saldo_apos`, `ordem_id`, `ordem_lote`, `criado_por`, `criado_em`.

### 6.4 Baixa Automática ao Criar OP (`estoqueUtils.ts`)
1. Carrega itens da fórmula (`cod_mp, materia_prima, percentual`).
2. Para cada item: `consumo_kg = (percentual / 100) × quantidade_op`.
3. Busca `cod_mp` em `estoque_mp` (campo `cod_tid`). Se não achar, busca em `estoque_mp_pg` (campo `cod_pg`). MP sem cadastro em nenhum estoque é ignorada.
4. Deduz do saldo via upsert.
5. Insere movimentação tipo `"saida"` em `estoque_movimentacoes`.

**Verificação prévia**: `verificarEstoqueOP()` checa se alguma MP ficaria negativa. Retorna lista de `MpFaltante[]` e pode bloquear a criação.

**Ajuste de quantidade**: ao editar a OP — `ajustarEstoqueOP()` calcula delta e lança `"saida"` ou `"estorno"`.

**Estorno ao excluir**: `estornarEstoqueOP()` reverte todas as movimentações anteriores da OP.

---

## 7. Acerto de Material

Funcionalidade no módulo **Consumo de MP** (laboratório):
- Toggle "É acerto de material?" ao registrar consumo.
- Com a flag ativa, busca a OP sendo acertada (por lote/nome) e vincula o consumo a ela.
- Na tela **CriarOrdem**, o sistema detecta reaproveitamentos/acertos registrados para a mesma fórmula e exibe alerta com contagem.

---

## 8. Todas as Tabelas do Banco

> Campos marcados com † existem no código mas **não estão** no `src/integrations/supabase/types.ts` (schema desatualizado em relação ao banco real).

### `ordens`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| lote | text | |
| produto | text | |
| quantidade | number | Quantidade programada (kg) |
| quantidade_real† | number\|null | Quantidade real produzida |
| status | text | Ver §4 |
| data_programacao | text | |
| data_conclusao | text\|null | Preenchida ao concluir |
| balanca | number | 1 ou 2 |
| linha | number | 1–5 |
| posicao | number\|null | Posição na fila |
| formula_id† | text\|null | Referência lógica → formulas.formula_id |
| tamanho_batelada† | number\|null | Kg por batelada |
| obs† | text\|null | Adições para mistura |
| obs_linha† | text\|null | Obs. para operador de linha |
| obs_laboratorio† | text\|null | Obs. para laboratório |
| marca† | text\|null | "ZC" ou "PG" |
| requer_mistura† | boolean | Passa pela mistura? |
| tipo_op† | text\|null | "estoque" ou "venda" |
| motivo_reprovacao† | text\|null | |
| data_reprovacao† | text\|null | |
| orientacoes† | text\|null | Orientações de produção |
| programacao_confirmada† | boolean | Confirmado pelo gestor |
| data_emissao† | text\|null | Data de emissão da OP |
| hora_inicio†, hora_fim† | text\|null | Pesagem |
| bateladas_feitas† | number\|null | Bateladas concluídas |
| obs_pausa† | text\|null | Obs. ao pausar pesagem |
| temperaturas† | jsonb\|null | Temperaturas registradas |
| criado_em | text\|null | |

### `registros_diarios`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| ordem_id | uuid (FK → ordens) | |
| data | text | YYYY-MM-DD |
| hora_inicio | text | |
| hora_fim | text | |
| registro_producao | jsonb | Array `[{qty, peso}]` |
| reprovado | boolean | Reprovado na liberação |
| contou_volume | boolean | Reprovado MAS conta no volume |

### `historico`
| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| ordem_id | text (FK → ordens.id) |
| status_anterior | text\|null |
| status_novo | text\|null |
| alterado_em | text\|null |

### `paradas`
| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| linha | number |
| data | text |
| motivo | text |
| hora_inicio | text |
| hora_fim | text |

### `formulas`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| formula_id | text | Agrupa linhas de uma fórmula |
| produto | text\|null | |
| sequencia | number\|null | Ordem de adição |
| materia_prima | text | Nome da MP |
| fornecedor | text\|null | |
| unidade | text\|null | |
| percentual | number | % da batelada |
| cod_mp† | text | **Chave de MP: código TID (ZC) ou PG** — usado na baixa de estoque |

> `cod_mp` não aparece no `types.ts` mas existe no banco e é consultado em `formulasCache.ts`, `estoqueUtils.ts`, `compararFormulas.ts`, `ConsumoMP.tsx` e `CriarOrdem.tsx`.

### `formulas_excel`
Tabela auxiliar populada pelo ImportarExcelLab (planilha do laboratório).

| Campo | Tipo | Notas |
|-------|------|-------|
| formula_id | text | |
| cod_mp_excel | text | **Chave de MP: código Excel do lab** |
| materia_prima | text | |
| percentual | number | |
| produto_chave | text\|null | |

### `ordens_formula`
Fórmula customizada por OP. Quando presente, sobrepõe a `formulas` padrão naquela OP.

| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| ordem_id | uuid (FK → ordens) |
| sequencia | number\|null |
| materia_prima | text |
| quantidade_kg | number |

### `cadastro_lotes`
| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| lote | number |
| produto | text |
| quantidade | number |
| tamanho_batelada | number\|null |
| formula_id | text\|null |
| classe | text\|null |
| criado_em | text\|null |

### `perfis`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text (PK) | = auth.users.id |
| nome | text | |
| papel | text | gestor \| operador \| tecnico \| comercial \| desenvolvimento \| compras |
| balanca | text\|null | Para operadores: "1", "2", "mistura", "linha1"–"linha5" |
| criado_em | text\|null | |

### `consumo_mp`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| cod_mp_excel | text | **Chave de MP: código Excel** |
| materia_prima | text | |
| quantidade_kg | number | |
| data_retirada | text | |
| observacao | text\|null | |
| retirado_por | text | |
| criado_em | text | |

### `mp_testadas`
| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| pigmento_zc | text |
| codigo_cliente | text |
| fornecedor | text |
| data_teste | text |
| lote | text |
| situacao | text (`"aprovado"` \| `"reprovado"` \| `"observacao"` \| `"aguardando"`) |
| motivo | text\|null |
| criado_por | text |
| criado_em | text |

### `cores_formulas`
| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| formula_id | text |
| produto | text |
| lab_l | number |
| lab_a | number |
| lab_b | number |
| observacao | text\|null |
| aplicacao | text\|null |
| criado_por | text |
| criado_em | text |

### `reaproveitamentos`
| Campo | Tipo |
|-------|------|
| id | uuid (PK) |
| codigo | text |
| produto_destino | text |
| formula_id_destino | text |
| produto_origem | text |
| formula_id_origem | text |
| quantidade_material | number |
| quantidade_utilizada | number |
| percentual_reaproveitado | number |
| status | text (`"pendente"` \| `"utilizado"`) |
| tipo_erro | text\|null (`"producao"` \| `"comercial"`) |

### `reaproveitamentos_itens`
Itens detalhados de cada reaproveitamento (FK → reaproveitamentos).

### `estoque_mp`
| Campo | Tipo | Notas |
|-------|------|-------|
| cod_tid | text (PK) | **Chave de MP ZC** |
| materia_prima | text | |
| saldo_kg | number | |
| atualizado_em | text | |

### `estoque_mp_pg`
| Campo | Tipo | Notas |
|-------|------|-------|
| cod_pg | text (PK) | **Chave de MP PG** |
| materia_prima | text | |
| saldo_kg | number | |
| atualizado_em | text | |

### `estoque_movimentacoes`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| cod_tid | text | TID (ZC) ou PG (PG) — campo reutilizado |
| materia_prima | text | |
| tipo | text | `"saida"` \| `"estorno"` \| `"entrada"` |
| quantidade_kg | number | |
| saldo_apos | number | |
| ordem_id | text\|null | FK lógica → ordens |
| ordem_lote | text\|null | |
| observacao | text\|null | |
| criado_por | text | |
| criado_em | text | |

### `mp_depara`
| Campo | Tipo | Notas |
|-------|------|-------|
| cod_excel | text | Código do laboratório (planilha) |
| cod_tid | text\|null | Código TID correspondente |

**Status**: ativa e em uso (ver §9).

### Tabelas de Manutenção
- `equipamentos` — cadastro de equipamentos
- `ordens_servico` — ordens de serviço (OS)
- `estoque_manutencao` — peças/consumíveis
- `ferramentas_manutencao` — ferramentas
- `localizacoes_ferramentas` — onde cada ferramenta está armazenada

### Notas e Relatórios
- `notas_programacao` — lembretes exibidos no painel de programação (cor, texto, data opcional)
- `relatorios_consumo_mp` — cabeçalho de relatório de consumo do lab
- `relatorios_consumo_mp_itens` — itens do relatório (por MP), FK → relatorios_consumo_mp

---

## 9. Status da Tabela `mp_depara`

A tabela `mp_depara` **não foi aposentada**. Ela é usada em dois contextos:

**1. Comparador de fórmulas** (`compararFormulas.ts` + `PainelConsultaFormula.tsx`):
- Converte `formulas.cod_mp` (TID) → `cod_excel` para comparar com `formulas_excel.cod_mp_excel`.
- Necessária porque as duas bases de fórmulas usam chaves diferentes.

**2. ImportarExcelLab** (`ImportarExcelLab.tsx`):
- A cada importação, **limpa completamente e repopula** `mp_depara` com a aba "MATÉRIA PRIMA-OK!" da planilha.
- Também atualiza `formulas_excel`.

**O que NÃO usa mais `mp_depara`**: operações de estoque rotineiras. Toda baixa/estorno usa `formulas.cod_mp` diretamente (que já é TID/PG), sem passar por `mp_depara`.

---

## 10. Chaves de Matéria-Prima por Tabela

| Tabela | Campo-chave de MP | Sistema |
|--------|------------------|---------|
| `formulas` | `cod_mp` | TID (ZC) ou PG — chave principal de produção |
| `formulas_excel` | `cod_mp_excel` | Código Excel do laboratório |
| `estoque_mp` | `cod_tid` (PK) | TID (ZC) |
| `estoque_mp_pg` | `cod_pg` (PK) | PG |
| `estoque_movimentacoes` | `cod_tid` | TID ou PG (campo reutilizado) |
| `consumo_mp` | `cod_mp_excel` | Código Excel (campo histórico, legado) |
| `mp_depara` | `cod_excel` → `cod_tid` | Bridge Excel ↔ TID |

---

## 11. Hooks Customizados (`src/hooks/`)

| Hook | Retorna | Tabelas |
|------|---------|---------|
| `useAuth()` | `{ perfil, email, loading, logout }` | `perfis` |
| `useOrdens(date?)` | OPs do dia, `concluirOrdem`, `initBalanca`, `fetchOrdens` | `ordens` |
| `useHistorico(de, ate)` | OPs concluídas | `ordens` |
| `useFormula(formulaId, batelada)` | Itens calculados (percentual × batelada) | `formulas` |
| `useParadasLinha(linha, data)` | Paradas da linha no dia, realtime | `paradas` |
| `useParadasAnalises(de, ate)` | Paradas no período | `paradas` |
| `useRegistrosDiariosOrdem(ordemId)` | Registros de uma OP, realtime | `registros_diarios` |
| `useRegistrosDiariosAnalises(de, ate)` | Registros do período com join ordens; filtro `.or("reprovado.eq.false,contou_volume.eq.true")` | `registros_diarios`, `ordens` |
| `useComprasConsumo(de, ate)` | Consumo de MP por período (OPs × fórmulas) | `ordens`, `formulas` (cache) |
| `useIsMobile()` | boolean (breakpoint 768px) | — |
| `useTheme()` | `{ theme, toggle }` | localStorage `zc_theme` |
| `use-toast()` | `{ toast }` | — |

---

## 12. Utilitários (`src/lib/`)

| Arquivo | Função principal |
|---------|----------------|
| `estoqueUtils.ts` | `baixarEstoqueOP`, `ajustarEstoqueOP`, `estornarEstoqueOP`, `verificarEstoqueOP` |
| `formulasCache.ts` | Cache 5 min; paginação de 1000 linhas/página em paralelo; seleciona `formula_id, materia_prima, percentual, cod_mp` |
| `deparaCache.ts` | Cache 5 min para `mp_depara` completa |
| `compararFormulas.ts` | Compara `formulas` (TID) vs. `formulas_excel` (Excel) usando `mp_depara` como bridge |
| `colorUtils.ts` | `deltaE2000()`, `labToRgbString()`, `classificarDeltaE()` |
| `obsUtils.ts` | `parseObsItems()`, `formatObsLine()` — parse de obs estruturadas (formato `MP: qtd un`) |
| `printZpl.ts` | `gerarZplLiberacao()`, `gerarZplBalancaMistura()`, `sanitizeZpl()` — ZPL puro, sem jsPDF |
| `printEtiqueta.ts` | `imprimirEtiqueta()` — PDF com jsPDF + Anton font (carregado sob demanda); re-exporta de printZpl.ts |
| `antonFont.ts` | Base64 da fonte Anton para jsPDF |
| `diasUteis.ts` | `diasUteis(dataEmissao, dataProgramacao)` — calcula dias úteis entre datas |
| `recalcularPosicoes.ts` | Reordena posições de OPs em uma coluna |
| `parseEstoqueTid.ts` | Parseia arquivo de estoque no formato TID |
| `utils.ts` | `formatKg()`, `sortOrdens()`, `cn()` e outros utilitários genéricos |

---

## 13. Regras de Negócio Principais

1. **Uma OP por vez na pesagem por balança**: `initBalanca()` só inicia se não houver outra OP `em_pesagem` na mesma balança.

2. **Uma OP por vez na mistura**: apenas a OP `em_mistura` é exibida. As demais ficam na fila `aguardando_mistura`. O botão "Iniciar" só aparece quando não há nenhuma em mistura.

3. **Linha obrigatória para concluir mistura**: se `ordem.linha` for nulo, `concluirMistura()` bloqueia com toast de erro.

4. **Reprovação normal vs. contando volume**:
   - Normal: OP reprovada, volta à fila (status retorna ao estado anterior).
   - Contando volume: `reprovado = true`, `contou_volume = true`, `status = concluido`. A OP encerra, o kg conta no volume total mas **não** entra no cálculo de kg/h.

5. **PainelAnalises — exclusão de retrabalho do kg/h**:
   - `registrosDiariosKgH` filtra `reprovado = false` (exclui retrabalho do kg/h).
   - `horasMap` é construído apenas de registros não-reprovados.
   - Volume total ainda conta todos os registros com `contou_volume = true`.

6. **Verificação de estoque antes de criar OP**: `verificarEstoqueOP()` retorna `MpFaltante[]` se algum item ficaria negativo. A tela alerta e pode bloquear a criação.

7. **Fórmula customizada por OP**: se `ordens_formula` tiver registros para a OP, sobrepõem a fórmula padrão (`formulas`). Isso permite ajustar a fórmula de uma OP específica sem alterar a base.

8. **ImportarExcelLab é destrutivo**: a cada importação, `mp_depara` e `formulas_excel` são completamente limpas e repovoadas.

9. **Realtime com debounce**: todos os painéis operacionais escutam mudanças via Supabase Realtime com debounce de 600–800ms para evitar re-fetches em cascata.

10. **Dias úteis e atraso**: OPs com `data_emissao` a mais de 7 dias úteis de `data_programacao` recebem borda vermelha na programação (`diasUteis() > 7`).

11. **Pre-aquecimento de cache**: ao logar, gestor e compras disparam `fetchAllFormulas()` em background; gestor também dispara `fetchAllDepara()`. Isso garante que a primeira abertura das telas de fórmula e comparação seja instantânea.

12. **types.ts está desatualizado**: o schema TypeScript do Supabase (gerado automaticamente) só tem 5 tabelas — `consumo_mp`, `cadastro_lotes`, `formulas`, `historico`, `ordens`, `perfis`. Todas as outras tabelas são acessadas com `(supabase as any).from(...)` ou simplesmente com tipagem implícita. Isso não é um bug, mas significa que autocompletar e type-checking não cobrem a maioria das tabelas operacionais.
