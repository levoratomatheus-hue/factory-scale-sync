const feriadosCache = new Map<number, Set<string>>();

function fmtKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

export function feriadosDoAno(ano: number): Set<string> {
  if (feriadosCache.has(ano)) return feriadosCache.get(ano)!;

  const fixos = [
    [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25],
  ].map(([m, d]) => fmtKey(new Date(ano, m - 1, d, 12, 0, 0)));

  const easter = pascoa(ano);
  const addDias = (base: Date, n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return fmtKey(d);
  };
  const moveis = [
    addDias(easter, -48),
    addDias(easter, -47),
    addDias(easter, -2),
    fmtKey(easter),
    addDias(easter, 60),
  ];

  const result = new Set([...fixos, ...moveis]);
  feriadosCache.set(ano, result);
  return result;
}

export function proximoDiaUtil(dataStr: string): string {
  const d = new Date(dataStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  while (true) {
    const ano = d.getFullYear();
    const day = d.getDay();
    const key = fmtKey(d);
    if (day !== 0 && day !== 6 && !feriadosDoAno(ano).has(key)) break;
    d.setDate(d.getDate() + 1);
  }
  return fmtKey(d);
}

export function diasUteis(de: string, ate: string): number {
  const end = new Date(ate + "T12:00:00");
  let count = 0;
  const cur = new Date(de + "T12:00:00");
  cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    const day = cur.getDay();
    const key = fmtKey(cur);
    if (day !== 0 && day !== 6 && !feriadosDoAno(cur.getFullYear()).has(key)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
