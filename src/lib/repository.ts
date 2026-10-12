import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData, CheckoutInput, Order, Profile, RegistrationInput, Repository } from './types';
import { isValidPhone, normalizePhone, validateRegistration } from './domain';
import { createSandboxRepository } from './sandbox';

const configurationMessage = 'Layanan belum terhubung. Konfigurasikan Supabase untuk mengaktifkan akun dan transaksi.';

function errorMessage(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error) return new Error(String(error.message));
  return new Error('Layanan belum dapat dihubungi. Silakan coba lagi.');
}

/** Live prices, qualification, commission and payment state always originate on the server. */
export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  private changingPhone: string | null = null;
  constructor(private client: SupabaseClient) {}

  async load(): Promise<AppData> {
    const { data, error } = await this.client.rpc('get_app_data');
    if (error) throw errorMessage(error);
    if (!data || !Array.isArray(data.products) || !data.dashboard) throw new Error('Data aplikasi belum tersedia. Hubungi pengelola.');
    return data as AppData;
  }

  async sendOtp(value: string): Promise<void> {
    if (!isValidPhone(value)) throw new Error('Masukkan nomor WhatsApp Indonesia yang valid.');
    const { error } = await this.client.auth.signInWithOtp({ phone: normalizePhone(value), options: { channel: 'whatsapp', shouldCreateUser: true } });
    if (error) throw errorMessage(error);
  }

  async verifyAndSubmit(input: RegistrationInput): Promise<Profile> {
    validateRegistration(input, false);
    const phone = normalizePhone(input.phone);
    const changingPhone = this.changingPhone === phone;
    const { data: authenticated, error: otpError } = await this.client.auth.verifyOtp({ phone, token: input.otp.trim(), type: changingPhone ? 'phone_change' : 'sms' });
    if (otpError) throw errorMessage(otpError);
    if (!authenticated.user) throw new Error('Sesi verifikasi tidak tersedia. Kirim ulang OTP.');
    if (changingPhone) this.changingPhone = null;
    const existing = (await this.load()).profile;
    if (existing?.verificationStatus === 'verified') return existing;
    if (existing?.verificationStatus === 'pending') {
      await this.requestVerification();
      return existing;
    }

    validateRegistration(input);
    try {
      const ktpPath = await this.uploadIdentity(authenticated.user.id, 'ktp', input.ktp!);
      const selfiePath = await this.uploadIdentity(authenticated.user.id, 'selfie', input.selfie!);
      const { data: profile, error } = await this.client.rpc('submit_verification', {
        p_full_name: input.fullName.trim(), p_referral_code: input.referralCode.trim().toUpperCase() || null,
        p_ktp_path: ktpPath, p_selfie_path: selfiePath, p_consent: input.consent,
      });
      if (error) throw errorMessage(error);
      await this.requestVerification();
      return profile as Profile;
    } catch (error) {
      // Clients cannot delete identity evidence. Failed upload/request orphans are
      // removed by the documented privileged retention job.
      throw errorMessage(error);
    }
  }

  private async requestVerification(): Promise<void> {
    const { error } = await this.client.functions.invoke('submit-kyc', { body: {} });
    if (error) throw new Error('Dokumen tersimpan dan menunggu verifikasi. Layanan verifikasi belum tersedia; silakan periksa status akun kembali.');
  }

  private async uploadIdentity(userId: string, kind: string, file: File): Promise<string> {
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage.from('identity-documents').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '0' });
    if (error) throw errorMessage(error);
    return path;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw errorMessage(error);
    this.changingPhone = null;
  }

  async updatePhone(value: string): Promise<void> {
    if (!isValidPhone(value)) throw new Error('Masukkan nomor WhatsApp Indonesia yang valid.');
    const phone = normalizePhone(value);
    const { error } = await this.client.auth.updateUser({ phone });
    if (error) throw errorMessage(error);
    this.changingPhone = phone;
  }

  async createCheckout(input: CheckoutInput): Promise<Order> {
    return this.invokeOrder('create-checkout', input);
  }

  async confirmPayment(orderId: string): Promise<Order> {
    // This endpoint checks the gateway. A client click cannot mark a live order paid.
    return this.invokeOrder('sync-payment', { orderId });
  }

  private async invokeOrder(functionName: string, body: CheckoutInput | { orderId: string }): Promise<Order> {
    const { data, error } = await this.client.functions.invoke(functionName, { body });
    if (error) {
      if ('context' in error && error.context instanceof Response) {
        const response = await error.context.clone().json().catch(() => null);
        if (response?.error) throw new Error(String(response.error));
      }
      throw errorMessage(error);
    }
    if (!data?.id) throw new Error('Respons pesanan tidak lengkap. Periksa daftar pesanan sebelum mencoba lagi.');
    return data as Order;
  }

  async documentUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage.from('identity-documents').createSignedUrl(path, 60);
    if (error) throw errorMessage(error);
    return data.signedUrl;
  }

  subscribe(callback: () => void): () => void {
    const notify = () => { setTimeout(callback, 0); };
    const auth = this.client.auth.onAuthStateChange(notify);
    // Personal tables are RPC-only. Refresh with the same access-controlled RPC
    // instead of subscribing to rows the client deliberately cannot SELECT.
    const refreshVisible = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') notify(); };
    const interval = setInterval(refreshVisible, 15_000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      auth.data.subscription.unsubscribe();
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refreshVisible);
    };
  }
}

export class UnconfiguredRepository implements Repository {
  readonly mode = 'unconfigured' as const;
  private unavailable(): never { throw new Error(configurationMessage); }
  async load(): Promise<AppData> { return this.unavailable(); }
  async sendOtp(): Promise<void> { this.unavailable(); }
  async verifyAndSubmit(): Promise<Profile> { return this.unavailable(); }
  async signOut(): Promise<void> { this.unavailable(); }
  async updatePhone(): Promise<void> { this.unavailable(); }
  async createCheckout(): Promise<Order> { return this.unavailable(); }
  async confirmPayment(): Promise<Order> { return this.unavailable(); }
  async documentUrl(): Promise<string> { return this.unavailable(); }
}

export function resolveRepositoryMode(config: { url?: string; anonKey?: string; enableSandbox?: string; dev: boolean }): Repository['mode'] {
  if (config.url?.trim() && config.anonKey?.trim()) return 'supabase';
  if (config.enableSandbox === 'true' || (config.dev && config.enableSandbox !== 'false')) return 'sandbox';
  return 'unconfigured';
}

const env = import.meta.env;
export const mode = resolveRepositoryMode({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, enableSandbox: env.VITE_ENABLE_SANDBOX, dev: env.DEV });
export const repository: Repository = mode === 'supabase'
  ? new SupabaseRepository(createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }))
  : mode === 'sandbox'
    ? createSandboxRepository({ referralCode: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || undefined : undefined })
    : new UnconfiguredRepository();
