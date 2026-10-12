import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const results=[];
const test=async(name,run)=>{await run();results.push(name);console.log('PASS',name)};
const sql=await readFile(new URL('../supabase/migrations/202610120001_referral_mvp.sql', import.meta.url),'utf8');
await db.exec(`
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create schema extensions;
grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text unique);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
-- PGlite has no pgcrypto build. TEST ONLY compatibility shims use core PG functions.
create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select pg_catalog.gen_random_uuid()$$;
create function extensions.digest(value text,algorithm text) returns bytea language sql immutable as $$select sha256(convert_to(value,'UTF8'))$$;
create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select decode(left(string_agg(md5(gen_random_uuid()::text),''),n*2),'hex') from generate_series(1,ceil(n/16.0)::integer)$$;
`);
await test('migration executes against PostgreSQL WASM with Supabase schema stubs',async()=>{
 await db.exec(sql.replace('create extension if not exists pgcrypto with schema extensions;',''));
});
const uid='00000000-0000-4000-8000-000000000001';
const sponsor='00000000-0000-4000-8000-000000000002';
const parent='00000000-0000-4000-8000-000000000003';
const grandparent='00000000-0000-4000-8000-000000000004';
const noCode='00000000-0000-4000-8000-000000000005';
const stockpoint='00000000-0000-4000-8000-000000000099';
async function role(name,user=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`)}
async function reject(query,params=[],pattern){let caught;try{await db.query(query,params)}catch(error){caught=error};assert.ok(caught,'Expected database rejection');if(pattern)assert.match(caught.message,pattern)}
await test('anonymous catalogue returns four SKUs and no personal data',async()=>{
 await role('anon'); const {rows}=await db.query('select public.get_app_data() as data');
 assert.equal(rows[0].data.products.length,4);assert.equal(rows[0].data.profile,null);assert.deepEqual(rows[0].data.myOrders,[]);
});
await test('anonymous and authenticated users cannot read raw profiles or execute settlement',async()=>{
 for(const r of ['anon','authenticated']){await role(r,uid);await reject('select * from public.profiles',[],/permission denied/);await reject("select public.settle_payment('event','digest',$1,'ref',1,'IDR',now())",[uid],/permission denied/)}
});
await role('postgres');
await db.query('insert into auth.users(id,phone) values($1,$2)',[uid,'+628100000001']);
await db.query("insert into auth.users(id,phone,phone_confirmed_at) values($1,'+628100000002',now()),($2,'+628100000003',now()),($3,'+628100000004',now()),($4,'+628100000005',now())",[sponsor,parent,grandparent,noCode]);
await db.query("update public.profiles set full_name='Mitra Valid',verification_status='verified',tier='Classic',attribution_locked=true where id<>$1",[uid]);
await db.query("update public.profiles set tier='Premium',referrer_id=$2,referral_code='SGP-SPONSOR' where id=$1",[sponsor,parent]);
await db.query('update public.profiles set referrer_id=$2 where id=$1',[parent,grandparent]);
await test('identity objects permit only owner folder and deny overwrite',async()=>{
 await role('authenticated',uid);
 await db.query("insert into storage.objects(bucket_id,name) values('identity-documents',$1),('identity-documents',$2)",[`${uid}/ktp.png`,`${uid}/selfie.png`]);
 await reject("insert into storage.objects(bucket_id,name) values('identity-documents',$1)",[`${sponsor}/stolen.png`],/row-level security/);
 const update=await db.query('update storage.objects set name=$1 where name=$2 returning id',[`${uid}/other.png`,`${uid}/ktp.png`]);assert.equal(update.rows.length,0);
});
await test('unconfirmed phone cannot submit KYC',async()=>{
 await reject("select public.submit_verification('Customer Baru','SGP-SPONSOR',$1,$2,true)",[`${uid}/ktp.png`,`${uid}/selfie.png`],/Confirm the phone OTP/);
});
await role('postgres');await db.query('update auth.users set phone_confirmed_at=now() where id=$1',[uid]);
let submission;
await test('confirmed signup locks attribution and produces pending KYC',async()=>{
 await role('authenticated',uid);const {rows}=await db.query("select public.submit_verification('Customer Baru','SGP-SPONSOR',$1,$2,true) as p",[`${uid}/ktp.png`,`${uid}/selfie.png`]);assert.equal(rows[0].p.verificationStatus,'pending');assert.equal(rows[0].p.referrerCode,'SGP-SPONSOR');
 await reject("select public.submit_verification('Customer Baru',null,$1,$2,true)",[`${uid}/ktp.png`,`${uid}/selfie.png`],/attribution is locked/);
 await reject("update public.profiles set tier='Premium' where id=$1",[uid],/permission denied/);
 await role('postgres');submission=(await db.query('select kyc_submission_id from public.profiles where id=$1',[uid])).rows[0].kyc_submission_id;
});
await test('KYC event applies once and rejects altered replay',async()=>{
 await role('service_role');await db.query("select public.apply_kyc_event('kyc1','d1',$1,$2,'verified',null)",[uid,submission]);
 await db.query("select public.apply_kyc_event('kyc1','d1',$1,$2,'verified',null)",[uid,submission]);
 await reject("select public.apply_kyc_event('kyc1','wrong',$1,$2,'rejected','no')",[uid,submission],/Replayed event/);
});
await role('postgres');
await db.query("insert into public.stockpoints(id,name,city,address) values($1,'Waris Test','Jakarta','Address')",[stockpoint]);
await db.query("insert into public.serial_inventory(serial,product_id,stockpoint_id) select 'SER-'||g,'waris-10g',$1 from generate_series(1,10)g",[stockpoint]);
let order;
await test('sample price blocks live checkout',async()=>{
 await role('service_role');await reject("select * from public.create_checkout_draft($1,'waris-10g',1,'classic',$2,'qris','sample-checkout')",[uid,stockpoint],/Live prices/);
});
await role('postgres');await db.exec("update public.gold_prices set source='live',updated_at=now()");
await test('checkout authoritative total, qualification, same-key idempotency and mismatch protection',async()=>{
 await role('service_role');
 await reject("select * from public.create_checkout_draft($1,'waris-10g',1,'premium',$2,'qris','invalid-premium')",[uid,stockpoint],/at least/);
 order=(await db.query("select * from public.create_checkout_draft($1,'waris-10g',1,'classic',$2,'qris','checkout-test-1')",[uid,stockpoint])).rows[0];
 assert.equal(order.total,21000000);assert.equal(order.payment_state,'creating');
 const retry=(await db.query("select * from public.create_checkout_draft($1,'waris-10g',1,'classic',$2,'qris','checkout-test-1')",[uid,stockpoint])).rows[0];assert.equal(retry.id,order.id);
 await reject("select * from public.create_checkout_draft($1,'waris-10g',2,'classic',$2,'qris','checkout-test-1')",[uid,stockpoint],/Idempotency key/);
 await db.query("select public.attach_payment_intent($1,'payment1','QR',null)",[order.id]);
});
await test('settlement validates money, reserves serials, qualifies tier and pays own plus L1 only',async()=>{
 await reject("select public.settle_payment('paid1','d1',$1,'payment1',1,'IDR',now())",[order.id],/does not match/);
 await db.query("select public.settle_payment('paid1','d1',$1,'payment1',21000000,'IDR',now())",[order.id]);
 let row=(await db.query('select * from public.orders where id=$1',[order.id])).rows[0];assert.equal(row.status,'ready');assert.equal(row.pickup_token.length,64);
 let serials=(await db.query('select * from public.serial_inventory where order_id=$1',[order.id])).rows;assert.equal(serials.length,1);
 let ledger=(await db.query('select * from public.commission_ledger where order_id=$1 order by level',[order.id])).rows;assert.equal(ledger.length,2);assert.deepEqual(ledger.map(x=>x.amount),[210000,210000]);
 let tier=(await db.query('select tier from public.profiles where id=$1',[uid])).rows[0].tier;assert.equal(tier,'Classic');
});
await test('duplicate paid deliveries never duplicate stock or commission',async()=>{
 await db.query("select public.settle_payment('paid1','d1',$1,'payment1',21000000,'IDR',now())",[order.id]);
 await db.query("select public.settle_payment('paid2','d2',$1,'payment1',21000000,'IDR',now())",[order.id]);
 assert.equal((await db.query('select count(*)::int as n from public.commission_ledger where order_id=$1',[order.id])).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int as n from public.serial_inventory where order_id=$1',[order.id])).rows[0].n,1);
 await reject("select public.settle_payment('paid1','tampered',$1,'payment1',21000000,'IDR',now())",[order.id],/Replayed event/);
});
await test('buyer sees pickup data and referral owner does not',async()=>{
 await role('authenticated',uid);let own=(await db.query('select public.get_order($1) as data',[order.id])).rows[0].data;assert.ok(own.pickupToken);assert.equal(own.serials.length,1);assert.equal(own.chain[0].commissionVisible,false);
 await role('authenticated',sponsor);let ref=(await db.query('select public.get_order($1) as data',[order.id])).rows[0].data;assert.equal(ref.pickupToken,null);assert.deepEqual(ref.serials,[]);assert.equal(ref.paymentQr,null);assert.equal(ref.chain[0].commissionVisible,true);
 await role('authenticated',noCode);await reject('select public.get_order($1)',[order.id],/Order not found/);
});
await test('authenticated full app data exposes dashboard and network with correct percent rate',async()=>{
 await role('authenticated',sponsor);let data=(await db.query('select public.get_app_data() as data')).rows[0].data;assert.equal(data.referralOrders.length,1);assert.equal(data.dashboard.commission,210000);assert.equal(data.network[0].potentialRate,1);assert.equal(data.network[0].fullName,'Customer B.');
});
await test('three-level mode uses each recipient tier and never pays unqualified recipient',async()=>{
 await role('postgres');await db.exec('update public.program_settings set commission_levels=3');await db.query("update public.profiles set tier='Registered' where id=$1",[parent]);
 await role('service_role');let next=(await db.query("select * from public.create_checkout_draft($1,'waris-10g',2,'premium',$2,'va','premium-test-1')",[uid,stockpoint])).rows[0];
 await db.query("select public.attach_payment_intent($1,'payment3',null,'0123456789')",[next.id]);await db.query("select public.settle_payment('paid3','d3',$1,'payment3',42000000,'IDR',now())",[next.id]);
 let ledger=(await db.query('select level,amount from public.commission_ledger where order_id=$1 order by level',[next.id])).rows;assert.deepEqual(ledger,[{level:0,amount:630000},{level:1,amount:420000},{level:3,amount:78750}]);
});
await test('no referral attribution means no own or upline commission',async()=>{
 let next=(await db.query("select * from public.create_checkout_draft($1,'waris-10g',1,'classic',$2,'qris','nocode-test-1')",[noCode,stockpoint])).rows[0];await db.query("select public.attach_payment_intent($1,'payment4','QR',null)",[next.id]);await db.query("select public.settle_payment('paid4','d4',$1,'payment4',21000000,'IDR',now())",[next.id]);
 assert.equal((await db.query('select count(*)::int as n from public.commission_ledger where order_id=$1',[next.id])).rows[0].n,0);
});
await test('stock exhaustion after checkout records paid exception without allocating or earning',async()=>{
 let next=(await db.query("select * from public.create_checkout_draft($1,'waris-10g',1,'customer',$2,'qris','shortfall-test-1')",[uid,stockpoint])).rows[0];await db.query("select public.attach_payment_intent($1,'payment5','QR',null)",[next.id]);
 await role('postgres');await db.exec("delete from public.serial_inventory where state='available'");await role('service_role');await db.query("select public.settle_payment('paid5','d5',$1,'payment5',21000000,'IDR',now())",[next.id]);
 let row=(await db.query('select payment_state,pickup_token from public.orders where id=$1',[next.id])).rows[0];assert.equal(row.payment_state,'exception');assert.equal(row.pickup_token,null);assert.equal((await db.query('select count(*)::int as n from public.commission_ledger where order_id=$1',[next.id])).rows[0].n,0);
});
await db.close();
console.log(`${results.length} PostgreSQL migration/integration checks passed. Pgcrypto, Auth and Storage APIs are stubbed; hosted provider integration is not covered.`);
