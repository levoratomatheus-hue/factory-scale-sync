/**
 * Utilitários de espaço de cor CIELAB
 *
 * deltaE2000  — diferença de cor CIEDE2000 (Sharma et al., 2005)
 *               padrão atual da indústria, mais preciso que CIE76
 * labToRgbString — Lab* → sRGB aproximado para prévia visual (D65)
 */

export interface Lab {
  L: number;
  a: number;
  b: number;
}

// ── CIEDE2000 ────────────────────────────────────────────────────────────────

/** Diferença de cor CIEDE2000 entre dois pontos Lab*.
 *  Referência: Sharma G., Wu W., Dalal E.N. (2005),
 *  "The CIEDE2000 Color-Difference Formula", Color Research & Application.
 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  // ── Passo 1: C*ab ──────────────────────────────────────────────────────────
  const C1ab = Math.sqrt(a1 * a1 + b1 * b1);
  const C2ab = Math.sqrt(a2 * a2 + b2 * b2);
  const avgCab = (C1ab + C2ab) / 2;
  const avgCab7 = Math.pow(avgCab, 7);
  const c25_7 = Math.pow(25, 7);

  // ── Passo 2: a' ───────────────────────────────────────────────────────────
  const G = 0.5 * (1 - Math.sqrt(avgCab7 / (avgCab7 + c25_7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  // ── Passo 3: C' e h' ──────────────────────────────────────────────────────
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1raw = Math.atan2(b1, a1p) * (180 / Math.PI);
  const h1p = h1raw < 0 ? h1raw + 360 : h1raw;
  const h2raw = Math.atan2(b2, a2p) * (180 / Math.PI);
  const h2p = h2raw < 0 ? h2raw + 360 : h2raw;

  // ── Passo 4: ΔL', ΔC', Δh', ΔH' ──────────────────────────────────────────
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * (Math.PI / 180));

  // ── Passo 5: médias L̄', C̄', H̄' ────────────────────────────────────────────
  const avgLp = (L1 + L2) / 2;
  const avgCp = (C1p + C2p) / 2;

  let avgHp: number;
  if (C1p * C2p === 0) {
    avgHp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    avgHp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    avgHp = (h1p + h2p + 360) / 2;
  } else {
    avgHp = (h1p + h2p - 360) / 2;
  }

  // ── Passo 6: T, SL, SC, SH, RT ────────────────────────────────────────────
  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.20 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);

  const SL =
    1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;

  const avgCp7 = Math.pow(avgCp, 7);
  const RC = 2 * Math.sqrt(avgCp7 / (avgCp7 + c25_7));
  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;

  // ── ΔE₀₀ ─────────────────────────────────────────────────────────────────
  return Math.sqrt(
    Math.pow(dLp / SL, 2) +
    Math.pow(dCp / SC, 2) +
    Math.pow(dHp / SH, 2) +
    RT * (dCp / SC) * (dHp / SH)
  );
}

// ── Lab → sRGB (prévia visual) ───────────────────────────────────────────────

/** Converte Lab* → string CSS rgb(r,g,b) aproximada (D65, sRGB).
 *  Apenas para prévia visual; cores fora do gamut sRGB são truncadas.
 */
export function labToRgbString(L: number, a: number, b: number): string {
  // Lab → XYZ (D65)
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const f = (t: number) =>
    t > 6 / 29 ? t * t * t : 3 * Math.pow(6 / 29, 2) * (t - 4 / 29);

  const X = 0.95047 * f(fx);
  const Y = 1.00000 * f(fy);
  const Z = 1.08883 * f(fz);

  // XYZ → linear sRGB (matriz IEC 61966-2-1)
  const rLin =  3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const gLin = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const bLin =  0.0557 * X - 0.2040 * Y + 1.0570 * Z;

  // Correção gamma sRGB + clamp
  const gamma = (c: number): number => {
    const v = Math.max(0, Math.min(1, c));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };

  const r = Math.round(gamma(rLin) * 255);
  const g = Math.round(gamma(gLin) * 255);
  const bv = Math.round(gamma(bLin) * 255);

  return `rgb(${r},${g},${bv})`;
}

// ── Classificação de ΔE ──────────────────────────────────────────────────────

export type DeltaClass = 'aceitavel' | 'sugestao' | 'distante';

export function classificarDeltaE(de: number): DeltaClass {
  if (de <= 1.5) return 'aceitavel';
  if (de <= 2.5) return 'sugestao';
  return 'distante';
}

export const DELTA_CONFIG: Record<DeltaClass, {
  label: string;
  bg: string; color: string;
  darkBg: string; darkColor: string;
}> = {
  aceitavel: {
    label: 'Aceitável',
    bg: '#d1fae5', color: '#065f46',
    darkBg: '#06340233', darkColor: '#34d399',
  },
  sugestao: {
    label: 'Sugestão de cor',
    bg: '#fef3c7', color: '#92400e',
    darkBg: '#78350f33', darkColor: '#fbbf24',
  },
  distante: {
    label: 'Distante',
    bg: '#f1f5f9', color: '#475569',
    darkBg: '#1e293b55', darkColor: '#94a3b8',
  },
};
