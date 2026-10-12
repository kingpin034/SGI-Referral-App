import { CheckCircle2, Clock3, MapPin } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Order } from '../lib/types';
import { formatCurrency, formatWeight } from '../lib/format';
import { Badge, Modal } from './ui';

interface Props { order: Order; onClose: () => void; }

export function OrderDetail({ order, onClose }: Props) {
  const qrValue = order.pickupToken || order.pickupCode;
  return <Modal title="Detail pesanan" subtitle={order.number} onClose={onClose}>
    <div className="order-detail">
      <div className="detail-thanks"><span className={`detail-status-icon ${order.status === 'pending' ? 'pending' : ''}`}>{order.status === 'pending' ? <Clock3 size={25} /> : <CheckCircle2 size={25} />}</span><h2>{order.status === 'pending' ? 'Menunggu pembayaran' : `Terima kasih, ${order.customerName.split(' ')[0]}!`}</h2><p className="muted">{order.number} · {formatCurrency(order.total)}</p><span className="muted">{order.quantity} × {order.productName} · {formatWeight(order.grams * order.quantity)}</span></div>
      <div className="pickup-ticket">
        {qrValue && order.status !== 'pending' ? <><div className="pickup-qr"><QRCodeSVG value={qrValue} size={168} marginSize={2} level="M" title={`Kode pengambilan ${order.number}`} /></div><strong className="pickup-code">{order.pickupCode || order.number}</strong><Badge tone={order.status === 'done' ? 'success' : 'gold'}>{order.status === 'done' ? 'Sudah diambil' : 'Siap diambil'}</Badge><p className="muted">{order.status === 'done' ? 'Pengambilan emas telah diselesaikan.' : 'Tunjukkan QR dan identitas Anda di stockpoint.'}</p></> : <p className="muted">{order.status === 'pending' ? 'QR pengambilan tersedia setelah pembayaran terverifikasi dan serial emas dialokasikan.' : 'Kode pengambilan hanya tersedia untuk pemilik pesanan.'}</p>}
      </div>
      <dl className="detail-facts"><div><dt>Pembeli</dt><dd>{order.customerName}</dd></div><div><dt><MapPin size={13} /> Lokasi pengambilan</dt><dd>{order.stockpointName}</dd></div><div><dt>Metode pembayaran</dt><dd>{order.paymentMethod === 'qris' ? 'QRIS' : 'Virtual Account'}</dd></div><div><dt>Kode referral</dt><dd>{order.referralCode || 'Tidak digunakan'}</dd></div><div><dt>Komisi referral</dt><dd>{formatCurrency(order.referralCommission)}</dd></div></dl>
      <div className="section-heading"><h3>Rantai referral</h3><span className="muted">{order.chain.length} level</span></div>
      <div className="chain-list">{order.chain.length === 0 ? <p className="chain-empty muted">Tidak ada komisi referral pada transaksi ini.</p> : order.chain.map(member => <article className="chain-card" key={`${member.id}-${member.level}`}>
        <div className="chain-card-header"><span className="chain-level">{member.level === 0 ? 'Sendiri' : `Level ${member.level}`}</span><Badge tone={member.qualified ? 'success' : 'neutral'}>{member.qualified ? 'Qualified' : 'Terdaftar'}</Badge></div>
        <strong>{member.fullName}</strong><p className="muted">{member.referralCode} · {member.tier === 'Registered' ? 'Terdaftar' : member.tier}</p><div className="chain-commission"><span className="muted">Komisi {member.rate.toLocaleString('id-ID', { maximumFractionDigits: 4 })}%</span><strong>{member.commissionVisible === false ? 'Pribadi' : formatCurrency(member.commission)}</strong></div>
      </article>)}</div>
    </div>
  </Modal>;
}
