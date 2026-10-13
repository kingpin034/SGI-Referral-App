import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BadgeCheck, Camera, Check, Clock3, FileCheck2, IdCard, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, Upload, X } from 'lucide-react';
import type { Page, Profile, Repository } from '../lib/types';
import { Badge, Button } from './ui';

interface Props {
  profile: Profile | null;
  repository: Repository;
  onRefresh: () => Promise<void>;
  onNavigate: (page: Page) => void;
  referralCode: string;
  onNotify: (message: string) => void;
}

function syntheticDocument(kind: 'ktp' | 'selfie'): File {
  const label = kind === 'ktp' ? 'CONTOH KTP SINTETIS' : 'CONTOH SELFIE SINTETIS';
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 400;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Dokumen contoh belum dapat dibuat di browser ini.');
  context.fillStyle = '#f8f5ed'; context.fillRect(0, 0, 640, 400);
  context.strokeStyle = '#C3A753'; context.lineWidth = 3; context.strokeRect(24, 24, 592, 352);
  context.fillStyle = '#C3A753'; context.beginPath(); context.arc(320, 140, 40, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.ellipse(320, 218, 75, 36, 0, Math.PI, 0); context.fill();
  context.textAlign = 'center'; context.fillStyle = '#1C1C1C'; context.font = '26px sans-serif'; context.fillText(label, 320, 294);
  context.fillStyle = '#B72731'; context.font = '17px sans-serif'; context.fillText('HANYA DEMO · BUKAN IDENTITAS ASLI', 320, 328);
  const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), character => character.charCodeAt(0));
  return new File([bytes], `sample-${kind}-synthetic.png`, { type: 'image/png' });
}

function DocumentUpload({ kind, value, onChange, disabled }: { kind: 'ktp' | 'selfie'; value: File | null; onChange: (file: File | null) => void; disabled: boolean }) {
  const [preview, setPreview] = useState('');
  const title = kind === 'ktp' ? 'Foto e-KTP' : 'Foto selfie';
  const UploadIcon = kind === 'ktp' ? IdCard : Camera;
  useEffect(() => {
    if (!value) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(value);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [value]);
  return <div className={`upload-box ${value ? 'has-file' : ''}`}>
    {value && preview ? <img className={`upload-preview ${kind}`} src={preview} alt={`${title} sintetis untuk demo`} /> : <span className="upload-icon"><UploadIcon size={27} strokeWidth={1.5} /></span>}
    <div className="upload-content"><strong>{title}</strong><span className="muted">{value ? 'Dokumen contoh sintetis terpasang' : 'Gunakan contoh sintetis, tanpa identitas asli.'}</span>
      <div className="upload-actions"><Button type="button" className="button button-secondary button-small" disabled={disabled} onClick={() => onChange(syntheticDocument(kind))}>{value ? <Check size={14} /> : <Upload size={14} />}{value ? 'Ganti foto' : 'Gunakan contoh'}</Button>{value && <Button type="button" className="button button-ghost button-small" disabled={disabled} onClick={() => onChange(null)} aria-label={`Hapus ${title}`}><X size={15} /></Button>}</div>
    </div>
  </div>;
}

export function AccountPage({ profile, repository, onRefresh, referralCode, onNotify }: Props) {
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [otp, setOtp] = useState('');
  const [code, setCode] = useState(profile?.referrerCode || referralCode || '');
  const [ktp, setKtp] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<'otp' | 'verify' | 'signout' | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (profile?.verificationStatus !== 'pending') return;
    const timer = window.setInterval(() => { void refreshRef.current().catch(() => {}); }, 4000);
    return () => window.clearInterval(timer);
  }, [profile?.verificationStatus]);
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (profile?.verificationStatus === 'verified') { setKtp(null); setSelfie(null); setOtp(''); } }, [profile?.verificationStatus]);

  async function requestOtp() {
    setError(''); setBusy('otp');
    try { await repository.sendOtp(phone); setOtpSent(true); setCooldown(60); onNotify('Kode OTP demo: 123456. Tidak ada pesan WhatsApp yang dikirim.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kode OTP belum dapat dikirim. Coba lagi.'); }
    finally { setBusy(null); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy('verify');
    try {
      const result = await repository.verifyAndSubmit({ fullName, phone, otp, referralCode: code.trim(), ktp, selfie, consent });
      setKtp(null); setSelfie(null); setOtp('');
      await onRefresh();
      onNotify(result.verificationStatus === 'verified' ? 'Anda berhasil masuk ke akun.' : 'Simulasi verifikasi dimulai.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verifikasi belum dapat diproses. Coba lagi.');
      await onRefresh().catch(() => {});
    }
    finally { setBusy(null); }
  }
  async function signOut() {
    setError(''); setBusy('signout');
    try {
      await repository.signOut();
      setFullName(''); setPhone(''); setOtp(''); setKtp(null); setSelfie(null); setConsent(false); setOtpSent(false); setCooldown(0); setCode(referralCode || '');
      await onRefresh(); onNotify('Anda telah keluar dari akun.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Belum dapat keluar. Coba lagi.'); }
    finally { setBusy(null); }
  }

  if (profile?.verificationStatus === 'pending') return <section className="account-page page-section">
    <header className="page-heading"><div><p className="eyebrow">AKUN ANDA</p><h1>Verifikasi identitas</h1></div></header>
    <div className="verification-pending panel"><span className="pending-illustration"><ShieldCheck size={44} strokeWidth={1.3} /><span><Clock3 size={20} /></span></span><Badge tone="gold">Sedang ditinjau</Badge><h2>Verifikasi sedang diproses</h2><p className="muted">Terima kasih, {profile.fullName.split(' ')[0]}. Dokumen Anda sudah diterima. Status akun akan diperbarui setelah verifikasi selesai.</p><p className="demo-note">Demo · Dokumen sintetis akan disetujui otomatis untuk mencoba alur.</p>{error && <p className="form-error" role="alert">{error}</p>}<span className="pending-progress"><LoaderCircle size={15} className="spin" /> Menunggu hasil verifikasi</span></div>
  </section>;

  if (profile?.verificationStatus === 'verified') return <section className="account-page page-section">
    <header className="page-heading"><div><p className="eyebrow">PROFIL & IDENTITAS</p><h1>Akun Saya</h1></div><Badge tone="success"><BadgeCheck size={12} /> Terverifikasi</Badge></header>
    <div className="account-profile panel"><span className="avatar avatar-large">{profile.photoUrl ? <img src={profile.photoUrl} alt={`Foto ${profile.fullName}`} /> : profile.fullName.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><div><h2>{profile.fullName}</h2><Badge tone={profile.tier === 'Premium' ? 'gold' : 'neutral'}>{profile.tier === 'Registered' ? 'Member terdaftar' : `Mitra ${profile.tier}`}</Badge></div></div>
    <div className="locked-documents panel"><span className="locked-document-icon"><FileCheck2 size={33} strokeWidth={1.5} /><span><LockKeyhole size={14} /></span></span><h3>Dokumen identitas terverifikasi</h3><p className="muted">Status dokumen contoh telah diverifikasi. Tidak ada identitas asli yang diunggah atau disimpan.</p><span className="document-lock"><LockKeyhole size={13} /> Dokumen terkunci</span></div>
    <div className="form-field"><label htmlFor="verified-phone">Nomor WhatsApp</label><div className="locked-input"><input id="verified-phone" type="tel" value={profile.phone} readOnly /><LockKeyhole size={16} /></div><p className="field-hint muted">Nomor contoh untuk simulasi akun. Tidak ada pesan yang dikirim.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button className="button button-primary button-full" disabled={busy !== null} onClick={() => void signOut()}>{busy === 'signout' ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}Keluar dari akun</Button>
  </section>;

  return <section className="account-page page-section">
    <header className="page-heading"><div><p className="eyebrow">MULAI BERSAMA SAMPOERNA GOLD</p><h1>Lengkapi identitas Anda</h1><p className="muted">Coba alur pembeli dan mitra dengan nama serta nomor contoh.</p></div></header>
    <form className="account-form" onSubmit={event => void verify(event)}>
      {profile?.verificationStatus === 'rejected' && <p className="form-error" role="alert">{profile.rejectionReason || 'Dokumen belum dapat diverifikasi. Periksa dan kirim ulang identitas Anda.'}</p>}
      <DocumentUpload kind="ktp" value={ktp} onChange={setKtp} disabled={busy !== null} />
      <div className="form-field"><label htmlFor="full-name">Nama lengkap sesuai e-KTP</label><input id="full-name" name="name" autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Nama lengkap Anda" required minLength={3} maxLength={120} disabled={busy !== null} /></div>
      <div className="form-field"><label htmlFor="whatsapp-number">Nomor WhatsApp</label><div className="field-row"><input id="whatsapp-number" name="tel" type="tel" autoComplete="tel" value={phone} onChange={event => { setPhone(event.target.value); setOtpSent(false); setOtp(''); }} placeholder="08xxxxxxxxxx" required disabled={busy !== null} /><Button type="button" className="button button-secondary" disabled={busy !== null || !phone.trim() || cooldown > 0} onClick={() => void requestOtp()}>{busy === 'otp' ? <LoaderCircle size={15} className="spin" /> : cooldown > 0 ? `${cooldown} dtk` : otpSent ? 'Kirim ulang' : 'Kirim OTP'}</Button></div></div>
      <div className="form-field"><label htmlFor="otp-code">Kode OTP</label><input id="otp-code" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 digit kode verifikasi" pattern="[0-9]{6}" maxLength={6} required disabled={busy !== null} /><p className="field-hint demo-note">Demo · Kirim OTP, lalu gunakan kode 123456. Tidak ada pesan WhatsApp.</p></div>
      <div className="form-field"><label htmlFor="referral-code">Kode referral <span className="muted">(opsional)</span></label><input id="referral-code" name="referral-code" autoComplete="off" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Masukkan kode mitra" maxLength={40} disabled={busy !== null} /><p className="field-hint muted">Kode referral menghubungkan Anda dengan mitra pengundang.</p></div>
      <DocumentUpload kind="selfie" value={selfie} onChange={setSelfie} disabled={busy !== null} />
      <label className="consent-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy !== null} /><span>Saya memahami bahwa ini simulasi verifikasi dengan dokumen sintetis dan data contoh.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" className="button button-primary button-full" disabled={busy !== null}>{busy === 'verify' ? <LoaderCircle size={18} className="spin" /> : <ShieldCheck size={18} />}{busy === 'verify' ? 'Memproses verifikasi…' : 'Verifikasi & daftar'}</Button>
    </form>
  </section>;
}
