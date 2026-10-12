const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const grams = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });

export const formatCurrency = (value: number) => idr.format(Number.isFinite(value) ? value : 0).replace(/\u00a0/g, ' ');
export const formatWeight = (value: number) => `${grams.format(value)} g`;
export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta', ...options }).format(date);
}
export function formatPhone(value: string): string {
  const clean = value.replace(/\D/g, '');
  const local = clean.startsWith('62') ? `0${clean.slice(2)}` : clean;
  return local.replace(/(\d{4})(\d{4})(\d+)/, '$1 $2 $3');
}
