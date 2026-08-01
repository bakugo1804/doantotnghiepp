export const DEFAULT_EXCHANGE_RATE = 25000;

export const VAT_BY_COUNTRY: Record<string, number> = {
  VN: 10,
  TH: 7,
  SG: 9,
  MY: 8,
  CN: 13,
  KR: 10,
  JP: 10,
  US: 8,
  EU: 20,
};

const ROUTE_MULTIPLIER: Record<string, number> = {
  'VN-CN': 1.1,
  'VN-TH': 1.05,
  'VN-SG': 1.05,
  'VN-KR': 1.2,
  'VN-JP': 1.25,
  'VN-US': 1.5,
  'VN-EU': 1.45,
};

function normalizeCountry(country?: string) {
  return (country || 'VN').toUpperCase();
}

export function getVatRateByCountry(country?: string) {
  return VAT_BY_COUNTRY[normalizeCountry(country)] ?? 10;
}

export function calculateShippingFee(distanceKm: number, exporterCountry?: string, importerCountry?: string) {
  const from = normalizeCountry(exporterCountry);
  const to = normalizeCountry(importerCountry);
  const key = `${from}-${to}`;
  const reverse = `${to}-${from}`;
  const multiplier = ROUTE_MULTIPLIER[key] ?? ROUTE_MULTIPLIER[reverse] ?? 1.15;
  const baseFee = from === to ? 20 : 55;
  const variableFee = Math.max(distanceKm, 0) * 0.12;
  return Number(((baseFee + variableFee) * multiplier).toFixed(2));
}
