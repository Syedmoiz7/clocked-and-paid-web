import type { CSSProperties } from "react";
export function hslLuminance(
  hue: number,
  saturation: number,
  lightness: number,
) {
  const s = saturation / 100,
    l = lightness / 100,
    a = s * Math.min(l, 1 - l);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}
export function accentInk(hue: number, lightness = 53) {
  return 1.05 / (hslLuminance(hue, 62, lightness) + 0.05) >= 4.5
    ? "#fff"
    : "#000";
}
export function themeStyle(hue: number): CSSProperties {
  let lightness = 62;
  const background = hslLuminance(hue, 32, 14);
  while (
    (hslLuminance(hue, 62, lightness) + 0.05) / (background + 0.05) < 4.7 &&
    lightness < 90
  )
    lightness++;
  return {
    "--brand-h": hue,
    "--on-accent": accentInk(hue),
    "--pink": `hsl(${hue} 62% ${lightness}%)`,
  } as CSSProperties;
}
