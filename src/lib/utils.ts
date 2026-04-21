import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKg(value: number | null | undefined): string {
  if (value == null) return "0,000";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

const STATUS_TOPO = new Set(["concluido", "aguardando_liberacao"]);

export function sortOrdens<T extends { status: string; posicao?: number | null }>(ordens: T[]): T[] {
  return [...ordens].sort((a, b) => {
    const aTop = STATUS_TOPO.has(a.status) ? 0 : 1;
    const bTop = STATUS_TOPO.has(b.status) ? 0 : 1;
    if (aTop !== bTop) return aTop - bTop;
    return (a.posicao ?? 9999) - (b.posicao ?? 9999);
  });
}

export function parseHoras(
  horaInicio: string | null | undefined,
  horaFim: string | null | undefined
): number | null {
  if (!horaInicio || !horaFim) return null;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const diff = toMin(horaFim) - toMin(horaInicio);
  return diff > 0 ? diff / 60 : null;
}
