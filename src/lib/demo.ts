import type { AppData, ChainMember, NetworkMember, Order, Profile, RegistrationInput, Repository, Tier } from './types';
import { calculateCommission, commissionRate, isValidPhone, nextPayoutDate, normalizePhone, qualifyTier, validateCheckout, validateRegistration } from './domain';

export const DEMO_OTP = '123456';
const demoDate = new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const delay = () => new Promise<void>(resolve => setTimeout(resolve, 200));

export const SAMPLE_PROFILE: Profile = {
  id: 'sample-andi', fullName: 'Andi Pratama', phone: '+6281234567890', tier: 'Premium',
  referralCode: 'SG-ANDI28', referrerCode: 'SG-NADIA', verificationStatus: 'verified',
};

export function createSampleData(profile: Profile | null = SAMPLE_PROFILE): AppData {
  const products = [0.5, 1, 5, 10].map(grams => ({
    id: `waris-${grams}`, name: `Waris Sampoerna ${String(grams).replace('.', ',')} gram`, grams,
    image: `/assets/waris-${grams === 0.5 ? '05' : grams}g.jpg`, price: Math.round(2_430_000 * grams), available: true,
  }));
  const stockpoints = [
    { id: 'sample-jakarta', name: 'Waris Jakarta Selatan', city: 'Jakarta', address: 'Lokasi contoh · Jakarta Selatan' },
    { id: 'sample-surabaya', name: 'Waris Surabaya', city: 'Surabaya', address: 'Lokasi contoh · Surabaya Pusat' },
    { id: 'sample-bandung', name: 'Waris Bandung', city: 'Bandung', address: 'Lokasi contoh · Bandung' },
  ];
  const names = ['Rina Maharani', 'Budi Santoso', 'Siti Rahmawati', 'Dewi Anggraini', 'Rizky Aditya', 'Putri Lestari', 'Fajar Hidayat', 'Maya Permata', 'Dimas Saputra', 'Intan Puspita', 'Arif Wibowo', 'Lina Kartika', 'Yoga Prasetyo', 'Nadia Safitri', 'Bayu Kurniawan', 'Diah Pertiwi', 'Reza Mahendra', 'Ayu Larasati'];
  const network: NetworkMember[] = names.map((fullName, index) => {
    const tier: Tier = index % 5 === 3 ? 'Registered' : index % 3 === 0 ? 'Premium' : 'Classic';
    const level = Math.floor(index / 6) + 1;
    return { id: `sample-member-${index}`, fullName, tier, level, qualified: tier !== 'Registered', referralCode: `SG-${fullName.split(' ')[0].toUpperCase()}${index + 10}`, potentialRate: commissionRate('Premium', level, true) * 100, sales: 0, potentialCommission: 0, joinedAt: new Date(new Date(demoDate).getTime() - (45 + index) * 86400_000).toISOString() };
  });
  const makeOrder = (index: number, own: boolean): Order => {
    const product = products[index % 4];
    const quantity = index % 5 === 0 ? 2 : 1;
    const total = product.price * quantity;
    const status = index % 5 === 0 ? 'pending' : index % 3 === 0 ? 'ready' : 'done';
    const member = network[index % network.length];
    const id = `sample-${own ? 'own' : 'ref'}-${index}`;
    const stockpoint = stockpoints[index % stockpoints.length];
    const directCode = own ? 'SG-NADIA' : member.level === 1 ? SAMPLE_PROFILE.referralCode : network[index - 6].referralCode;
    const chain = sampleChain(total, directCode, network);
    return {
      id, number: `SGP-${own ? '26' : '25'}${String(1042 - index).padStart(4, '0')}`, customerId: own ? SAMPLE_PROFILE.id : member.id,
      customerName: own ? SAMPLE_PROFILE.fullName : member.fullName, createdAt: new Date(new Date(demoDate).getTime() - index * 2 * 86400_000).toISOString(),
      productId: product.id, productName: product.name, grams: product.grams, quantity, total, status,
      paymentMethod: index % 2 === 0 ? 'qris' : 'va', stockpointId: stockpoint.id, stockpointName: stockpoint.name,
      referralCode: chain[0].referralCode,
      referralCommission: status === 'pending' ? 0 : calculateCommission(total, 'Premium', own ? 0 : member.level, true, true),
      pickupCode: status === 'pending' ? null : `SGP-${7100 + index}`, pickupToken: status === 'pending' ? null : `SAMPLE-PICKUP-${id}`,
      serials: status === 'pending' ? [] : Array.from({ length: quantity }, (_, i) => `SAMPLE-WRS-${100000 + index * 10 + i}`),
      chain: status === 'pending' ? [] : chain, intent: 'customer',
      paymentReference: `SAMPLE-${id}`, paymentQr: status === 'pending' ? `SAMPLE-PAYMENT-${id}` : undefined,
      virtualAccount: index % 2 === 1 ? `SAMPLE-VA-${88000000 + index}` : undefined,
      expiresAt: status === 'pending' ? new Date(Date.now() + 30 * 60_000).toISOString() : undefined,
    };
  };
  const referralOrders = profile?.id === SAMPLE_PROFILE.id ? Array.from({ length: 18 }, (_, i) => makeOrder(i, false)) : [];
  const myOrders = profile?.id === SAMPLE_PROFILE.id ? Array.from({ length: 13 }, (_, i) => makeOrder(i, true)) : [];
  const data: AppData = {
    profile: clone(profile), products, price: { sell: 2_430_000, buyback: 2_320_000, updatedAt: demoDate, source: 'sample' }, stockpoints,
    dashboard: { commission: 0, sales: 0, networkCount: 0, qualifiedCount: 0, payoutDate: nextPayoutDate(), points: [] },
    myOrders, referralOrders, network: profile?.id === SAMPLE_PROFILE.id ? network : [],
  };
  refreshDashboard(data);
  return data;
}

function jakartaDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

/** Every metric and chart bucket comes from the same current account ledger. */
function refreshDashboard(state: AppData): void {
  const paid = state.referralOrders.filter(order => order.status !== 'pending');
  const daily = new Map<string, number>();
  state.referralOrders.forEach(order => daily.set(jakartaDay(order.createdAt), 0));
  paid.forEach(order => { const date = jakartaDay(order.createdAt); daily.set(date, (daily.get(date) ?? 0) + order.total); });
  state.network.forEach(member => {
    const purchases = paid.filter(order => order.customerId === member.id);
    member.sales = purchases.reduce((sum, order) => sum + order.total, 0);
    member.potentialCommission = purchases.reduce((sum, order) => sum + order.referralCommission, 0);
  });
  state.dashboard = {
    commission: [...paid, ...state.myOrders.filter(order => order.status !== 'pending')].reduce((sum, order) => sum + order.referralCommission, 0),
    sales: paid.reduce((sum, order) => sum + order.total, 0), networkCount: state.network.length,
    qualifiedCount: state.network.filter(member => member.qualified).length, payoutDate: nextPayoutDate(),
    points: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
  };
}

interface DemoReferrer { referralCode: string; tier: Tier; }

/** Codes and tiers only: shared demo links never include identity or contact data. */
function readDemoChain(referralCode = '', value = ''): DemoReferrer[] {
  if (!value || value.length > 160 || !/^SG-[A-F0-9]{8}$/.test(referralCode)) return [];
  const entries = value.split(',').map(entry => entry.split(':'));
  if (entries.length > 3 || entries.some(parts => parts.length !== 2 || !/^[A-Z0-9-]{3,32}$/.test(parts[0]) || !['Registered', 'Classic', 'Premium'].includes(parts[1]))) return [];
  if (entries[0]?.[0] !== referralCode || new Set(entries.map(parts => parts[0])).size !== entries.length) return [];
  return entries.map(([code, tier]) => ({ referralCode: code, tier: tier as Tier }));
}

function sampleChain(total: number, referralCode = 'SG-ANDI28', network: NetworkMember[] = [], demoChain: DemoReferrer[] = []): ChainMember[] {
  const members = [
    { id: 'sample-andi', fullName: 'Andi Pratama', referralCode: 'SG-ANDI28', tier: 'Premium' as Tier },
    { id: 'sample-nadia', fullName: 'Nadia Safitri', referralCode: 'SG-NADIA', tier: 'Classic' as Tier },
    { id: 'sample-bayu', fullName: 'Bayu Kurniawan', referralCode: 'SG-BAYU', tier: 'Premium' as Tier },
    { id: 'sample-diah', fullName: 'Diah Pertiwi', referralCode: 'SG-DIAH', tier: 'Classic' as Tier },
  ];
  if (demoChain[0]?.referralCode === referralCode) {
    return demoChain.map((entry, index) => {
      const known = [...members, ...network].find(member => member.referralCode === entry.referralCode);
      return { id: known?.id || `demo-referrer-${entry.referralCode}`, fullName: known?.fullName || `Mitra demo ${entry.referralCode.slice(-4)}`, ...entry, level: index + 1, qualified: entry.tier !== 'Registered', rate: commissionRate(entry.tier, index + 1, true) * 100, commission: calculateCommission(total, entry.tier, index + 1, true, true) };
    });
  }
  const selected: typeof members = [];
  let code: string | undefined = referralCode;
  while (code && selected.length < 3) {
    const knownIndex = members.findIndex(member => member.referralCode === code);
    const networkIndex = network.findIndex(member => member.referralCode === code);
    if (knownIndex >= 0) {
      selected.push(members[knownIndex]);
      code = members[knownIndex + 1]?.referralCode;
    } else if (networkIndex >= 0) {
      selected.push(network[networkIndex]);
      code = network[networkIndex].level === 1 ? SAMPLE_PROFILE.referralCode : network[networkIndex - 6].referralCode;
    } else break;
  }
  return selected.map((member, index) => ({ ...member, level: index + 1, qualified: member.tier !== 'Registered', rate: commissionRate(member.tier, index + 1, true) * 100, commission: calculateCommission(total, member.tier, index + 1, true, true) }));
}

/** Deliberately memory-only: no identity images, filenames, or submitted personal data persist to local storage. */
export function createDemoRepository(options: { referralCode?: string; demoChain?: string; seedProfile?: boolean; verificationDelayMs?: number } = {}): Repository {
  let state = createSampleData(options.seedProfile === false || options.referralCode ? null : SAMPLE_PROFILE);
  const sharedChain = readDemoChain(options.referralCode, options.demoChain);
  const resolveChain = (total: number, code: string) => sampleChain(total, code, createSampleData().network, sharedChain);
  const callbacks = new Set<() => void>();
  const emit = () => callbacks.forEach(callback => callback());
  const checkouts = new Map<string, string>();
  let sentPhone = '';
  let verificationTimer: ReturnType<typeof setTimeout> | undefined;
  const requireProfile = () => {
    if (!state.profile || state.profile.verificationStatus !== 'verified') throw new Error('Selesaikan verifikasi akun sebelum melakukan pembelian.');
    return state.profile;
  };
  const repo: Repository = {
    mode: 'demo',
    async load() {
      refreshDashboard(state);
      return clone(state);
    },
    referralLink(origin) {
      if (!state.profile) return '';
      const profile = state.profile;
      const link = new URL('/', origin);
      link.searchParams.set('ref', profile.referralCode);
      if (/^SG-[A-F0-9]{8}$/.test(profile.referralCode)) {
        const ancestors = profile.referrerCode ? resolveChain(0, profile.referrerCode) : [];
        const chain = [{ referralCode: profile.referralCode, tier: profile.tier }, ...ancestors].slice(0, 3);
        link.searchParams.set('demo_chain', chain.map(member => `${member.referralCode}:${member.tier}`).join(','));
      }
      return link.toString();
    },
    async sendOtp(phone) {
      if (!isValidPhone(phone)) throw new Error('Masukkan nomor WhatsApp Indonesia yang valid.');
      await delay();
      sentPhone = normalizePhone(phone);
    },
    async verifyAndSubmit(input: RegistrationInput) {
      const phone = normalizePhone(input.phone);
      validateRegistration(input, false);
      if (sentPhone !== phone || input.otp.trim() !== DEMO_OTP) throw new Error('Gunakan OTP contoh 123456 setelah mengirim kode.');
      if (phone === SAMPLE_PROFILE.phone) {
        state = createSampleData();
        emit();
        return clone(state.profile!);
      }
      if (state.profile?.phone === phone && state.profile.verificationStatus !== 'rejected') return clone(state.profile);
      validateRegistration(input);
      const referrerCode = input.referralCode.trim().toUpperCase();
      if (referrerCode && resolveChain(0, referrerCode).length === 0) throw new Error('Kode referral contoh tidak ditemukan. Gunakan SG-ANDI28.');
      state = createSampleData({ id: `sample-user-${crypto.randomUUID()}`, fullName: input.fullName.trim(), phone, tier: 'Registered', referralCode: `SG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, referrerCode: input.referralCode.trim().toUpperCase() || null, verificationStatus: 'pending' });
      if (verificationTimer) clearTimeout(verificationTimer);
      verificationTimer = setTimeout(() => {
        if (state.profile?.verificationStatus === 'pending') {
          state.profile.verificationStatus = 'verified';
          emit();
        }
      }, options.verificationDelayMs ?? 4000);
      emit();
      return clone(state.profile!);
    },
    async signOut() {
      if (verificationTimer) clearTimeout(verificationTimer);
      state = createSampleData(null);
      sentPhone = '';
      emit();
    },
    async createCheckout(input) {
      const profile = requireProfile();
      const product = state.products.find(item => item.id === input.productId);
      validateCheckout(input, product);
      const existingId = checkouts.get(input.idempotencyKey);
      const existing = state.myOrders.find(order => order.id === existingId);
      if (existing) return clone(existing);
      const point = state.stockpoints.find(item => item.id === input.stockpointId);
      if (!point) throw new Error('Lokasi pengambilan tidak ditemukan.');
      const id = `sample-order-${crypto.randomUUID()}`;
      const order: Order = { id, number: `SGP-${String(Date.now()).slice(-8)}`, customerId: profile.id, customerName: profile.fullName,
        createdAt: new Date().toISOString(), productId: product!.id, productName: product!.name, grams: product!.grams, quantity: input.quantity,
        total: product!.price * input.quantity, status: 'pending', paymentMethod: input.paymentMethod, stockpointId: point.id, stockpointName: point.name,
        referralCode: profile.referrerCode, referralCommission: 0, pickupCode: null, pickupToken: null, serials: [], chain: [], intent: input.intent,
        paymentReference: `SAMPLE-${id}`, paymentQr: input.paymentMethod === 'qris' ? `SAMPLE-PAYMENT-${id}` : undefined,
        virtualAccount: input.paymentMethod === 'va' ? 'SAMPLE-VA-880812345678' : undefined, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      };
      state.myOrders.unshift(order);
      checkouts.set(input.idempotencyKey, order.id);
      emit();
      return clone(order);
    },
    async confirmPayment(orderId) {
      const profile = requireProfile();
      const order = state.myOrders.find(item => item.id === orderId && item.customerId === profile.id);
      if (!order) throw new Error('Pesanan tidak ditemukan.');
      if (order.status !== 'pending') return clone(order);
      if (order.expiresAt && new Date(order.expiresAt).getTime() < Date.now()) throw new Error('Pembayaran kedaluwarsa. Buat pesanan baru.');
      await delay();
      profile.tier = qualifyTier(order.grams * order.quantity, order.intent, profile.tier);
      order.status = 'ready';
      order.pickupCode = `SGP-${String(Date.now()).slice(-6)}`;
      order.pickupToken = `SAMPLE-PICKUP-${crypto.randomUUID()}`;
      order.serials = Array.from({ length: order.quantity }, (_, index) => `SAMPLE-WRS-${Date.now()}-${index + 1}`);
      order.chain = order.referralCode ? resolveChain(order.total, order.referralCode) : [];
      order.referralCommission = calculateCommission(order.total, profile.tier, 0, Boolean(order.referralCode), true);
      emit();
      return clone(order);
    },
    subscribe(callback) { callbacks.add(callback); return () => { callbacks.delete(callback); }; },
  };
  return repo;
}
