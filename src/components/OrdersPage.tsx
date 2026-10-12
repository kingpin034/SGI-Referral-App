import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Package } from 'lucide-react';
import type { Order, OrderStatus } from '../lib/types';
import { formatCurrency, formatDate, formatWeight } from '../lib/format';
import { Badge, Button, EmptyState } from './ui';

interface Props {
  title: string;
  orders: Order[];
  onBack: () => void;
  onSelect: (order: Order) => void;
}

const statuses: Record<OrderStatus, string> = {
  pending: 'Menunggu pembayaran', ready: 'Siap diambil', done: 'Selesai',
};
const PAGE_SIZE = 5;

export function OrdersPage({ title, orders, onBack, onSelect }: Props) {
  const [filter, setFilter] = useState<'all' | 'ready' | 'done'>('all');
  const [page, setPage] = useState(1);
  const filtered = orders.filter(order => filter === 'all' || order.status === filter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter]);

  return <section className="orders-page page-section">
    <header className="page-heading page-heading-back">
      <Button className="button button-ghost icon-button" onClick={onBack} aria-label="Kembali"><ArrowLeft size={20} /></Button>
      <div><p className="eyebrow">TRANSAKSI EMAS</p><h1>{title}</h1></div>
    </header>
    <div className="segmented-tabs" role="tablist" aria-label="Status pesanan">
      {([{ value: 'all', label: 'Semua' }, { value: 'ready', label: 'Siap diambil' }, { value: 'done', label: 'Selesai' }] as const).map(tab =>
        <button key={tab.value} type="button" role="tab" aria-selected={filter === tab.value} className={filter === tab.value ? 'active' : ''} onClick={() => setFilter(tab.value)}>{tab.label}<span>{orders.filter(order => tab.value === 'all' || order.status === tab.value).length}</span></button>
      )}
    </div>
    <div className="order-list" role="tabpanel">
      {visible.length === 0 ? <EmptyState title="Belum ada transaksi" description="Pesanan dengan status ini akan ditampilkan di sini." /> : visible.map(order =>
        <article className="order-card panel" key={order.id}>
          <div className="order-card-header"><span className="order-number">{order.number}</span><Badge tone={order.status === 'done' ? 'success' : order.status === 'ready' ? 'gold' : 'neutral'}>{statuses[order.status]}</Badge></div>
          <div className="order-card-meta"><strong>{order.customerName}</strong><time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time></div>
          <div className="order-product"><span className="order-product-icon"><Package size={20} /></span><div><strong>{order.productName}</strong><span className="muted">{order.quantity} keping × {formatWeight(order.grams)}</span></div></div>
          <div className="order-card-footer"><strong>{formatCurrency(order.total)}</strong><Button className="button button-secondary button-small" onClick={() => onSelect(order)}>Lihat detail <ArrowUpRight size={15} /></Button></div>
        </article>
      )}
    </div>
    {filtered.length > 0 && <nav className="pagination" aria-label="Halaman transaksi">
      <Button className="button button-ghost" disabled={currentPage === 1} aria-label="Halaman sebelumnya" onClick={() => setPage(currentPage - 1)}>‹</Button>
      {Array.from({ length: pageCount }, (_, index) => index + 1).filter(number => number === 1 || number === pageCount || Math.abs(number - currentPage) <= 1).map((number, index, items) => <span key={number} className="pagination-item">
        {index > 0 && number - items[index - 1] > 1 && <span className="pagination-gap">…</span>}
        <Button className={`button ${currentPage === number ? 'button-primary' : 'button-ghost'}`} aria-current={currentPage === number ? 'page' : undefined} aria-label={`Halaman ${number}`} onClick={() => setPage(number)}>{number}</Button>
      </span>)}
      <Button className="button button-ghost" disabled={currentPage === pageCount} aria-label="Halaman berikutnya" onClick={() => setPage(currentPage + 1)}>›</Button>
    </nav>}
    {filtered.length > 0 && <p className="pagination-summary muted">Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} dari {filtered.length} transaksi</p>}
  </section>;
}
