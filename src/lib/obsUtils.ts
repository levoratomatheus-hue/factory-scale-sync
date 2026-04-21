// --- Adições para Mistura (campo obs) ---

export interface ObsItem { qty: number; mp: string; }

export function parseObsItems(obs: string | null | undefined): ObsItem[] | null {
  if (!obs) return null;
  try {
    const parsed = JSON.parse(obs);
    if (Array.isArray(parsed) && parsed.length > 0 && "mp" in parsed[0]) {
      return parsed as ObsItem[];
    }
  } catch { /* not JSON */ }
  return null;
}

export function formatObsLine(item: ObsItem) {
  return `${item.qty}x ${item.mp}`;
}

// --- Registro de Produção (campo obs_linha) ---

export interface ObsLinhaItem { qty: number; peso: number; }

export function parseObsLinhaItems(raw: string | null | undefined): ObsLinhaItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && "peso" in parsed[0]) {
      return parsed as ObsLinhaItem[];
    }
  } catch { /* not JSON */ }
  return null;
}

const fmtPeso = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function formatObsLinha(items: ObsLinhaItem[]): string {
  return items.map((i) => `${i.qty}x ${fmtPeso(i.peso)}`).join(" / ");
}
