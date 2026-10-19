const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

/** ₹4,71,750 — Indian digit grouping. */
export function formatINR(value: number): string {
  return inrFormatter.format(Math.round(Number.isFinite(value) ? value : 0));
}

/** ₹4.72 L / ₹1.25 Cr — compact lakh/crore form for headline figures. */
export function formatINRCompact(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return formatINR(safe);
}

/** "Rs 4,71,750" — for jsPDF, whose built-in fonts have no ₹ glyph. */
export function formatINRPlain(value: number): string {
  return `Rs ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('en-IN')}`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}
