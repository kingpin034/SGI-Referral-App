import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { repository } from './lib/repository';
import type { AppData, NetworkMember, Order, Page, Product } from './lib/types';
import { formatCurrency, formatDate } from './lib/format';
import ReferralPage from './components/ReferralPage';
import { OrderDetail } from './components/OrderDetail';
import { Badge, Button, Icon, Modal } from './components/ui';

const CatalogPage = lazy(() => import('./components/CatalogPage'));
const Checkout = lazy(() => import('./components/Checkout'));
const AccountPage = lazy(() => import('./components/AccountPage').then(module => ({ default: module.AccountPage })));
const OrdersPage = lazy(() => import('./components/OrdersPage').then(module => ({ default: module.OrdersPage })));
const NetworkPage = lazy(() => import('./components/NetworkPage').then(module => ({ default: module.NetworkPage })));

const paths: Record<Page, string> = { referral: '/', catalog: '/catalog', account: '/account', 'referral-transactions': '/referral/transactions', 'my-orders': '/catalog/orders', network: '/referral/network' };
function currentPage(): Page {
  if (window.location.pathname === '/' && new URLSearchParams(window.location.search).has('ref')) return 'account';
  return (Object.entries(paths).find(([, path]) => path === window.location.pathname)?.[0] as Page) || 'referral';
}

export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<'share' | 'howto' | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [member, setMember] = useState<NetworkMember | null>(null);
  const requestVersion = useRef(0);
  const referralCode = useRef(new URLSearchParams(window.location.search).get('ref') || '').current;
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try { const result = await repository.load(); if (version === requestVersion.current) { setData(result); setLoadError(''); } }
    catch (reason) { if (version === requestVersion.current) setLoadError(reason instanceof Error ? reason.message : 'Data belum dapat dimuat. Silakan coba lagi.'); }
  }, []);
  useEffect(() => { void refresh(); const unsubscribe = repository.subscribe?.(() => { void refresh(); }); return () => { requestVersion.current++; unsubscribe?.(); }; }, [refresh]);
  useEffect(() => { const listener = () => { setPage(currentPage()); setModal(null); setProduct(null); setOrder(null); setMember(null); }; window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }, []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 4500); return () => window.clearTimeout(timeout); }, [toast]);
  const navigate = useCallback((next: Page) => { const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''; window.history.pushState({}, '', paths[next] + query); setPage(next); window.scrollTo({ top: 0, behavior: 'instant' }); }, [referralCode]);
  const notify = useCallback((message: string) => setToast(message), []);
  const activeTab = page === 'catalog' || page === 'my-orders' ? 'catalog' : page === 'account' ? 'account' : 'referral';
  const referralLink = data?.profile?.referralCode ? `${window.location.origin}/?ref=${encodeURIComponent(data.profile.referralCode)}` : '';
  const share = () => { if (referralLink) setModal('share'); else { navigate('account'); notify('Lengkapi akun Anda untuk membagikan referral.'); } };
  async function copyLink() { try { await navigator.clipboard.writeText(referralLink); notify('Link referral berhasil disalin.'); } catch { notify('Pilih link untuk menyalinnya secara manual.'); } }
  async function nativeShare() { if (navigator.share) { try { await navigator.share({ title: 'Sampoerna Gold Partner', text: 'Temukan emas WARIS Sampoerna melalui link saya.', url: referralLink }); } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) await copyLink(); } } else await copyLink(); }
  function buy(selected: Product) { if (data?.profile?.verificationStatus !== 'verified') { navigate('account'); notify('Verifikasi akun Anda sebelum melakukan pembelian.'); } else { setCheckoutOrder(null); setProduct(selected); } }
  function viewOrder(selected: Order) { const selectedProduct = data?.products.find(item => item.id === selected.productId); if (selected.status === 'pending' && selected.customerId === data?.profile?.id && selectedProduct && selected.paymentReference) { setCheckoutOrder(selected); setProduct(selectedProduct); } else setOrder(selected); }
  async function paid(result: Order) { setProduct(null); setOrder(result); await refresh(); notify('Pembayaran terkonfirmasi. Emas Anda siap diambil.'); }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Langsung ke konten</a>
    <header className="app-header"><a className="brand" href="/" onClick={event => { event.preventDefault(); navigate('referral'); }} aria-label="Sampoerna Gold Partner, beranda"><span className="brand-emblem"><Icon name="gold" size={23} /></span><span><strong>SAMPOERNA GOLD</strong><small>PARTNER</small></span></a><div className="header-account">{repository.mode === 'sandbox' && <span className="sandbox-label">SANDBOX</span>}<button className="avatar header-avatar" aria-label="Buka akun saya" onClick={() => navigate('account')}>{data?.profile ? data.profile.fullName.split(' ').map(name => name[0]).slice(0, 2).join('') : <Icon name="user" size={18} />}</button></div></header>
    <main id="main-content" className="main-content"><Suspense fallback={<div className="route-loading" role="status"><Icon name="loading" className="spin" size={20} />Memuat halaman…</div>}>
      {!data ? loadError ? <div className="connection-state panel"><span className="empty-icon"><Icon name="settings" size={28} /></span><h1>{repository.mode === 'unconfigured' ? 'Aplikasi belum terhubung' : 'Koneksi belum tersedia'}</h1><p>{loadError}</p><Button className="button-secondary" onClick={() => void refresh()}><Icon name="refresh" size={16} />Coba lagi</Button></div> : <div className="loading-state" role="status" aria-label="Memuat aplikasi"><div className="skeleton skeleton-toolbar" /><div className="skeleton skeleton-hero" /><div className="skeleton skeleton-chart" /><span><Icon name="loading" className="spin" size={17} />Memuat Sampoerna Gold Partner…</span></div> : <>
        {loadError && <div className="form-error" role="alert">{loadError}<button className="text-button" onClick={() => void refresh()}>Coba lagi</button></div>}
        {page === 'referral' && <ReferralPage data={data} onNavigate={navigate} onShare={share} onNotify={notify} />}
        {page === 'catalog' && <CatalogPage data={data} onNavigate={navigate} onBuy={buy} onHowTo={() => setModal('howto')} />}
        {page === 'account' && <AccountPage profile={data.profile} repository={repository} onRefresh={refresh} onNavigate={navigate} referralCode={referralCode} onNotify={notify} />}
        {page === 'referral-transactions' && <OrdersPage key="referrals" title="Transaksi Referral" orders={data.referralOrders} onBack={() => navigate('referral')} onSelect={setOrder} />}
        {page === 'my-orders' && <OrdersPage key="orders" title="Pesanan Saya" orders={data.myOrders} onBack={() => navigate('catalog')} onSelect={viewOrder} />}
        {page === 'network' && <NetworkPage members={data.network} onBack={() => navigate('referral')} onSelect={setMember} />}
      </>}
      </Suspense><div className="app-attribution">SAMPOERNA GOLD <span>·</span> Powered by Newtn Technology</div>
    </main>
    <nav className="bottom-nav" aria-label="Navigasi utama">{([{ id: 'referral', icon: 'network', label: 'Referral' }, { id: 'catalog', icon: 'gold', label: 'Gold Catalog' }, { id: 'account', icon: 'user', label: 'Account' }] as const).map(tab => <a key={tab.id} href={paths[tab.id]} className={activeTab === tab.id ? 'active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(tab.id); }}><span><Icon name={tab.icon} size={21} /></span>{tab.label}</a>)}</nav>
    {toast && <div className="toast" role="status"><Icon name="info" size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Tutup pemberitahuan"><Icon name="close" size={15} /></button></div>}
    <Suspense fallback={null}>{product && data?.profile && <Checkout product={product} initialOrder={checkoutOrder} profile={data.profile} stockpoints={data.stockpoints} repository={repository} onClose={() => { setProduct(null); void refresh(); }} onPaid={paid} onNotify={notify} />}</Suspense>
    {order && <OrderDetail order={order} onClose={() => setOrder(null)} />}
    {modal === 'share' && <Modal title="Bagikan referral Anda" subtitle="Awali koneksi yang bernilai." onClose={() => setModal(null)} footer={<Button className="button-full" onClick={() => void nativeShare()}><Icon name="share" size={16} />Bagikan link</Button>}><div className="share-content"><span className="eyebrow">KODE REFERRAL ANDA</span><h3>{data?.profile?.referralCode}</h3><div className="share-qr"><QRCodeSVG value={referralLink} size={176} marginSize={2} /></div><p>Undang orang terdekat untuk membeli emas WARIS. Kode Anda terhubung saat mereka mendaftar.</p><div className="copy-field"><input aria-label="Link untuk dibagikan" readOnly value={referralLink} onFocus={event => event.target.select()} /><button aria-label="Salin link" onClick={() => void copyLink()}><Icon name="copy" size={18} /></button></div></div></Modal>}
    {modal === 'howto' && <Modal title="Cara pembelian" subtitle="Emas pilihan Anda, dalam empat langkah." onClose={() => setModal(null)} footer={<Button className="button-full" onClick={() => setModal(null)}>Mulai pilih emas <Icon name="arrow" size={16} /></Button>}><ol className="howto-list">{[['Verifikasi identitas', 'Lengkapi e-KTP, selfie, dan verifikasi nomor WhatsApp pada Account.'], ['Pilih emas & stockpoint', 'Pilih berat dan jumlah emas, jenis keanggotaan, serta lokasi pengambilan.'], ['Selesaikan pembayaran', 'Bayar melalui QRIS atau Virtual Account. Tunggu konfirmasi pembayaran dari sistem.'], ['Ambil emas Anda', 'Tunjukkan QR pengambilan dan identitas di stockpoint yang Anda pilih.']].map(([title, description], index) => <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol></Modal>}
    {member && <Modal title="Detail mitra" subtitle={`Jaringan Anda · Level ${member.level}`} onClose={() => setMember(null)}><div className="member-profile"><span className="avatar avatar-large">{member.fullName.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><h2>{member.fullName}</h2><Badge tone={member.qualified ? 'gold' : 'neutral'}>{member.qualified ? `Mitra ${member.tier} · Qualified` : 'Member terdaftar'}</Badge></div><dl className="detail-facts"><div><dt>Kode referral</dt><dd>{member.referralCode}</dd></div><div><dt>Bergabung</dt><dd>{formatDate(member.joinedAt)}</dd></div><div><dt>Penjualan</dt><dd>{formatCurrency(member.sales)}</dd></div><div><dt>Potensi komisi</dt><dd>{member.potentialRate.toLocaleString('id-ID', { maximumFractionDigits: 4 })}%</dd></div><div><dt>Total potensi</dt><dd>{formatCurrency(member.potentialCommission)}</dd></div></dl></Modal>}
  </div>;
}
