import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, BadgeCheck, Users } from 'lucide-react';
import type { NetworkMember } from '../lib/types';
import { formatCurrency } from '../lib/format';
import { Badge, Button, EmptyState } from './ui';

interface Props { members: NetworkMember[]; onBack: () => void; onSelect: (member: NetworkMember) => void; }

export function NetworkPage({ members, onBack, onSelect }: Props) {
  const [level, setLevel] = useState(1);
  const visible = members.filter(member => member.level === level);
  return <section className="network-page page-section">
    <header className="page-heading page-heading-back"><Button className="button button-ghost icon-button" onClick={onBack} aria-label="Kembali"><ArrowLeft size={20} /></Button><div><p className="eyebrow">TUMBUH BERSAMA</p><h1>Jaringan Mitra</h1></div></header>
    <div className="stat-grid network-stats">
      <article className="stat-card panel"><span className="stat-icon"><Users size={20} /></span><span className="muted">Total jaringan</span><strong>{members.length}</strong><span className="stat-caption">Mitra terdaftar</span></article>
      <article className="stat-card panel"><span className="stat-icon gold"><BadgeCheck size={20} /></span><span className="muted">Mitra qualified</span><strong>{members.filter(member => member.qualified).length}</strong><span className="stat-caption">Memenuhi kualifikasi</span></article>
    </div>
    <div className="section-heading"><h2>Daftar jaringan</h2><span className="muted">3 level referral</span></div>
    <div className="segmented-tabs" role="tablist" aria-label="Level jaringan">{[1, 2, 3].map(value => <button type="button" role="tab" key={value} className={value === level ? 'active' : ''} aria-selected={value === level} onClick={() => setLevel(value)}>Level {value}<span>{members.filter(member => member.level === value).length}</span></button>)}</div>
    <div className="network-list" role="tabpanel">{visible.length === 0 ? <EmptyState title="Belum ada mitra di level ini" description="Mitra yang bergabung melalui jaringan Anda akan tampil di sini." /> : visible.map(member => <article className="network-card panel" key={member.id}>
      <div className="network-card-header"><span className="avatar avatar-small">{member.fullName.split(' ').map(name => name[0]).slice(0, 2).join('')}</span><div><h3>{member.fullName}</h3><span className="muted">{member.tier === 'Registered' ? 'Terdaftar' : member.tier} · Level {member.level}</span></div><Badge tone={member.qualified ? 'success' : 'neutral'}>{member.qualified ? 'Qualified' : 'Terdaftar'}</Badge></div>
      <div className="network-card-footer"><div><span className="muted">Potensi komisi <strong>{member.potentialRate.toLocaleString('id-ID', { maximumFractionDigits: 4 })}%</strong></span><strong>{formatCurrency(member.potentialCommission)}</strong></div><Button className="button button-secondary button-small" onClick={() => onSelect(member)}>Lihat detail <ArrowUpRight size={15} /></Button></div>
    </article>)}</div>
  </section>;
}
