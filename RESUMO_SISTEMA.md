# RESUMO DO SISTEMA — Factory Scale Sync

> Documento atualizado em 2026-09-08. Reflete o estado real do código-fonte.

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
| Excel | xlsx (carregado sob demanda, via Web Worker em `excelImport.worker.ts`) |
| Etiquetas | ZPL (Zebra Programming Language) |
| Roteamento | React Router v6 (rota única `/app`) |

**Ponto de entrada**: `src/pages/Index.tsx` — renderização condicional por papel de usuário, sem sub-rotas.

**Performance**:
- Lazy loading de todas as páginas via `React.lazy` + `Suspense`
- Pré-aquecimento de chunks dos 9 painéis mais acessados após 300 ms do login
- Keep-alive de abas visitadas (componente `KeepAlive` → `display:none` em vez de desmontar)
- Cache de 5 min para tabelas `formulas` (`formulasCache.ts`) e `mp_depara` (`deparaCache.ts`)
- jsPDF e xlsx carregados via `dynamic import()` apenas quando usados
- Realtime com debounce de 600–800 ms por canal

---

## 2. Perfis de Acesso

O campo `perfis.papel` (text) define o nível de acesso. O campo `perfis.balanca` (text|null) refina o acesso dos operadores.

### GESTOR
Acesso completo ao sistema. Sidebar com todos os grupos de menu abaixo.

**Produção** (grupos colapsáveis):
- Pesagem → Balança 1, Balança 2
- Mistura → Mistura
- Linhas → Linha 1–5
- Qualidade → Liberação
- Análises → Análises da Produção, Histórico de Paradas
- Gestão → Painel do Gestor, Pré-Programação, Programação, Programação Balanças, Nova Ordem, Histórico, Consulta por Fórmula, Importar, Importar Excel Lab

**Manutenção**: Painel de Manutenção, Análise de Manutenção, Equipamentos, Abrir OS, Estoque, Ferramentas

**Comercial**: Painel Comercial

**Laboratório**: Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor

**Compras**: Estoque MP ZC, Estoque MP PG, Histórico de Movimentações, Consumo de MP, Consumo Médio Mensal, Conferência de Estoque

### OPERADOR
Interface full-screen dedicada (sem sidebar), determinada por `perfis.balanca`:

| Valor de `balanca` | Tela exibida |
|--------------------|-------------|
| `"1"` | PainelBalanca balanca=1 |
| `"2"` | PainelBalanca balanca=2 |
| `"mistura"` | PainelMistura |
| `"linha1"` a `"linha5"` | PainelLinha linha=N |

### TÉCNICO
Sidebar minimalista com apenas duas opções:
- **Painel de Manutenção** (`painel_manutencao`)
- **Abrir OS** (`abrir_os`)

O técnico não acessa Equipamentos, Estoque de Manutenção nem Ferramentas (somente gestor).

### COMERCIAL
Sidebar com grupo Comercial → Painel Comercial (único item, sempre ativo).

### COMPRAS
Sidebar com quatro grupos:
- **Compras**: Consumo de MP, Consumo Médio Mensal
- **Comercial**: Painel Comercial
- **Estoque**: Estoque MP ZC, Estoque MP PG, Histórico de Movimentações, Conferência de Estoque
- **Laboratório**: somente MP Testada

### DESENVOLVIMENTO (Laboratório)
Sidebar com grupo Laboratório:
- Consumo de MP, Reaproveitamento, Análise de Reaproveitamento, MP Testada, Controle de Cor

---

## 3. Todas as Páginas por Grupo

### Produção

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `gestor` | PainelGestor.tsx | Dashboard KPIs: OPs do dia por status, kg/hora, linhas ativas. Filtra `status ≠ pre_programacao`. Botão "Criar OP" navega para aba `criar` com lote pré-preenchido. |
| `balanca1` / `balanca2` | PainelBalanca.tsx | Pesagem de OP: exibe fórmula, bateladas feitas, pausa/retomada (obs_pausa), imprime etiqueta ZPL/PDF. |
| `mistura` | PainelMistura.tsx | Fila `aguardando_mistura`, OP em `em_mistura` com fórmula e bateladas, iniciar/concluir mistura, imprimir etiqueta. |
| `linha1`–`linha5` | PainelLinha.tsx | Produção na linha: iniciar, registrar produção por dia (registros_diarios), registrar paradas por motivo, hora início/fim, concluir OP → `aguardando_liberacao`. |
| `liberacao` | PainelLiberacao.tsx | Aprovar ou reprovar OPs em `aguardando_liberacao`. Reprovação normal (mantém status) ou contando volume (`reprovado=true + contou_volume=true + status=concluido`). |
| `analises` | PainelAnalises.tsx | kg/h por linha, volume total, retrabalho, paradas. Exclui `reprovado=true` do kg/h; inclui `contou_volume=true` no volume total. |
| `historico_paradas` | HistoricoParadas.tsx | Histórico de paradas de linha por período. |
| `programacao` | PainelProgramacao.tsx | Programação diária por linha: drag-and-drop, editar, excluir, reprogramar, forçar conclusão direta, registrar dia. |
| `programacao_balanca` | PainelProgramacaoBalanca.tsx | Programação vista por balança. |
| `pre_programacao` | PreProgramacao.tsx | OPs em `pre_programacao` aguardando definição de data/linha/balança. |
| `criar` | CriarOrdem.tsx | Cria nova OP: seleciona lote de `cadastro_lotes` (status=Em Aberto), define qtde, marca, linha, balança, fórmula, data. Alerta de reaproveitamentos/acertos registrados para a fórmula. Baixa automática de estoque ao confirmar. |
| `historico` | PainelHistorico.tsx | Histórico de OPs concluídas com filtros de data e busca. |
| `consulta_formula` | PainelConsultaFormula.tsx | Consulta e comparação de fórmulas (TID vs. Excel via `mp_depara`). |
| `importar` | ImportarProgramacao.tsx | Importa programação de arquivo texto (formato específico). |
| `importar_excel` | ImportarExcelLab.tsx | Importa `formulas_excel` e `mp_depara` de planilha Excel do laboratório. Usa Web Worker. Limpa e repopula as duas tabelas a cada execução. |

### Manutenção

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `painel_manutencao` | PainelManutencao.tsx | Dashboard de OS: abertas, em andamento, concluídas. Andamentos por OS, peças avulsas, visualização por equipamento. |
| `analise_manutencao` | PainelAnaliseManutencao.tsx | KPIs de manutenção: MTBF, tempo médio de reparo, OS por categoria. |
| `cadastro_equipamentos` | CadastroEquipamentos.tsx | CRUD de equipamentos com nome, categoria, localização, status (`ativo`/`inativo`). |
| `abrir_os` | AbrirOS.tsx | Abertura de Ordem de Serviço. Disponível para gestor e técnico. |
| `estoque_manutencao` | EstoqueManutencao.tsx | Estoque de peças/consumíveis: entrada, saída, saldo por item. |
| `ferramentas_manutencao` | FerramentasManutencao.tsx | Gestão de ferramentas: localização, empréstimo, devolução. |

### Comercial

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `comercial` | PainelComercial.tsx | Dados comerciais das OPs (tipo estoque/venda, destino, marca). |

### Laboratório

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `consumo_mp` | ConsumoMP.tsx | Registra consumo de MP no lab/produção. Flag "é acerto de material" vincula a uma OP. Baixa de `estoque_mp` (cod_tid) ou `estoque_mp_pg` (cod_pg). Relatórios salvos em `relatorios_consumo_mp`. |
| `reaproveitamento` | Reaproveitamento.tsx | Cadastra material para reaproveitamento: múltiplas origens (`reaproveitamentos_materiais`), fórmula de destino, percentual, tipo de erro. |
| `analise_reaproveitamento` | PainelAnaliseReaproveitamento.tsx | Dashboard de reaproveitamentos pendentes e utilizados. Permite marcar como "utilizado". |
| `mp_testadas` | ControleMPTestada.tsx | Rastreia testes de qualidade de MPs recebidas. Situações: aprovado, reprovado, observacao, aguardando. |
| `controle_cor` | ControleCor.tsx | Registra cores de fórmulas em CIE L\*a\*b\*. Calcula ΔE 2000 entre amostras. Lab→RGB para preview visual. |

### Compras

| Tab ID | Arquivo | Funcionalidades |
|--------|---------|----------------|
| `compras_consumo` | ComprasConsumo.tsx | Consumo de MP por período: OPs concluídas × percentuais das fórmulas. |
| `compras_media_mensal` | ComprasMediaMensal.tsx | Média mensal de consumo de MP com tendências. |
| `estoque_mp` | EstoqueMP.tsx | Saldo ZC (cod_tid): entrada manual, saída manual, importação Excel, saldo mínimo. |
| `estoque_mp_pg` | EstoqueMPPG.tsx | Saldo PG (cod_pg): mesmas funções. |
| `historico_mov_mp` | HistoricoMovimentacoesMP.tsx | Histórico de movimentações ZC e PG: saída, estorno, entrada, ajuste, saldo_inicial. |
| `conferencia_estoque` | ConferenciaEstoque.tsx | Confronta saldo atual com lançamentos para conferência física. |

---

## 4. Fluxo de Status da OP

```
[Criação]
    ↓
pre_programacao  ←  OP criada aguardando ser programada (sem data/linha)
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
```

**Variante "contando volume"** (reprovar mas contabilizar produção):
- `reprovado=true` + `contou_volume=true` + `status=concluido`
- OP encerra, kg conta no volume total mas **não** entra no cálculo de kg/h.

**Conclusão direta** (`conclusao_direta=true`):
- OP encerra sem passar pela linha (marcada no painel de programação).
- Excluída de `PainelAnalises` (filtro `conclusao_direta=false`).

**Todos os valores de status no código**:
`pre_programacao` | `pendente` | `em_pesagem` | `aguardando_mistura` | `em_mistura` | `aguardando_linha` | `em_linha` | `aguardando_liberacao` | `concluido` | `reprovado`

Toda transição de status é auditada em `historico` (status_anterior → status_novo).

---

## 5. Módulos de Laboratório — Detalhamento

### 5.1 Consumo de MP (`ConsumoMP.tsx`)
- Registra retirada de MP: `cod_tid`, `materia_prima`, `quantidade_kg`, `data_retirada`, `setor` ('laboratorio'|'producao'), `observacao`, `retirado_por`.
- **Flag "É acerto de material?"**: busca OP por lote/produto, vincula via `acerto_lote` + `acerto_formula_id`. O sistema sugere o item de fórmula correspondente (`cod_mp` da fórmula).
- **Baixa automática**: deduz de `estoque_mp` (ZC, por cod_tid) ou `estoque_mp_pg` (PG, por cod_pg) conforme onde o código está cadastrado.
- **Relatórios**: salvos em `relatorios_consumo_mp` (cabeçalho: título, período, total_kg, num_mps) e `relatorios_consumo_mp_itens` (detalhe por MP).
- **Busca de MP**: autocomplete via `estoque_mp` — campo `cod_tid` + `materia_prima`.

### 5.2 Reaproveitamento (`Reaproveitamento.tsx`)
- Cadastra material a reaproveitar com **múltiplas origens** (`reaproveitamentos_materiais`): cada origem tem `produto_origem`, `formula_id_origem`, `quantidade_material`, `quantidade_utilizada`.
- Destino: `produto_destino`, `formula_id_destino`.
- Campos do registro principal: `codigo`, `quantidade_material`, `quantidade_utilizada`, `percentual_reaproveitado`.
- `status`: `"pendente"` (disponível) | `"utilizado"` (já consumido com `utilizado_em` + `utilizado_por`).
- `tipo_erro`: `"producao"` | `"comercial"` | null.
- Itens de fórmula detalhados em `reaproveitamentos_itens` (cod_tid, percentual, eh_reaproveitado).

### 5.3 Análise de Reaproveitamento (`PainelAnaliseReaproveitamento.tsx`)
- Dashboard de reaproveitamentos. Filtra por status, marca como "utilizado", exibe métricas de aproveitamento.

### 5.4 MP Testada (`ControleMPTestada.tsx`)
- Rastreia testes de qualidade de MPs recebidas.
- `situacao`: `"aprovado"` | `"reprovado"` | `"observacao"` | `"aguardando"`.
- Campos: `pigmento_zc`, `codigo_cliente`, `fornecedor`, `data_teste`, `lote`, `motivo`, `criado_por`.
- Visível para: gestor, desenvolvimento, compras.

### 5.5 Controle de Cor (`ControleCor.tsx`)
- Armazena cor de referência de cada fórmula em CIE L\*a\*b\*.
- Campos: `formula_id`, `produto`, `lab_l`, `lab_a`, `lab_b`, `observacao`, `aplicacao`.
- Calcula **ΔE 2000** via `deltaE2000()` (Sharma et al., 2005) em `colorUtils.ts`.
- Classificação: ΔE ≤ 1,5 → Aceitável (verde) | 1,5–2,5 → Sugestão (âmbar) | > 2,5 → Distante (cinza).
- Conversão Lab→sRGB (D65, gamma correction) para preview visual de cor.

---

## 6. Estoque de Matéria-Prima

### 6.1 Estoque ZC — `estoque_mp`
- Chave: `cod_tid` (text, PK)
- Campos: `materia_prima`, `saldo_kg`, `minimo_kg`, `atualizado_em`
- Tela `EstoqueMP.tsx`: entrada manual, saída manual, importação via Excel, alerta de saldo abaixo do mínimo.
- Situação calculada: `negativo` (saldo < 0) | `abaixo` (saldo < minimo_kg) | `ok`.

### 6.2 Estoque PG — `estoque_mp_pg`
- Chave: `cod_pg` (text, PK)
- Campos: `materia_prima`, `saldo_kg`, `atualizado_em`
- Tela `EstoqueMPPG.tsx`: mesmas funções.

### 6.3 Histórico — `estoque_movimentacoes`
Toda movimentação (automática ou manual) é registrada com:
`cod_tid`, `materia_prima`, `tipo`, `quantidade_kg`, `saldo_apos`, `ordem_id`, `ordem_lote`, `observacao`, `criado_por`, `criado_em`.

Tipos: `"saida"` | `"estorno"` | `"entrada"` | `"ajuste"` | `"saldo_inicial"`

> O campo `cod_tid` é reutilizado também para movimentações PG — não há tabela separada `estoque_movimentacoes_pg` em uso atual.

### 6.4 Baixa Automática ao Criar OP (`estoqueUtils.ts`)
1. Carrega itens da fórmula (`cod_mp, materia_prima, percentual`).
2. Para cada item: `consumo_kg = (percentual / 100) × quantidade_op`.
3. Busca `cod_mp` em `estoque_mp` (campo `cod_tid`). Se não achar, busca em `estoque_mp_pg` (campo `cod_pg`). MP sem cadastro em nenhum estoque é ignorada.
4. Deduz do saldo via upsert.
5. Insere movimentação tipo `"saida"` em `estoque_movimentacoes`.

**Verificação prévia**: `verificarEstoqueOP()` checa se alguma MP ficaria negativa. Retorna `MpFaltante[]` e pode bloquear a criação.

**Ajuste de quantidade**: ao editar a OP — `ajustarEstoqueOP()` calcula delta e lança `"saida"` ou `"estorno"`.

**Estorno ao excluir**: `estornarEstoqueOP()` reverte todas as movimentações anteriores da OP.

---

## 7. Acerto de Material

Funcionalidade no módulo **Consumo de MP** (laboratório):
- Toggle "É acerto de material?" ao registrar consumo.
- Com a flag ativa, busca a OP sendo acertada (por lote/nome) e vincula: `eh_acerto=true`, `acerto_lote`, `acerto_formula_id`.
- Na tela **CriarOrdem**, o sistema detecta reaproveitamentos e acertos registrados para a mesma fórmula e exibe alerta com contagem.

---

## 8. Pré-Programação e Conclusão Direta

### Pré-Programação (`PreProgramacao.tsx`)
- Lista OPs em `status='pre_programacao'`.
- Gestor define data de programação, linha e balança → status muda para `pendente`.

### Conclusão Direta
- Marcada no Painel de Programação pelo gestor.
- Campo `conclusao_direta=true` na OP.
- OP encerra sem passar pela pesagem/linha/liberação normais.
- Excluída das análises de kg/h (`useAnalises` filtra `conclusao_direta=false`).

---

## 9. Manutenção — Detalhamento

### Painel de Manutenção (`PainelManutencao.tsx`)
- Recebe props: `papel`, `perfilId`, `perfilNome`.
- Exibe OS por status: `aberta` | `em_andamento` | `concluida`.
- Cada OS tem andamentos (`os_andamentos`) e peças avulsas (`pecas_avulsas_os`).
- Gestor pode concluir OS; técnico pode registrar andamentos.

### Abrir OS (`AbrirOS.tsx`)
- Cria nova OS: seleciona equipamento de `equipamentos`, descreve problema, define prioridade.
- Disponível para gestor e técnico. Após sucesso, redireciona ao Painel de Manutenção.

### Análise de Manutenção (`PainelAnaliseManutencao.tsx`)
- MTBF (tempo médio entre falhas): intervalo médio entre OS concluídas por equipamento.
- Tempo médio de reparo: `data_conclusao - data_abertura`.
- Filtros por data e categoria de equipamento.

### Estoque de Manutenção (`EstoqueManutencao.tsx`)
- Gerencia peças e consumíveis de manutenção.
- Entrada, saída e consulta de saldo por item.
- Tabelas: `estoque_manutencao`, `movimentacoes_estoque`.

### Ferramentas (`FerramentasManutencao.tsx`)
- Inventário de ferramentas com localização.
- Registro de empréstimo (`emprestimos_ferramentas`): responsável, data empréstimo, data devolução.
- Status: `"disponivel"` | `"emprestada"`.

---

## 10. Todas as Tabelas do Banco

> Campos marcados com † existem no código mas **não estão** no `src/integrations/supabase/types.ts` (schema gerado desatualizado). Acessados com `(supabase as any).from(...)`.

### `ordens`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| lote | text | |
| produto | text | |
| quantidade | number | Quantidade programada (kg) |
| quantidade_real† | number\|null | Quantidade real produzida |
| status | text | Ver §4 |
| data_programacao | text | YYYY-MM-DD |
| data_conclusao | text\|null | Preenchida ao concluir |
| data_emissao† | text\|null | Data de emissão da OP |
| balanca | number | 1 ou 2 |
| linha | number | 1–5 |
| posicao | number\|null | Posição na fila |
| formula_id† | text\|null | Referência lógica → formulas.formula_id |
| tamanho_batelada† | number\|null | Kg por batelada |
| obs† | text\|null | Adições para mistura |
| obs_linha† | text\|null | Obs. para operador de linha |
| obs_laboratorio† | text\|null | Obs. para laboratório |
| obs_pausa† | text\|null | Obs. ao pausar pesagem |
| marca† | text\|null | "ZC" ou "PG" |
| requer_mistura† | boolean | Passa pela mistura? |
| tipo_op† | text\|null | "estoque" ou "venda" |
| motivo_reprovacao† | text\|null | |
| data_reprovacao† | text\|null | |
| orientacoes† | text\|null | Orientações de produção |
| programacao_confirmada† | boolean | Confirmado pelo gestor |
| hora_inicio†, hora_fim† | text\|null | Pesagem |
| bateladas_feitas† | number\|null | Bateladas concluídas na pesagem |
| temperaturas† | jsonb\|null | Temperaturas registradas |
| conclusao_direta† | boolean | Encerrada sem passar pelas etapas normais |
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
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| linha | number | |
| data | text | |
| motivo | text | manutencao \| sem_material \| problema_processo \| falta_energia \| reuniao \| outros |
| hora_inicio | text | |
| hora_fim | text | |

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
| cod_mp† | text | **Chave de MP: cod_tid (ZC) ou cod_pg (PG)** — usado na baixa de estoque |

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
| cod_tid | text | **Chave de MP: código TID (ZC) ou PG** — após migração de cod_mp_excel |
| materia_prima | text | |
| quantidade_kg | number | |
| data_retirada | text | |
| setor | text | `"laboratorio"` \| `"producao"` \| null |
| observacao | text\|null | |
| retirado_por | text | |
| eh_acerto | boolean\|null | É acerto de material? |
| acerto_lote | text\|null | Lote da OP sendo acertada |
| acerto_formula_id | text\|null | formula_id da OP sendo acertada |
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
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| codigo | text | |
| produto_destino | text | |
| formula_id_destino | text | |
| quantidade_material | number | |
| quantidade_utilizada | number | |
| percentual_reaproveitado | number | |
| status | text | `"pendente"` \| `"utilizado"` |
| tipo_erro | text\|null | `"producao"` \| `"comercial"` |
| observacao | text\|null | |
| criado_por | text | |
| criado_em | text | |
| utilizado_em | text\|null | |
| utilizado_por | text\|null | |

### `reaproveitamentos_itens`
Itens da fórmula de destino (FK → reaproveitamentos).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| reaproveitamento_id | uuid (FK) | |
| sequencia | number | |
| materia_prima | text | |
| cod_tid | text | **cod_tid** |
| percentual | number | |
| eh_reaproveitado | boolean | Indica se este item vem do material reaproveitado |

### `reaproveitamentos_materiais`
Origens do material reaproveitado (suporte a múltiplas origens por reaproveitamento).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid (PK) | |
| reaproveitamento_id | uuid (FK) | |
| sequencia | number | |
| produto_origem | text | |
| formula_id_origem | text | |
| quantidade_material | number | |
| quantidade_utilizada | number | |
| percentual_reaproveitado | number | |

### `estoque_mp`
| Campo | Tipo | Notas |
|-------|------|-------|
| cod_tid | text (PK) | **Chave de MP ZC** |
| materia_prima | text | |
| saldo_kg | number | |
| minimo_kg | number\|null | Limite mínimo para alerta |
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
| cod_tid | text | TID (ZC) ou cod_pg (PG) — campo reutilizado |
| materia_prima | text | |
| tipo | text | `"saida"` \| `"estorno"` \| `"entrada"` \| `"ajuste"` \| `"saldo_inicial"` |
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

**Uso atual**: exclusivamente no comparador de fórmulas (ver §11). **Não** usada em operações de estoque.

### Tabelas de Manutenção

| Tabela | Campos principais | Notas |
|--------|------------------|-------|
| `equipamentos` | id, nome, categoria, localizacao, status (`ativo`/`inativo`) | Cadastro de equipamentos |
| `ordens_servico` | id, equipamento_id, data_abertura, data_conclusao, status (`aberta`/`em_andamento`/`concluida`), descricao, prioridade, criado_por | OS principal |
| `os_andamentos` | id, os_id, status, timestamp, anotacoes, responsavel | Log de progresso por OS |
| `pecas_avulsas_os` | id, os_id, descricao, quantidade, unidade | Peças avulsas vinculadas a uma OS |
| `estoque_manutencao` | id, descricao, quantidade, localizacao | Peças/consumíveis em estoque |
| `movimentacoes_estoque` | id, estoque_id, tipo (`entrada`/`saida`), quantidade, motivo, timestamp | Movimentações do estoque de manutenção |
| `ferramentas_manutencao` | id, descricao, status (`disponivel`/`emprestada`), localizacao | Inventário de ferramentas |
| `emprestimos_ferramentas` | id, ferramenta_id, responsavel, data_emprestimo, data_devolucao | Log de empréstimos |
| `localizacoes_ferramentas` | id, nome, descricao | Locais de armazenamento de ferramentas |

### Notas e Relatórios

| Tabela | Campos principais | Notas |
|--------|------------------|-------|
| `notas_programacao` | id, texto, cor, data_opcional | Lembretes no painel de programação |
| `relatorios_consumo_mp` | id, titulo, data_inicio, data_fim, setor, total_kg, num_mps, criado_por, criado_em | Cabeçalho de relatório de consumo lab |
| `relatorios_consumo_mp_itens` | id, relatorio_id, materia_prima, cod_tid, total_kg, percentual, setor | Detalhe por MP do relatório |
| `alerta_relatorio_mp` | — | Alertas de relatório de MP (componente `AlertaRelatorioMP`, exibido apenas para gestor) |
| `inf_lab_fixa` | — | Informações fixas de laboratório por OP (consultadas em Liberação e Histórico) |
| `notas_programacao` | — | Notas/lembretes no painel de programação |

---

## 11. Status da Tabela `mp_depara`

A tabela `mp_depara` **está ativa mas com escopo restrito**. Usada em dois contextos:

**1. Comparador de fórmulas** (`compararFormulas.ts` + `PainelConsultaFormula.tsx`):
- Converte `formulas.cod_mp` (TID) → `cod_excel` para comparar com `formulas_excel.cod_mp_excel`.
- Necessária porque as duas bases de fórmulas usam chaves diferentes.

**2. ImportarExcelLab** (`ImportarExcelLab.tsx`):
- A cada importação, **limpa completamente e repopula** `mp_depara` com a aba "MATÉRIA PRIMA-OK!" da planilha.
- Também atualiza `formulas_excel`.

**O que NÃO usa `mp_depara`**: operações de estoque rotineiras, consumo de MP, reaproveitamentos. Toda baixa/estorno usa `formulas.cod_mp` (já é TID/PG) diretamente.

---

## 12. Chaves de Matéria-Prima por Tabela

| Tabela | Campo-chave de MP | Sistema |
|--------|------------------|---------|
| `formulas` | `cod_mp` | TID (ZC) ou cod_pg (PG) — chave principal de produção |
| `formulas_excel` | `cod_mp_excel` | Código Excel do laboratório |
| `estoque_mp` | `cod_tid` (PK) | TID (ZC) |
| `estoque_mp_pg` | `cod_pg` (PK) | PG |
| `estoque_movimentacoes` | `cod_tid` | TID ou cod_pg (campo reutilizado) |
| `consumo_mp` | `cod_tid` | **TID** (migrado de cod_mp_excel) |
| `reaproveitamentos_itens` | `cod_tid` | TID |
| `relatorios_consumo_mp_itens` | `cod_tid` | TID |
| `mp_depara` | `cod_excel` → `cod_tid` | Bridge Excel ↔ TID (só comparador de fórmulas) |

---

## 13. Hooks Customizados (`src/hooks/`)

| Hook | Retorna | Tabelas |
|------|---------|---------|
| `useAuth()` | `{ perfil, email, loading, logout }` | `perfis` |
| `useOrdens(date?)` | OPs do dia, `concluirOrdem`, `initBalanca`, `fetchOrdens` | `ordens` |
| `useHistorico(de, ate)` | OPs concluídas | `ordens` |
| `useAnalises(de, ate)` | OPs concluídas com `conclusao_direta=false` | `ordens` |
| `useFormula(formulaId, batelada)` | Itens calculados (percentual × batelada) | `formulas` |
| `useParadasLinha(linha, data)` | Paradas da linha no dia, realtime | `paradas` |
| `useParadasAnalises(de, ate)` | Paradas no período | `paradas` |
| `useRegistrosDiariosOrdem(ordemId)` | Registros de uma OP, realtime | `registros_diarios` |
| `useRegistrosDiariosAnalises(de, ate)` | Registros do período; filtro `reprovado=false OR contou_volume=true` | `registros_diarios`, `ordens` |
| `useComprasConsumo(de, ate)` | Consumo de MP por período (OPs × fórmulas via cache) | `ordens`, `formulas` (cache) |
| `useAlertaRelatorioMP()` | Alertas de relatório de MP para o gestor | `alerta_relatorio_mp` |
| `useIsMobile()` | boolean (breakpoint 768 px) | — |
| `useTheme()` | `{ theme, toggle }` | localStorage `zc_theme` |
| `use-toast()` | `{ toast }` | — |

---

## 14. Utilitários (`src/lib/`)

| Arquivo | Funções principais |
|---------|-------------------|
| `estoqueUtils.ts` | `baixarEstoqueOP`, `ajustarEstoqueOP`, `estornarEstoqueOP`, `verificarEstoqueOP` |
| `formulasCache.ts` | Cache 5 min; paginação 1000 linhas/página em paralelo; seleciona `formula_id, materia_prima, percentual, cod_mp` |
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

## 15. Regras de Negócio Principais

1. **Uma OP por vez na pesagem por balança**: `initBalanca()` só inicia se não houver outra OP `em_pesagem` na mesma balança.

2. **Uma OP por vez na mistura**: apenas a OP `em_mistura` é exibida. As demais ficam em `aguardando_mistura`. O botão "Iniciar" só aparece quando não há nenhuma em mistura.

3. **Linha obrigatória para concluir mistura**: se `ordem.linha` for nulo, `concluirMistura()` bloqueia com toast de erro.

4. **Reprovação normal vs. contando volume**:
   - Normal: status permanece, `motivo_reprovacao` + `data_reprovacao` são preenchidos.
   - Contando volume: `reprovado=true`, `contou_volume=true`, `status=concluido`. Kg conta no volume total mas **não** no kg/h.

5. **PainelAnalises — exclusão de retrabalho do kg/h**:
   - `registrosDiariosKgH` filtra `reprovado=false`.
   - Volume total conta todos com `contou_volume=true`.

6. **Verificação de estoque antes de criar OP**: `verificarEstoqueOP()` retorna `MpFaltante[]` se algum item ficaria negativo. A tela alerta e pode bloquear a criação.

7. **Fórmula customizada por OP**: se `ordens_formula` tiver registros para a OP, sobrepõem a fórmula padrão (`formulas`). Permite ajustar a fórmula de uma OP específica sem alterar a base.

8. **ImportarExcelLab é destrutivo**: a cada importação, `mp_depara` e `formulas_excel` são completamente limpas e repovoadas. Usa Web Worker para não bloquear a UI.

9. **Realtime com debounce**: todos os painéis operacionais escutam mudanças via Supabase Realtime com debounce de 600–800 ms para evitar re-fetches em cascata.

10. **Dias úteis e atraso**: OPs com `data_emissao` a mais de 7 dias úteis de `data_programacao` recebem borda vermelha na programação (`diasUteis() > 7`).

11. **Pré-aquecimento de cache**: ao logar, gestor e compras disparam `fetchAllFormulas()` em background; gestor também dispara `fetchAllDepara()`. Garante primeira abertura instantânea das telas de fórmula e comparação.

12. **`types.ts` desatualizado**: o schema TypeScript gerado automaticamente cobre apenas 5–6 tabelas. Todas as demais são acessadas com `(supabase as any).from(...)` ou tipagem implícita — não é um bug, mas autocompletar não cobre a maioria das tabelas operacionais.

13. **Conclusão direta**: OPs com `conclusao_direta=true` encerram sem pesagem/linha/liberação. São excluídas do cálculo de kg/h e análises de produção.

14. **Cod MP no consumo_mp**: após migração, o campo é `cod_tid` (não mais `cod_mp_excel`). A busca de MP no formulário usa `estoque_mp` (cod_tid + materia_prima) como fonte de autocomplete.
