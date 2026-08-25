// src/pages/ConferenciaEstoque.tsx
//
// Conferência de Estoque — confronta o saldo de matéria-prima do relatório do
// TID com o saldo cadastrado no sistema. SOMENTE LEITURA (não altera saldos).
//
// Após a migração para código TID, as duas marcas comparam DIRETO (sem de-para):
//   ZC → tabela estoque_mp,     coluna cod_tid
//   PG → tabela estoque_mp_pg,  coluna cod_pg
// Em ambas: casa o cod_tid do relatório do TID com o código do estoque,
// com tolerância a zeros à esquerda ("000141" == "141").

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatKg } from "@/lib/utils";
import {
  parseEstoqueTidFile,
  normalizarCodTid,
  type EstoqueTidItem,
} from "@/lib/parseEstoqueTid";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

type Marca = "ZC" | "PG";

// Configuração por marca: qual tabela e qual coluna de código consultar.
const CONFIG_MARCA: Record<Marca, { tabela: string; coluna: string; nome: string }> = {
  ZC: { tabela: "estoque_mp", coluna: "cod_tid", nome: "Zan Collor" },
  PG: { tabela: "estoque_mp_pg", coluna: "cod_pg", nome: "Pigma" },
};

type StatusComparacao =
  | "ok"
  | "divergente"
  | "sem_sistema" // está no TID mas não no estoque da marca
  | "so_sistema"; // está no estoque da marca mas não veio no relatório do TID

interface LinhaComparacao {
  codTid: string | null;
  materiaPrima: string;
  saldoTid: number | null;
  saldoSistema: number | null;
  diff: number | null; // saldoTid - saldoSistema
  status: StatusComparacao;
}

// Tolerância (kg) para considerar "sem divergência". Saldos têm 3 casas.
const TOLERANCIA_KG = 0.001;

export default function ConferenciaEstoque() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [marca, setMarca] = useState<Marca>("ZC");
  const [itensTid, setItensTid] = useState<EstoqueTidItem[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [ignoradas, setIgnoradas] = useState(0);

  const [estoqueRows, setEstoqueRows] = useState<{ cod: string; materia_prima: string; saldo_kg: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string>("");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusComparacao | "todos">("divergente");

  // ---- Carrega o estoque do sistema para a marca escolhida ----
  async function carregarEstoque(marcaAtual: Marca) {
    const cfg = CONFIG_MARCA[marcaAtual];
    const { data, error } = await (supabase as any)
      .from(cfg.tabela)
      .select(`${cfg.coluna}, materia_prima, saldo_kg`);

    if (error) throw error;

    const rows = ((data ?? []) as any[]).map((r) => ({
      cod: String(r[cfg.coluna] ?? "").trim(),
      materia_prima: r.materia_prima ?? "",
      saldo_kg: Number(r.saldo_kg ?? 0),
    }));
    setEstoqueRows(rows);
  }

  // ---- Upload do relatório do TID ----
  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErro("");
    try {
      const resultado = await parseEstoqueTidFile(file);
      setItensTid(resultado.itens);
      setIgnoradas(resultado.ignoradas);
      setNomeArquivo(file.name);
      await carregarEstoque(marca);
    } catch (err: any) {
      setErro(err?.message ?? "Falha ao ler o arquivo.");
      setItensTid(null);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // ---- Trocar de marca recarrega o estoque (se já houver relatório) ----
  async function trocarMarca(nova: Marca) {
    setMarca(nova);
    if (itensTid) {
      setLoading(true);
      try {
        await carregarEstoque(nova);
      } catch (err: any) {
        setErro(err?.message ?? "Falha ao carregar o estoque.");
      } finally {
        setLoading(false);
      }
    }
  }

  // ---- Cálculo do comparativo ----
  const comparacao = useMemo<LinhaComparacao[]>(() => {
    if (!itensTid) return [];

    // Mapa do estoque: cod normalizado -> linha
    const estoquePorCod = new Map<string, { cod: string; materia_prima: string; saldo_kg: number }>();
    for (const r of estoqueRows) {
      if (r.cod) estoquePorCod.set(normalizarCodTid(r.cod), r);
    }

    const linhas: LinhaComparacao[] = [];
    const codsCasados = new Set<string>();

    // 1) Percorre o relatório do TID
    for (const item of itensTid) {
      const chave = normalizarCodTid(item.codTid);
      const est = estoquePorCod.get(chave);

      if (!est) {
        linhas.push({
          codTid: item.codTid,
          materiaPrima: item.materiaPrima,
          saldoTid: item.saldoKg,
          saldoSistema: null,
          diff: null,
          status: "sem_sistema",
        });
        continue;
      }

      codsCasados.add(chave);
      const diff = item.saldoKg - est.saldo_kg;
      linhas.push({
        codTid: item.codTid,
        materiaPrima: item.materiaPrima || est.materia_prima,
        saldoTid: item.saldoKg,
        saldoSistema: est.saldo_kg,
        diff,
        status: Math.abs(diff) <= TOLERANCIA_KG ? "ok" : "divergente",
      });
    }

    // 2) MPs no sistema que não vieram no relatório do TID
    for (const r of estoqueRows) {
      const chave = normalizarCodTid(r.cod);
      if (r.cod && !codsCasados.has(chave)) {
        linhas.push({
          codTid: r.cod,
          materiaPrima: r.materia_prima,
          saldoTid: null,
          saldoSistema: r.saldo_kg,
          diff: null,
          status: "so_sistema",
        });
      }
    }

    return linhas;
  }, [itensTid, estoqueRows]);

  // ---- Resumo ----
  const resumo = useMemo(() => {
    const acc = { total: comparacao.length, ok: 0, divergente: 0, sem_sistema: 0, so_sistema: 0 };
    for (const l of comparacao) acc[l.status]++;
    return acc;
  }, [comparacao]);

  // ---- Filtro da tabela ----
  const linhasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comparacao.filter((l) => {
      if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
      if (!termo) return true;
      return (
        l.materiaPrima.toLowerCase().includes(termo) ||
        (l.codTid ?? "").toLowerCase().includes(termo)
      );
    });
  }, [comparacao, busca, filtroStatus]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conferência de Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Confronta o saldo de matéria-prima do relatório do TID com o saldo
          cadastrado no sistema. Somente leitura — nenhum saldo é alterado.
        </p>
      </div>

      {/* Controles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Selecione a marca e envie o relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Marca:</span>
              <Button
                variant={marca === "ZC" ? "default" : "outline"}
                size="sm"
                onClick={() => trocarMarca("ZC")}
                disabled={loading}
              >
                Zan Collor
              </Button>
              <Button
                variant={marca === "PG" ? "default" : "outline"}
                size="sm"
                onClick={() => trocarMarca("PG")}
                disabled={loading}
              >
                Pigma
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".txt,.csv"
                className="hidden"
                onChange={handleArquivo}
              />
              <Button onClick={() => inputRef.current?.click()} disabled={loading}>
                <Upload className="mr-2 h-4 w-4" />
                {loading ? "Carregando..." : "Enviar relatório do TID"}
              </Button>
              {nomeArquivo && (
                <span className="text-sm text-muted-foreground">
                  {nomeArquivo}
                  {ignoradas > 0 && ` · ${ignoradas} linha(s) ignorada(s)`}
                </span>
              )}
            </div>
          </div>

          {erro && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" /> {erro}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo */}
      {itensTid && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ResumoCard rotulo="Divergentes" valor={resumo.divergente} tom="red" />
          <ResumoCard rotulo="Conferem (OK)" valor={resumo.ok} tom="green" />
          <ResumoCard rotulo="Só no TID" valor={resumo.sem_sistema} tom="amber" />
          <ResumoCard rotulo="Só no sistema" valor={resumo.so_sistema} tom="gray" />
        </div>
      )}

      {/* Tabela */}
      {itensTid && (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">
                Comparativo — {CONFIG_MARCA[marca].nome}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["divergente", "Divergentes"],
                    ["todos", "Todos"],
                    ["ok", "OK"],
                    ["sem_sistema", "Só no TID"],
                    ["so_sistema", "Só no sistema"],
                  ] as [StatusComparacao | "todos", string][]
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filtroStatus === key ? "default" : "outline"}
                    onClick={() => setFiltroStatus(key)}
                  >
                    {label}
                  </Button>
                ))}
                <Input
                  placeholder="Buscar MP ou código..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-9 w-56"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">Cód. TID</th>
                    <th className="p-2 font-medium">Matéria-prima</th>
                    <th className="p-2 text-right font-medium">Saldo TID (kg)</th>
                    <th className="p-2 text-right font-medium">Saldo Sistema (kg)</th>
                    <th className="p-2 text-right font-medium">Diferença (kg)</th>
                    <th className="p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasVisiveis.map((l, i) => (
                    <tr
                      key={`${l.codTid}-${i}`}
                      className="border-b last:border-0 hover:bg-muted/40"
                    >
                      <td className="p-2 font-mono text-xs">{l.codTid ?? "—"}</td>
                      <td className="p-2">{l.materiaPrima}</td>
                      <td className="p-2 text-right tabular-nums">
                        {l.saldoTid == null ? "—" : formatKg(l.saldoTid)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {l.saldoSistema == null ? "—" : formatKg(l.saldoSistema)}
                      </td>
                      <td
                        className={`p-2 text-right tabular-nums font-medium ${
                          l.diff != null && Math.abs(l.diff) > TOLERANCIA_KG
                            ? l.diff > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-orange-600 dark:text-orange-400"
                            : ""
                        }`}
                      >
                        {l.diff == null ? "—" : `${l.diff > 0 ? "+" : ""}${formatKg(l.diff)}`}
                      </td>
                      <td className="p-2">
                        <StatusBadge status={l.status} />
                      </td>
                    </tr>
                  ))}
                  {linhasVisiveis.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        Nenhum item para este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResumoCard({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: "red" | "green" | "amber" | "gray";
}) {
  const cores: Record<string, string> = {
    red: "text-red-600 dark:text-red-400",
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    gray: "text-muted-foreground",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`text-2xl font-bold ${cores[tom]}`}>{valor}</div>
        <div className="text-xs text-muted-foreground">{rotulo}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: StatusComparacao }) {
  switch (status) {
    case "ok":
      return (
        <Badge className="bg-green-600 hover:bg-green-600">
          <CheckCircle2 className="mr-1 h-3 w-3" /> OK
        </Badge>
      );
    case "divergente":
      return <Badge variant="destructive">Divergente</Badge>;
    case "sem_sistema":
      return <Badge variant="outline">Só no TID</Badge>;
    case "so_sistema":
      return <Badge variant="outline">Só no sistema</Badge>;
  }
}
