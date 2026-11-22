/**
 * Estimativa de volume a partir das medidas. Sempre marcada como "estimada":
 * formas irregulares não recebem estimativa automática (o profissional informa o volume).
 */
export const SHAPES = {
  retangular: { label: "Retangular", factor: 1 },
  oval: { label: "Oval", factor: Math.PI / 4 },
  redonda: { label: "Redonda", factor: Math.PI / 4 },
  irregular: { label: "Irregular / livre", factor: null },
} as const;
export type Shape = keyof typeof SHAPES;

export function estimateVolumeLiters(input: {
  shape?: string | null;
  lengthM?: number | null;
  widthM?: number | null;
  depthMinM?: number | null;
  depthMaxM?: number | null;
}): number | null {
  const shape = SHAPES[(input.shape as Shape) ?? "retangular"] ?? null;
  if (!shape || shape.factor == null) return null;
  const { lengthM: l, widthM: w } = input;
  const dMin = input.depthMinM ?? input.depthMaxM;
  const dMax = input.depthMaxM ?? input.depthMinM;
  if (!l || !w || !dMin || !dMax || l <= 0 || w <= 0 || dMin <= 0 || dMax <= 0) return null;
  const avg = (dMin + dMax) / 2;
  return Math.round(l * w * avg * shape.factor * 1000);
}
