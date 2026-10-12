export type Tier = 'Registered' | 'Classic' | 'Premium';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type OrderStatus = 'pending' | 'ready' | 'done';
export type PaymentMethod = 'qris' | 'va';
export type PurchaseIntent = 'customer' | 'classic' | 'premium';
export type Page = 'referral' | 'catalog' | 'account' | 'referral-transactions' | 'my-orders' | 'network';

export interface Profile {
  id: string; fullName: string; phone: string; tier: Tier; referralCode: string;
  referrerCode: string | null; verificationStatus: VerificationStatus;
  photoUrl?: string; ktpPath?: string; selfiePath?: string; rejectionReason?: string;
}
export interface Product { id: string; name: string; grams: number; image: string; price: number; available: boolean; }
export interface GoldPrice { sell: number; buyback: number; updatedAt: string; source: 'live' | 'sample'; }
export interface Stockpoint { id: string; name: string; city: string; address: string; }
export interface ChainMember { id: string; fullName: string; referralCode: string; tier: Tier; level: number; qualified: boolean; rate: number; commission: number; commissionVisible?: boolean; }
export interface Order {
  id: string; number: string; customerId: string; customerName: string; createdAt: string;
  productId: string; productName: string; grams: number; quantity: number; total: number;
  status: OrderStatus; paymentMethod: PaymentMethod; stockpointId: string; stockpointName: string;
  referralCode: string | null; referralCommission: number; pickupCode: string | null;
  pickupToken?: string | null; serials: string[]; chain: ChainMember[];
  paymentReference?: string; paymentQr?: string; virtualAccount?: string; expiresAt?: string;
  intent: PurchaseIntent;
}
export interface NetworkMember { id: string; fullName: string; tier: Tier; level: number; qualified: boolean; referralCode: string; potentialRate: number; sales: number; potentialCommission: number; joinedAt: string; }
export interface SalePoint { date: string; value: number; }
export interface Dashboard { commission: number; sales: number; networkCount: number; qualifiedCount: number; payoutDate: string; points: SalePoint[]; }
export interface AppData { profile: Profile | null; products: Product[]; price: GoldPrice; stockpoints: Stockpoint[]; dashboard: Dashboard; myOrders: Order[]; referralOrders: Order[]; network: NetworkMember[]; }
export interface CheckoutInput { productId: string; quantity: number; intent: PurchaseIntent; stockpointId: string; paymentMethod: PaymentMethod; idempotencyKey: string; }
export interface RegistrationInput { fullName: string; phone: string; otp: string; referralCode: string; ktp: File | null; selfie: File | null; consent: boolean; }
export interface Repository {
  readonly mode: 'sandbox' | 'supabase' | 'unconfigured';
  load(): Promise<AppData>;
  sendOtp(phone: string): Promise<void>;
  verifyAndSubmit(input: RegistrationInput): Promise<Profile>;
  signOut(): Promise<void>;
  updatePhone(phone: string): Promise<void>;
  createCheckout(input: CheckoutInput): Promise<Order>;
  confirmPayment(orderId: string): Promise<Order>;
  documentUrl(path: string): Promise<string>;
  subscribe?(callback: () => void): () => void;
}
