/**
 * Blackbody (Planckian) RGB approximation, valid ~1000K..40000K.
 * Based on the Tanner Helland fit of CIE blackbody locus,
 * normalized to 0..1 per channel.
 */
export function blackbody(kelvin: number): [number, number, number] {
  const k = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  const g =
    k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;

  const clamp01 = (v: number): number => Math.min(255, Math.max(0, v)) / 255;
  return [clamp01(r), clamp01(g), clamp01(b)];
}
