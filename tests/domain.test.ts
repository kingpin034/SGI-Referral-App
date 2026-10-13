import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCommission, commissionRate, isValidPhone, nextPayoutDate, normalizePhone, payoutDisposition, qualifyTier, validateCheckout, validateIdentityFile } from '../src/lib/domain';
import { createRepository } from '../src/lib/repository';
import { createSampleData, createDemoRepository } from '../src/lib/demo';
import type { CheckoutInput, RegistrationInput, Repository } from '../src/lib/types';

const purchase: CheckoutInput = { productId: 'waris-10', quantity: 2, intent: 'premium', stockpointId: 'sample-jakarta', paymentMethod: 'qris', idempotencyKey: 'test-checkout-1' };
const identity = new File(['synthetic test data'], 'example.png', { type: 'image/png' });
const registration: RegistrationInput = { fullName: 'Test Customer', phone: '081234567899', otp: '123456', referralCode: 'SG-ANDI28', ktp: identity, selfie: identity, consent: true };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('qualification and commissions', () => {
  it('qualifies only a single qualifying partner purchase without downgrading', () => {
    expect(qualifyTier(9.5, 'classic')).toBe('Registered');
    expect(qualifyTier(10, 'classic')).toBe('Classic');
    expect(qualifyTier(19.5, 'premium')).toBe('Registered');
    expect(qualifyTier(20, 'premium')).toBe('Premium');
    expect(qualifyTier(20, 'customer')).toBe('Registered');
    expect(qualifyTier(10, 'classic', 'Premium')).toBe('Premium');
  });
  it('pays the specified four classic and premium rates when multilevel is enabled', () => {
    expect([0, 1, 2, 3].map(level => calculateCommission(10_000_000, 'Classic', level, true, true))).toEqual([100_000, 75_000, 37_500, 18_750]);
    expect([0, 1, 2, 3].map(level => calculateCommission(10_000_000, 'Premium', level, true, true))).toEqual([150_000, 100_000, 50_000, 25_000]);
  });
  it('blocks no-code, unqualified and out-of-range commissions', () => {
    expect(calculateCommission(10_000_000, 'Premium', 0, false, true)).toBe(0);
    expect(calculateCommission(10_000_000, 'Registered', 1, true, true)).toBe(0);
    expect(commissionRate('Premium', 4, true)).toBe(0);
    expect(calculateCommission(-100, 'Premium', 1, true, true)).toBe(0);
  });
  it('defaults to single-level payouts unless multilevel is selected', () => {
    expect(commissionRate('Premium', 1)).toBe(0.01);
    expect(commissionRate('Premium', 2)).toBe(0);
    expect(commissionRate('Premium', 3)).toBe(0);
    expect(calculateCommission(24_300_000, 'Classic', 3, true, true)).toBe(45_562);
  });
  it('accrues below Rp300,000 as grams and pays the exact threshold as cash', () => {
    expect(payoutDisposition(243_000, 2_430_000)).toEqual({ cash: 0, grams: 0.1 });
    expect(payoutDisposition(300_000, 2_430_000)).toEqual({ cash: 300_000, grams: 0 });
  });
  it('uses the 20th with Jakarta timezone and handles year rollover', () => {
    expect(nextPayoutDate(new Date('2026-10-20T12:00:00Z'))).toBe('2026-10-20');
    expect(nextPayoutDate(new Date('2026-10-20T18:00:00Z'))).toBe('2026-11-20');
    expect(nextPayoutDate(new Date('2026-12-31T00:00:00Z'))).toBe('2027-01-20');
  });
});

describe('input and deployment boundaries', () => {
  it('normalizes Indonesian phones and rejects invalid numbers', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('+6281234567890');
    expect(normalizePhone('6281234567890')).toBe('+6281234567890');
    expect(isValidPhone('+62 812 3456 7890')).toBe(true);
    expect(isValidPhone('080000')).toBe(false);
    expect(isValidPhone('+14155552671')).toBe(false);
  });
  it('rejects under-qualification, unavailable stock and invalid quantities', () => {
    const product = createSampleData().products.find(item => item.id === purchase.productId);
    expect(() => validateCheckout(purchase, product)).not.toThrow();
    expect(() => validateCheckout({ ...purchase, quantity: 1 }, product)).toThrow('20 gram');
    expect(() => validateCheckout({ ...purchase, quantity: 1.5 }, product)).toThrow('1–100');
    expect(() => validateCheckout(purchase, { ...product!, available: false })).toThrow('belum tersedia');
  });
  it('accepts generated image files and rejects executable or empty payloads', () => {
    expect(() => validateIdentityFile(identity, 'KTP')).not.toThrow();
    expect(() => validateIdentityFile(new File(['script'], 'x.svg', { type: 'image/svg+xml' }), 'KTP')).toThrow('JPG');
    expect(() => validateIdentityFile(new File([], 'x.png', { type: 'image/png' }), 'KTP')).toThrow('kosong');
  });
  it('always creates an interactive local demo without configuration', async () => {
    const repo = createRepository();
    expect(repo.mode).toBe('demo');
    expect((await repo.load()).profile?.verificationStatus).toBe('verified');
    expect((await createRepository('SG-ANDI28').load()).profile).toBeNull();
  });
});

describe('browser demo workflow', () => {
  it('completes registration and a payment example without any outbound request', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(() => { throw new Error('Unexpected outbound request'); });
    vi.stubGlobal('fetch', fetchSpy);
    const repo = createRepository('SG-ANDI28');
    const sending = repo.sendOtp(registration.phone);
    await vi.advanceTimersByTimeAsync(250);
    await sending;
    await repo.verifyAndSubmit(registration);
    await vi.advanceTimersByTimeAsync(4000);
    const pending = await repo.createCheckout({ ...purchase, paymentMethod: 'va' });
    expect(pending.virtualAccount).toContain('SAMPLE-VA');
    const confirming = repo.confirmPayment(pending.id);
    await vi.advanceTimersByTimeAsync(250);
    const paid = await confirming;
    expect(paid.status).toBe('ready');
    expect((await repo.load()).profile?.tier).toBe('Premium');
    expect((await repo.load()).myOrders[0].id).toBe(paid.id);
    expect(fetchSpy).not.toHaveBeenCalled();
    // A reload creates a fresh presentation, with no persisted submitted data.
    expect((await createRepository().load()).profile?.fullName).toBe('Andi Pratama');
    expect((await createRepository('SG-ANDI28').load()).myOrders).toEqual([]);
  });

  it('resolves newly generated referral links in fresh tabs with the current tier and three-level chain', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(() => { throw new Error('Unexpected outbound request'); });
    vi.stubGlobal('fetch', fetchSpy);
    const register = async (repo: Repository, code: string, phone: string) => {
      const sending = repo.sendOtp(phone);
      await vi.advanceTimersByTimeAsync(250); await sending;
      await repo.verifyAndSubmit({ ...registration, referralCode: code, phone });
      await vi.advanceTimersByTimeAsync(4000);
    };
    const pay = async (repo: Repository) => {
      const pending = await repo.createCheckout(purchase);
      const confirming = repo.confirmPayment(pending.id);
      await vi.advanceTimersByTimeAsync(250);
      return confirming;
    };
    const fromLink = (link: URL) => createRepository(link.searchParams.get('ref')!, link.searchParams.get('demo_chain')!);
    const owner = createRepository('SG-ANDI28');
    await register(owner, 'SG-ANDI28', registration.phone);
    const ownerCode = (await owner.load()).profile!.referralCode;
    const registeredLink = new URL(owner.referralLink('https://demo.example.invalid'));
    expect(registeredLink.searchParams.get('ref')).toBe(ownerCode);
    expect(registeredLink.searchParams.get('demo_chain')).toContain(`${ownerCode}:Registered`);
    expect(decodeURIComponent(registeredLink.href)).not.toContain(registration.fullName);
    expect(registeredLink.href).not.toContain(registration.phone);
    const firstGuest = fromLink(registeredLink);
    await register(firstGuest, ownerCode, '081234567898');
    const firstPaid = await pay(firstGuest);
    expect(firstPaid.chain[0]).toMatchObject({ referralCode: ownerCode, tier: 'Registered', qualified: false, commission: 0 });

    await pay(owner);
    const qualifiedLink = new URL(owner.referralLink('https://demo.example.invalid'));
    expect(qualifiedLink.searchParams.get('demo_chain')).toContain(`${ownerCode}:Premium`);
    const nextGuest = fromLink(qualifiedLink);
    await register(nextGuest, ownerCode, '081234567897');
    const paid = await pay(nextGuest);
    expect(paid.chain.map(member => [member.referralCode, member.level, member.tier])).toEqual([
      [ownerCode, 1, 'Premium'], ['SG-ANDI28', 2, 'Premium'], ['SG-NADIA', 3, 'Classic'],
    ]);
    expect(paid.chain[0].commission).toBe(Math.floor(paid.total * 0.01));
    // The next generation's link also works without access to either previous tab.
    const nextCode = (await nextGuest.load()).profile!.referralCode;
    const thirdGuest = fromLink(new URL(nextGuest.referralLink('https://demo.example.invalid')));
    await register(thirdGuest, nextCode, '081234567896');
    expect((await thirdGuest.load()).profile?.referrerCode).toBe(nextCode);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed or mismatched demo chains rather than accepting an unresolved referral', async () => {
    vi.useFakeTimers();
    for (const chain of ['SG-OTHER123:Premium', 'SG-DEADBEEF:Invalid', 'SG-DEADBEEF:Premium,SG-DEADBEEF:Premium']) {
      const repo = createRepository('SG-DEADBEEF', chain);
      const sending = repo.sendOtp(registration.phone);
      await vi.advanceTimersByTimeAsync(250); await sending;
      await expect(repo.verifyAndSubmit({ ...registration, referralCode: 'SG-DEADBEEF' })).rejects.toThrow('Kode referral contoh tidak ditemukan');
    }
  });

  it('keeps own purchases separate from referral purchases and provides all three levels', async () => {
    const data = await createDemoRepository().load();
    expect(data.myOrders.length).toBeGreaterThan(12);
    expect(data.referralOrders.length).toBeGreaterThan(12);
    expect(data.myOrders.every(order => order.customerId === data.profile?.id)).toBe(true);
    expect(data.referralOrders.every(order => order.customerId !== data.profile?.id)).toBe(true);
    expect(new Set(data.network.map(member => member.level))).toEqual(new Set([1, 2, 3]));
  });
  it('reconciles charts, dashboard, network and upline commission amounts to the same paid orders', async () => {
    const data = await createDemoRepository().load();
    const paid = data.referralOrders.filter(order => order.status !== 'pending');
    expect(data.dashboard.points.reduce((sum, point) => sum + point.value, 0)).toBe(data.dashboard.sales);
    expect(data.network.reduce((sum, member) => sum + member.sales, 0)).toBe(data.dashboard.sales);
    expect(data.dashboard.sales).toBe(paid.reduce((sum, order) => sum + order.total, 0));
    expect(data.dashboard.commission).toBe([...data.myOrders, ...data.referralOrders].reduce((sum, order) => sum + order.referralCommission, 0));
    for (const order of paid) {
      expect(order.chain[0].referralCode).toBe(order.referralCode);
      const own = order.chain.find(member => member.id === data.profile?.id);
      expect(own?.commission).toBe(order.referralCommission);
      for (const member of order.chain) expect(member.commission).toBe(Math.floor(order.total * member.rate / 100));
    }
  });
  it('starts a newly registered account with its own empty ledger', () => {
    const profile = { ...createSampleData().profile!, id: 'new-account', tier: 'Registered' as const, verificationStatus: 'pending' as const };
    const data = createSampleData(profile);
    expect(data.myOrders).toEqual([]);
    expect(data.referralOrders).toEqual([]);
    expect(data.network).toEqual([]);
    expect(data.dashboard.commission).toBe(0);
    expect(data.dashboard.sales).toBe(0);
    expect(data.dashboard.networkCount).toBe(0);
    expect(data.dashboard.points).toEqual([]);
  });
  it('creates idempotent pending checkouts and reserves serials only after simulated payment', async () => {
    vi.useFakeTimers();
    const repo = createDemoRepository();
    const first = await repo.createCheckout(purchase);
    const repeated = await repo.createCheckout(purchase);
    expect(first.id).toBe(repeated.id);
    expect(first.status).toBe('pending');
    expect(first.serials).toEqual([]);
    expect(first.pickupToken).toBeNull();
    const payment = repo.confirmPayment(first.id);
    await vi.advanceTimersByTimeAsync(250);
    const paid = await payment;
    expect(paid.status).toBe('ready');
    expect(paid.serials).toHaveLength(2);
    expect(paid.pickupToken).toMatch(/^SAMPLE-PICKUP-/);
    expect(await repo.confirmPayment(first.id)).toEqual(paid);
  });
  it('requires OTP and moves a new referral registration from pending to verified', async () => {
    vi.useFakeTimers();
    const repo = createDemoRepository({ referralCode: 'SG-ANDI28', verificationDelayMs: 1000 });
    expect((await repo.load()).profile).toBeNull();
    await expect(repo.verifyAndSubmit(registration)).rejects.toThrow('setelah mengirim');
    const sending = repo.sendOtp(registration.phone);
    await vi.advanceTimersByTimeAsync(250);
    await sending;
    const pending = await repo.verifyAndSubmit(registration);
    expect(pending.verificationStatus).toBe('pending');
    expect(pending.referrerCode).toBe('SG-ANDI28');
    expect(pending).not.toHaveProperty('ktpPath');
    expect(pending).not.toHaveProperty('selfiePath');
    await expect(repo.createCheckout(purchase)).rejects.toThrow('verifikasi');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await repo.load()).profile?.verificationStatus).toBe('verified');
  });
  it('clears personal state on signout and never gives guests sample member metrics', async () => {
    const repo = createDemoRepository();
    await repo.signOut();
    const data = await repo.load();
    expect(data.profile).toBeNull();
    expect(data.myOrders).toEqual([]);
    expect(data.network).toEqual([]);
    expect(data.dashboard.sales).toBe(0);
    await expect(repo.createCheckout(purchase)).rejects.toThrow('verifikasi');
  });
});
