import type { CheckoutInput, Product, PurchaseIntent, RegistrationInput, Tier } from './types';

/** Fractions of sale value. Own purchases are level 0, followed by three uplines. */
export const COMMISSION_RATES: Record<Tier, readonly number[]> = {
  Registered: [0, 0, 0, 0],
  Classic: [0.01, 0.0075, 0.00375, 0.001875],
  Premium: [0.015, 0.01, 0.005, 0.0025],
};

export function qualifyTier(grams: number, intent: PurchaseIntent, current: Tier = 'Registered'): Tier {
  if (current === 'Premium') return current;
  if (intent === 'premium' && grams >= 20) return 'Premium';
  if (intent === 'classic' && grams >= 10) return 'Classic';
  return current;
}

export function commissionRate(tier: Tier, level: number, multiLevel = false): number {
  if (!Number.isInteger(level) || level < 0 || level > 3 || (!multiLevel && level > 1)) return 0;
  return COMMISSION_RATES[tier][level] ?? 0;
}

export function calculateCommission(value: number, tier: Tier, level: number, hasReferral: boolean, multiLevel = false): number {
  if (!hasReferral || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value * commissionRate(tier, level, multiLevel));
}

export function normalizePhone(value: string): string {
  const clean = value.replace(/[\s()-]/g, '');
  if (clean.startsWith('+62')) return clean;
  if (clean.startsWith('62')) return `+${clean}`;
  if (clean.startsWith('0')) return `+62${clean.slice(1)}`;
  if (clean.startsWith('8')) return `+62${clean}`;
  return clean;
}

export function isValidPhone(value: string): boolean {
  return /^\+628[1-9][0-9]{6,10}$/.test(normalizePhone(value));
}

export function validateCheckout(input: CheckoutInput, product: Product | undefined): void {
  if (!product || !product.available) throw new Error('Produk ini belum tersedia. Pilih produk lain.');
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) throw new Error('Jumlah harus berupa bilangan 1–100.');
  if (!['customer', 'classic', 'premium'].includes(input.intent)) throw new Error('Pilih tujuan pembelian.');
  if (!['qris', 'va'].includes(input.paymentMethod)) throw new Error('Pilih metode pembayaran.');
  if (!input.stockpointId) throw new Error('Pilih lokasi pengambilan.');
  if (!input.idempotencyKey) throw new Error('Sesi pembayaran tidak valid. Silakan coba kembali.');
  const grams = product.grams * input.quantity;
  if (input.intent === 'classic' && grams < 10) throw new Error('Classic Partner membutuhkan minimal 10 gram dalam satu pembelian.');
  if (input.intent === 'premium' && grams < 20) throw new Error('Premium Partner membutuhkan minimal 20 gram dalam satu pembelian.');
}

export function validateIdentityFile(file: File | null, label: string): void {
  if (!file) throw new Error(`Unggah ${label} terlebih dahulu.`);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${label} harus berupa JPG, PNG, atau WebP.`);
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error(`${label} maksimal 5 MB dan tidak boleh kosong.`);
}

export function validateRegistration(input: RegistrationInput, requireIdentity = true): void {
  if (!isValidPhone(input.phone)) throw new Error('Masukkan nomor WhatsApp Indonesia yang valid.');
  if (!/^\d{6}$/.test(input.otp.trim())) throw new Error('Masukkan kode OTP 6 digit.');
  if (!requireIdentity) return;
  if (input.fullName.trim().length < 3 || input.fullName.trim().length > 120) throw new Error('Masukkan nama lengkap sesuai e-KTP.');
  if (!input.consent) throw new Error('Persetujuan pemrosesan data diperlukan untuk verifikasi.');
  if (input.referralCode && !/^[A-Z0-9-]{3,32}$/i.test(input.referralCode.trim())) throw new Error('Kode referral tidak valid.');
  validateIdentityFile(input.ktp, 'foto e-KTP');
  validateIdentityFile(input.selfie, 'foto selfie');
}

/** Jakarta calendar cut-off: the upcoming 20th, including today. */
export function nextPayoutDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const date = new Date(Date.UTC(part('year'), part('month') - 1 + (part('day') > 20 ? 1 : 0), 20));
  return date.toISOString().slice(0, 10);
}

export function payoutDisposition(amount: number, goldPrice: number): { cash: number; grams: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { cash: 0, grams: 0 };
  if (amount >= 300_000) return { cash: Math.round(amount), grams: 0 };
  return { cash: 0, grams: goldPrice > 0 ? amount / goldPrice : 0 };
}
