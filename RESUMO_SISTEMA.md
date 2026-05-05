# ZanCollor Produção — Resumo Completo do Sistema

> Gerado em 05/05/2026. Descreve todas as funcionalidades, fluxos, regras de negócio e estrutura técnica do sistema de gestão de produção da ZanCollor.

---

## 1. Visão Geral

O sistema **ZanCollor Produção** é uma aplicação web de gestão da linha de produção fabril. Ele substitui controles manuais e planilhas, conectando em tempo real todos os pontos da fábrica: pesagem, mistura, linhas de produção, liberação de qualidade e o setor comercial.

**Stack:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase (PostgreSQL + Auth + Realtime)

---

## 2. Perfis de Usuário

O campo `papel` na tabela `perfis` determina o que cada usuário vê e pode fazer.

| Papel | Descrição | Acesso |
|---|---|---|
| `gestor` | Administrador de produção | Acesso completo a todos os painéis |
| `operador` | Operador de chão de fábrica | Apenas a estação atribuída (via campo `balanca`) |
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
- Exibe status em tempo real.

---

### 4.10 Análises de Produção (`PainelAnalises.tsx`)
**Quem usa:** gestor

Dashboard analítico com gráficos de produtividade.

**Indicadores:**
- Produtividade por linha (kg/hora).
- Distribuição de tamanho de OPs.
- Timeline de produção por linha.
- Impacto de paradas na eficiência.
- Seletores de período com atalhos rápidos (última semana, mês etc.).

---

### 4.11 Consulta por Fórmula (`PainelConsultaFormula.tsx`)
**Quem usa:** gestor

Busca e exibe o conteúdo completo de uma fórmula pelo `formula_id`.

---

### 4.12 Importar Programação (`ImportarProgramacao.tsx`)
**Quem usa:** gestor

Importa lotes de um arquivo CSV (codificação Windows-1252, gerado pelo SAP/ERP) para a tabela `cadastro_lotes`.

Campos esperados: número do lote, produto, quantidade, `formula_id`, data de emissão.

---

### 4.13 Painel Comercial (`PainelComercial.tsx`)
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

- OPs confirmadas têm borda verde; não confirmadas têm borda laranja.
- Mostra "Disponível desde [data]" se a data já passou.
- Mostra "(estimado)" para OPs não confirmadas.

---

## 5. Regras de Negócio

### 5.1 Regra dos 7 Dias Úteis
- Toda OP não confirmada tem disponibilidade estimada calculada como: `data_emissao + 7 dias úteis`.
- Dias úteis excluem sábados, domingos e feriados nacionais brasileiros (fixos + Páscoa e seus derivados: Carnaval, Sexta-feira Santa, Corpus Christi).
- Se `diasUteis(data_emissao, data_programacao) > 7` → OP é considerada **em atraso** (alerta vermelho na programação e no painel do gestor).

### 5.2 Fórmulas e Bateladas
- A fórmula define ingredientes como `percentual` do total.
- `quantidade_kg = (percentual / 100) × tamanho_batelada`.
- Customizações por OP são salvas em `ordens_formula` e têm prioridade sobre a fórmula base.
- O número de bateladas é calculado como `round(quantidade / tamanho_batelada)`.

### 5.3 Posição na Fila
- Cada OP tem um campo `posicao` (inteiro) que define a ordem na fila da linha.
- Após qualquer alteração (criação, drag-and-drop, mudança de linha), `recalcularPosicoes(linha)` é chamado para renumerar sequencialmente as OPs não concluídas daquela linha.

### 5.4 Registros Diários
- OPs em linha podem ter produção registrada dia a dia (permite OPs que duram múltiplos dias).
- Cada registro em `registros_diarios` contém: data, hora início/fim, itens produzidos (bateladas × peso unitário em kg).
- Ao registrar o dia, a `data_programacao` avança para o próximo dia útil, movendo a OP para o dia seguinte no kanban.

### 5.5 Lotes e Ordens
- O lote é o identificador primário vindo do ERP (SAP).
- Um lote só pode ter **uma OP ativa** no sistema.
- Ao criar a OP, `data_emissao` é sincronizada de volta para `cadastro_lotes` para que o painel comercial possa calcular disponibilidade via `data_emissao`.

### 5.6 Marca
- Cada OP pertence a uma marca: **Pigma** ou **Zan Collor**.
- Exibida como badge colorido nos cards e na tabela de gestor.

### 5.7 Atualização de Status — Garantias
- Ao **concluir pesagem** (`PainelBalanca`): apenas `status` é atualizado.
- Ao **concluir mistura** (`PainelMistura`): apenas `status` e `linha` são atualizados. `data_programacao` não é tocada.
- Ao **confirmar/desconfirmar** (`PainelProgramacao`): apenas `programacao_confirmada` é atualizado.

---

## 6. Estrutura do Banco de Dados

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
| `data_emissao` | DATE | Data de emissão do lote (base para regra dos 7 dias) |
| `data_conclusao` | TIMESTAMP | Quando foi concluída |
| `posicao` | INTEGER | Posição na fila da linha |
| `formula_id` | TEXT | Referência à fórmula |
| `tamanho_batelada` | NUMERIC | Tamanho de cada batelada em kg |
| `marca` | TEXT | `Pigma` ou `Zan Collor` |
| `obs` | TEXT | JSON: adições para mistura `[{qty, mp}]` |
| `obs_laboratorio` | TEXT | Anotações do laboratório |
| `requer_mistura` | BOOLEAN | Se deve passar pela etapa de mistura |
| `programacao_confirmada` | BOOLEAN | Confirmação comercial da programação |
| `hora_inicio` | TIME | Hora de início da produção na linha |
| `hora_fim` | TIME | Hora de fim |
| `quantidade_real` | NUMERIC | Quantidade efetivamente produzida (kg) |
| `motivo_reprovacao` | TEXT | Motivo em caso de reprovação na liberação |
| `criado_em` | TIMESTAMP | Criação do registro |

### Tabela `cadastro_lotes`
Registro mestre de lotes importados do ERP.

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
Receituário de ingredientes.

| Campo | Tipo | Descrição |
|---|---|---|
| `formula_id` | TEXT | Identificador da fórmula |
| `produto` | TEXT | Produto ao qual pertence |
| `sequencia` | INTEGER | Ordem dos ingredientes |
| `materia_prima` | TEXT | Nome da matéria-prima |
| `fornecedor` | TEXT | Fornecedor |
| `unidade` | TEXT | Unidade (kg, l, etc.) |
| `percentual` | NUMERIC | % da batelada |

### Tabela `ordens_formula`
Quantidades customizadas por OP (sobrescreve a fórmula base).

| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `sequencia` | INTEGER | Sequência do item |
| `materia_prima` | TEXT | Nome |
| `quantidade_kg` | NUMERIC | Quantidade customizada |

### Tabela `registros_diarios`
Produção registrada por dia por OP.

| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `data` | DATE | Data do registro |
| `hora_inicio` | TIME | Início |
| `hora_fim` | TIME | Fim |
| `registro_producao` | JSONB | Array de `{qty, peso}` (bateladas × kg) |

### Tabela `paradas`
Paralisações de linha.

| Campo | Tipo | Descrição |
|---|---|---|
| `linha` | INTEGER | Linha afetada |
| `data` | DATE | Data da parada |
| `motivo` | TEXT | `manutencao`, `sem_material`, `problema_processo`, `falta_energia` |
| `hora_inicio` | TIME | Início da parada |
| `hora_fim` | TIME | Fim da parada |

### Tabela `historico`
Log de mudanças de status das OPs.

| Campo | Tipo | Descrição |
|---|---|---|
| `ordem_id` | UUID | FK para ordens |
| `status_anterior` | TEXT | Status antes |
| `status_novo` | TEXT | Status depois |
| `alterado_em` | TIMESTAMP | Quando ocorreu |

### Tabela `perfis`
Perfis de usuário (complementa Supabase Auth).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT | UUID do usuário (Supabase Auth) |
| `nome` | TEXT | Nome de exibição |
| `papel` | TEXT | `gestor`, `operador`, `comercial` |
| `balanca` | TEXT | Estação do operador: `1`, `2`, `mistura`, `linha1`–`linha5` |

---

## 7. Funcionalidades em Tempo Real

O Supabase Realtime (PostgreSQL change notifications) mantém os painéis atualizados automaticamente.

| Painel | Canal | Debounce |
|---|---|---|
| Painel Gestor | `gestor-pendentes-global` | 300ms |
| Programação | Canal por data | 600ms |
| Balança | Canal por balança | 300ms |
| Mistura | `mistura-realtime` | 300ms |
| Linha | Canal por linha | 300ms |
| Paradas | Canal por linha | imediato |
| Registros diários | Canal por ordem | imediato |

---

## 8. Utilitários e Funções Principais

| Arquivo | Função | O que faz |
|---|---|---|
| `lib/diasUteis.ts` | `diasUteis(de, ate)` | Conta dias úteis entre duas datas |
| `lib/diasUteis.ts` | `proximoDiaUtil(data)` | Retorna o próximo dia útil após a data |
| `lib/diasUteis.ts` | `somarDiasUteis(data, n)` | Soma N dias úteis a uma data |
| `lib/recalcularPosicoes.ts` | `recalcularPosicoes(linha)` | Renumera a fila de uma linha |
| `lib/printEtiqueta.ts` | `printEtiqueta(ordem, itens)` | Gera e imprime a etiqueta da OP |
| `lib/obsUtils.ts` | `parseObsItems(obs)` | Decodifica o JSON de adições para mistura |
| `lib/utils.ts` | `sortOrdens(ordens)` | Ordena OPs: concluídas/em liberação no topo, depois por posição |
| `lib/utils.ts` | `formatKg(valor)` | Formata número como kg (3 casas, pt-BR) |

---

## 9. Componentes Reutilizáveis

| Componente | Descrição |
|---|---|
| `StatusBadge` | Badge colorido com o status da OP |
| `MarcaBadge` | Badge da marca (Pigma / Zan Collor) |
| `EditarOrdemDialog` | Modal de edição completa de uma OP |
| `DetalheOrdemDialog` | Modal com histórico completo de registros da OP |
| `MetricCard` | Card de métrica para o painel de análises |

---

## 10. Estrutura de Arquivos

```
src/
├── pages/
│   ├── Index.tsx                   # Shell principal, roteamento por papel
│   ├── Login.tsx                   # Autenticação
│   ├── PainelGestor.tsx            # Dashboard do gestor
│   ├── PainelProgramacao.tsx       # Kanban de programação (5 linhas)
│   ├── CriarOrdem.tsx              # Criação de nova OP
│   ├── PainelBalanca.tsx           # Estação de pesagem
│   ├── PainelMistura.tsx           # Estação de mistura
│   ├── PainelLinha.tsx             # Linha de produção
│   ├── PainelLiberacao.tsx         # Liberação/qualidade
│   ├── PainelHistorico.tsx         # Histórico de OPs concluídas
│   ├── PainelAnalises.tsx          # Dashboard analítico
│   ├── PainelComercial.tsx         # Consulta de disponibilidade
│   ├── PainelConsultaFormula.tsx   # Consulta de fórmulas
│   ├── PainelProgramacaoBalanca.tsx # Programação por balança
│   └── ImportarProgramacao.tsx     # Importação de CSV
├── components/
│   ├── StatusBadge.tsx
│   ├── MarcaBadge.tsx
│   ├── EditarOrdemDialog.tsx
│   ├── DetalheOrdemDialog.tsx
│   ├── MetricCard.tsx
│   └── ui/                         # Componentes shadcn/ui
├── hooks/
│   ├── useAuth.ts
│   ├── useOrdens.ts
│   ├── useFormula.ts
│   └── use-toast.ts
├── lib/
│   ├── diasUteis.ts
│   ├── recalcularPosicoes.ts
│   ├── obsUtils.ts
│   ├── printEtiqueta.ts
│   └── utils.ts
└── integrations/supabase/
    ├── client.ts
    └── types.ts

supabase/migrations/               # Histórico de alterações no banco
```
