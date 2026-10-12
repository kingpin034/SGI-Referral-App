-- Supabase/PostgreSQL 15+. All money values are whole IDR. Provider connections are configured separately.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null default '', phone text not null default '',
  referral_code text not null unique default ('SGP-' || upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,12))),
  referrer_id uuid references public.profiles(id),
  attribution_locked boolean not null default false,
  tier text not null default 'Registered' check(tier in ('Registered','Classic','Premium')),
  verification_status text not null default 'unverified' check(verification_status in ('unverified','pending','verified','rejected')),
  ktp_path text, selfie_path text, rejection_reason text, consent_at timestamptz,
  kyc_submission_id uuid, created_at timestamptz not null default now(), verified_at timestamptz,
  check(referrer_id is distinct from id)
);
create table public.products (
  id text primary key, name text not null, grams numeric(6,2) not null unique check(grams in (0.5,1,5,10)),
  image_path text not null, is_active boolean not null default true
);
create index profiles_referrer on public.profiles(referrer_id);
create table public.gold_prices (
  id integer primary key default 1 check(id=1), sell bigint not null check(sell>0), buyback bigint not null check(buyback>0),
  source text not null default 'sample' check(source in ('sample','live')), updated_at timestamptz not null default now()
);
create table public.stockpoints (
  id uuid primary key default extensions.gen_random_uuid(), name text not null, city text not null, address text not null,
  is_active boolean not null default true
);
create table public.program_settings (
  id integer primary key default 1 check(id=1), commission_levels integer not null default 1 check(commission_levels in (1,3)),
  currency text not null default 'IDR' check(currency='IDR'), payout_minimum bigint not null default 300000,
  payout_day integer not null default 20 check(payout_day=20), allow_sample_checkout boolean not null default false
);
create table public.orders (
  id uuid primary key default extensions.gen_random_uuid(), number text unique not null default ('SGP-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,12))),
  buyer_id uuid not null references public.profiles(id), product_id text not null references public.products(id),
  product_name text not null, grams numeric(6,2) not null, quantity integer not null check(quantity between 1 and 100),
  unit_price bigint not null check(unit_price>0), total bigint not null check(total>0), currency text not null default 'IDR' check(currency='IDR'),
  stockpoint_id uuid not null references public.stockpoints(id), payment_method text not null check(payment_method in ('qris','va')),
  purchase_intent text not null check(purchase_intent in ('customer','classic','premium')),
  idempotency_key text not null check(length(idempotency_key) between 8 and 150),
  request_fingerprint text not null, referral_code text, upline_ids uuid[] not null default '{}',
  payment_state text not null default 'creating' check(payment_state in ('creating','pending','paid','failed','exception')),
  status text not null default 'pending' check(status in ('pending','ready','done')),
  provider_reference text unique, payment_qr text, virtual_account text,
  expires_at timestamptz not null default now()+interval '15 minutes', paid_at timestamptz,
  price_locked_at timestamptz, pickup_code text unique, pickup_token text unique,
  exception_reason text, created_at timestamptz not null default now(), unique(buyer_id,idempotency_key),
  check(total=unit_price*quantity)
);
create index orders_buyer_created on public.orders(buyer_id,created_at desc);
create index orders_uplines on public.orders using gin(upline_ids);
create table public.serial_inventory (
  serial text primary key, product_id text not null references public.products(id), stockpoint_id uuid not null references public.stockpoints(id),
  state text not null default 'available' check(state in ('available','reserved','released')),
  order_id uuid references public.orders(id), reserved_at timestamptz, released_at timestamptz,
  check((state='available' and order_id is null) or (state<>'available' and order_id is not null))
);
create index inventory_available on public.serial_inventory(stockpoint_id,product_id) where state='available';
create table public.commission_ledger (
  id uuid primary key default extensions.gen_random_uuid(), order_id uuid not null references public.orders(id),
  recipient_id uuid not null references public.profiles(id), level integer not null check(level between 0 and 3),
  tier text not null check(tier in ('Classic','Premium')), rate numeric(8,5) not null, amount bigint not null check(amount>=0),
  status text not null default 'accrued' check(status in ('accrued','scheduled','paid','reversed')),
  created_at timestamptz not null default now(), unique(order_id,recipient_id,level)
);
create table public.payouts (
  id uuid primary key default extensions.gen_random_uuid(), recipient_id uuid not null references public.profiles(id), cutoff_date date not null,
  amount bigint not null check(amount>=0), carry_grams numeric(18,8) not null default 0,
  status text not null check(status in ('carried','scheduled','paid','failed')), bank_reference text,
  created_at timestamptz not null default now(), unique(recipient_id,cutoff_date)
);
create table public.provider_events (
  provider text not null, event_id text not null, payload_digest text not null,
  event_type text not null, entity_id uuid not null, received_at timestamptz not null default now(), primary key(provider,event_id)
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid, event text not null,
  entity_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now()
);

insert into public.program_settings(id) values(1);
insert into public.products(id,name,grams,image_path) values
 ('waris-05g','WARIS Sampoerna 0,5 gram',0.5,'/assets/waris-05g.jpg'),
 ('waris-1g','WARIS Sampoerna 1 gram',1,'/assets/waris-1g.jpg'),
 ('waris-5g','WARIS Sampoerna 5 gram',5,'/assets/waris-5g.jpg'),
 ('waris-10g','WARIS Sampoerna 10 gram',10,'/assets/waris-10g.jpg');
-- Sample prices intentionally cannot be used for production checkout. Load live prices and real inventory before activation.
insert into public.gold_prices(id,sell,buyback,source) values(1,2100000,2020000,'sample');

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.gold_prices enable row level security;
alter table public.stockpoints enable row level security;
alter table public.program_settings enable row level security;
alter table public.orders enable row level security;
alter table public.serial_inventory enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.payouts enable row level security;
alter table public.provider_events enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles,public.products,public.gold_prices,public.stockpoints,public.program_settings,
 public.orders,public.serial_inventory,public.commission_ledger,public.payouts,public.provider_events,public.audit_log from anon,authenticated;
grant select on public.products,public.gold_prices,public.stockpoints to anon,authenticated;
create policy products_read on public.products for select to anon,authenticated using(is_active);
create policy prices_read on public.gold_prices for select to anon,authenticated using(true);
create policy stockpoints_read on public.stockpoints for select to anon,authenticated using(is_active);
grant all on public.profiles,public.products,public.gold_prices,public.stockpoints,public.program_settings,
 public.orders,public.serial_inventory,public.commission_ledger,public.payouts,public.provider_events,public.audit_log to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;

create function public.handle_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,phone) values(new.id,coalesce(new.phone,'')) on conflict(id) do nothing;
  if new.phone_confirmed_at is not null then update public.profiles set phone=coalesce(new.phone,'') where id=new.id; end if;
  return new;
end $$;
create trigger auth_profile_sync after insert or update of phone,phone_confirmed_at on auth.users
 for each row execute function public.handle_auth_profile();
insert into public.profiles(id,phone) select id,coalesce(phone,'') from auth.users on conflict(id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('identity-documents','identity-documents',false,8388608,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy identity_insert on storage.objects for insert to authenticated
 with check(bucket_id='identity-documents' and (storage.foldername(name))[1]=auth.uid()::text);
-- Only owners may read their documents. Overwrite/delete are deliberately disallowed, keeping submitted identity evidence immutable.
create policy identity_read on storage.objects for select to authenticated
 using(bucket_id='identity-documents' and (storage.foldername(name))[1]=auth.uid()::text);

create function public.profile_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'fullName',p.full_name,'phone',p.phone,'tier',p.tier,'referralCode',p.referral_code,
  'referrerCode',r.referral_code,'verificationStatus',p.verification_status,'ktpPath',p.ktp_path,'selfiePath',p.selfie_path,'rejectionReason',p.rejection_reason)
 from public.profiles p left join public.profiles r on r.id=p.referrer_id where p.id=p_id;
$$;
create function public.mask_name(p_name text) returns text language sql immutable set search_path='' as $$
 select coalesce(nullif(split_part(trim(p_name),' ',1),''),'Mitra') || case when position(' ' in trim(p_name))>0 then ' '||left(split_part(trim(p_name),' ',2),1)||'.' else '' end;
$$;

create function public.submit_verification(p_full_name text,p_referral_code text,p_ktp_path text,p_selfie_path text,p_consent boolean)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_referrer uuid; v_phone text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select phone into v_phone from auth.users where id=v_uid and phone_confirmed_at is not null;
 if v_phone is null or v_phone='' then raise exception 'Confirm the phone OTP before submitting verification'; end if;
 select * into v_profile from public.profiles where id=v_uid for update;
 if v_profile.verification_status='verified' then return public.profile_json(v_uid); end if;
 if p_consent is not true or length(trim(p_full_name)) not between 2 and 120 then raise exception 'Full name and privacy consent are required'; end if;
 if p_ktp_path=p_selfie_path then raise exception 'Provide separate KTP and selfie documents'; end if;
 if not exists(select 1 from storage.objects where bucket_id='identity-documents' and name=p_ktp_path and (storage.foldername(name))[1]=v_uid::text)
  or not exists(select 1 from storage.objects where bucket_id='identity-documents' and name=p_selfie_path and (storage.foldername(name))[1]=v_uid::text)
  then raise exception 'Upload your own KTP and selfie before submitting'; end if;
 if not v_profile.attribution_locked then
  if nullif(trim(p_referral_code),'') is not null then
   select id into v_referrer from public.profiles where referral_code=upper(trim(p_referral_code)) and id<>v_uid and attribution_locked;
   if v_referrer is null then raise exception 'Referral code is invalid'; end if;
  end if;
 else
  v_referrer:=v_profile.referrer_id;
  if coalesce((select referral_code from public.profiles where id=v_referrer),'')<>coalesce(upper(trim(p_referral_code)),'') then raise exception 'Referral attribution is locked'; end if;
 end if;
 update public.profiles set full_name=trim(p_full_name),phone=v_phone,referrer_id=v_referrer,attribution_locked=true,
  verification_status='pending',ktp_path=p_ktp_path,selfie_path=p_selfie_path,consent_at=now(),rejection_reason=null,
  kyc_submission_id=extensions.gen_random_uuid() where id=v_uid;
 insert into public.audit_log(actor_id,event,entity_id) values(v_uid,'identity.submitted',v_uid);
 return public.profile_json(v_uid);
end $$;

create function public.order_json(p_order public.orders,p_viewer uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_own boolean:=p_order.buyer_id=p_viewer; v_chain jsonb; v_commission bigint;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'fullName',public.mask_name(p.full_name),'referralCode',p.referral_code,
  'tier',p.tier,'level',u.level,'qualified',p.tier<>'Registered' and p.verification_status='verified',
  'rate',coalesce(c.rate,0),'commission',case when p.id=p_viewer then coalesce(c.amount,0) else 0 end,
  'commissionVisible',p.id=p_viewer) order by u.level),'[]'::jsonb)
 into v_chain from unnest(p_order.upline_ids) with ordinality u(id,level) join public.profiles p on p.id=u.id
 left join public.commission_ledger c on c.order_id=p_order.id and c.recipient_id=p.id and c.level=u.level;
 select coalesce(sum(amount),0) into v_commission from public.commission_ledger where order_id=p_order.id and recipient_id=p_viewer and status<>'reversed';
 return jsonb_build_object('id',p_order.id,'number',p_order.number,'customerId',p_order.buyer_id,
 'customerName',(select case when v_own then full_name else public.mask_name(full_name) end from public.profiles where id=p_order.buyer_id),
 'createdAt',p_order.created_at,'productId',p_order.product_id,'productName',p_order.product_name,'grams',p_order.grams,'quantity',p_order.quantity,
 'total',p_order.total,'status',p_order.status,'paymentMethod',p_order.payment_method,'stockpointId',p_order.stockpoint_id,
 'stockpointName',(select name from public.stockpoints where id=p_order.stockpoint_id),'referralCode',p_order.referral_code,
 'referralCommission',v_commission,'pickupCode',case when v_own then p_order.pickup_code end,'pickupToken',case when v_own then p_order.pickup_token end,
 'serials',case when v_own then coalesce((select jsonb_agg(serial) from public.serial_inventory where order_id=p_order.id),'[]') else '[]'::jsonb end,
 'chain',v_chain,'paymentReference',case when v_own then p_order.provider_reference end,'paymentQr',case when v_own then p_order.payment_qr end,
 'virtualAccount',case when v_own then p_order.virtual_account end,'expiresAt',p_order.expires_at,'intent',p_order.purchase_intent);
end $$;
create function public.get_order(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_order public.orders;
begin
 select * into v_order from public.orders where id=p_order_id and (buyer_id=auth.uid() or auth.uid()=any(upline_ids));
 if v_order.id is null then raise exception 'Order not found'; end if;
 return public.order_json(v_order,auth.uid());
end $$;

create function public.get_app_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_network jsonb; v_qualified bigint; v_dashboard jsonb; v_orders jsonb; v_referrals jsonb; v_points jsonb; v_payout date;
begin
 with recursive tree as (
  select id,full_name,tier,verification_status,referral_code,created_at,1 as level from public.profiles where referrer_id=v_uid
  union all select p.id,p.full_name,p.tier,p.verification_status,p.referral_code,p.created_at,t.level+1
  from public.profiles p join tree t on p.referrer_id=t.id where t.level<3
 ), enriched as (
  select t.*,case when own.tier='Premium' then (array[1.0,0.5,0.25]::numeric[])[t.level]
   when own.tier='Classic' then (array[0.75,0.375,0.1875]::numeric[])[t.level] else 0 end as rate,
   coalesce((select sum(o.total) from public.orders o where o.buyer_id=t.id and o.payment_state='paid'),0) as sales
  from tree t left join public.profiles own on own.id=v_uid
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'fullName',public.mask_name(full_name),'tier',tier,'level',level,
  'qualified',tier<>'Registered' and verification_status='verified','referralCode',referral_code,
  'potentialRate',case when level<=(select commission_levels from public.program_settings where id=1) then rate else 0 end,
  'sales',sales,'potentialCommission',case when level<=(select commission_levels from public.program_settings where id=1) then floor(sales*rate/100) else 0 end,
  'joinedAt',created_at) order by created_at desc),'[]'::jsonb),count(*) filter(where tier<>'Registered' and verification_status='verified')
 into v_network,v_qualified from enriched;
 select coalesce(jsonb_agg(public.order_json(o,v_uid) order by o.created_at desc),'[]') into v_orders from public.orders o where buyer_id=v_uid;
 select coalesce(jsonb_agg(public.order_json(o,v_uid) order by o.created_at desc),'[]') into v_referrals from public.orders o where v_uid=any(upline_ids);
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day::date,'value',coalesce(s.total,0)) order by d.day),'[]') into v_points
 from generate_series((now() at time zone 'Asia/Jakarta')::date-89,(now() at time zone 'Asia/Jakarta')::date,'1 day'::interval)d(day)
 left join (select (paid_at at time zone 'Asia/Jakarta')::date as day,sum(total) as total from public.orders
  where v_uid=any(upline_ids) and payment_state='paid' group by 1)s on s.day=d.day::date;
 v_payout:=(date_trunc('month',now() at time zone 'Asia/Jakarta')+interval '19 days')::date;
 if (now() at time zone 'Asia/Jakarta')::date>v_payout then v_payout:=(v_payout+interval '1 month')::date; end if;
 v_dashboard:=jsonb_build_object('commission',coalesce((select sum(amount) from public.commission_ledger where recipient_id=v_uid and status in ('accrued','scheduled')),0),
 'sales',coalesce((select sum(total) from public.orders where v_uid=any(upline_ids) and payment_state='paid'),0),
 'networkCount',jsonb_array_length(v_network),'qualifiedCount',v_qualified,'payoutDate',v_payout,'points',v_points);
 return jsonb_build_object('profile',public.profile_json(v_uid),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'grams',p.grams,'image',p.image_path,
  'price',round(p.grams*g.sell),'available',exists(select 1 from public.serial_inventory s join public.stockpoints sp on sp.id=s.stockpoint_id where s.product_id=p.id and s.state='available' and sp.is_active)) order by p.grams)
  from public.products p cross join public.gold_prices g where p.is_active and g.id=1),'[]'),
 'price',(select jsonb_build_object('sell',sell,'buyback',buyback,'updatedAt',updated_at,'source',source) from public.gold_prices where id=1),
 'stockpoints',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'city',city,'address',address) order by name) from public.stockpoints where is_active),'[]'),
 'dashboard',v_dashboard,'myOrders',v_orders,'referralOrders',v_referrals,'network',v_network);
end $$;

-- Service-only checkout creation. Prices, tier thresholds, phone verification, and inventory are never accepted from the browser.
create function public.create_checkout_draft(p_buyer_id uuid,p_product_id text,p_quantity integer,p_intent text,p_stockpoint_id uuid,p_payment_method text,p_idempotency_key text)
 returns public.orders language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles; v_product public.products; v_price public.gold_prices; v_order public.orders; v_fingerprint text; v_ids uuid[]; v_count integer;
begin
 if p_quantity is null or p_quantity not between 1 and 100 or p_intent not in ('customer','classic','premium') or p_payment_method not in ('qris','va')
  or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 150 then raise exception 'Invalid checkout parameters'; end if;
 v_fingerprint:=encode(extensions.digest(concat_ws('|',p_product_id,p_quantity,p_intent,p_stockpoint_id,p_payment_method),'sha256'),'hex');
 -- Serialize same-buyer requests, including reused idempotency keys.
 select * into v_profile from public.profiles where id=p_buyer_id for update;
 if v_profile.verification_status is distinct from 'verified' then raise exception 'Identity verification is required'; end if;
 select * into v_order from public.orders where buyer_id=p_buyer_id and idempotency_key=p_idempotency_key;
 if v_order.id is not null then
  if v_order.request_fingerprint<>v_fingerprint then raise exception 'Idempotency key reused with different checkout'; end if;
  return v_order;
 end if;
 select * into v_product from public.products where id=p_product_id and is_active;
 if v_product.id is null then raise exception 'Product unavailable'; end if;
 select * into v_price from public.gold_prices where id=1;
 if v_price.source<>'live' and not (select allow_sample_checkout from public.program_settings where id=1) then raise exception 'Live prices have not been configured'; end if;
 if v_price.updated_at<now()-interval '24 hours' then raise exception 'Price feed is stale'; end if;
 if not exists(select 1 from public.stockpoints where id=p_stockpoint_id and is_active) then raise exception 'Stockpoint unavailable'; end if;
 if (p_intent='classic' and v_product.grams*p_quantity<10) or (p_intent='premium' and v_product.grams*p_quantity<20) then raise exception 'Qualification purchase must be at least 10 g Classic or 20 g Premium'; end if;
 select count(*) into v_count from public.serial_inventory where product_id=p_product_id and stockpoint_id=p_stockpoint_id and state='available';
 if v_count<p_quantity then raise exception 'Insufficient stock at the selected stockpoint'; end if;
 with recursive chain as (
  select id,referrer_id,1 as level from public.profiles where id=v_profile.referrer_id
  union all select p.id,p.referrer_id,c.level+1 from public.profiles p join chain c on p.id=c.referrer_id where c.level<3
 ) select coalesce(array_agg(id order by level),'{}'::uuid[]) into v_ids from chain;
 insert into public.orders(buyer_id,product_id,product_name,grams,quantity,unit_price,total,stockpoint_id,payment_method,purchase_intent,idempotency_key,request_fingerprint,referral_code,upline_ids)
 values(p_buyer_id,p_product_id,v_product.name,v_product.grams,p_quantity,round(v_price.sell*v_product.grams),round(v_price.sell*v_product.grams)*p_quantity,
 p_stockpoint_id,p_payment_method,p_intent,p_idempotency_key,v_fingerprint,(select referral_code from public.profiles where id=v_profile.referrer_id),v_ids)
 returning * into v_order;
 insert into public.audit_log(actor_id,event,entity_id) values(p_buyer_id,'checkout.created',v_order.id);
 return v_order;
end $$;

create function public.attach_payment_intent(p_order_id uuid,p_reference text,p_qr text,p_virtual_account text)
 returns void language plpgsql security definer set search_path='' as $$
declare v_order public.orders;
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null or nullif(p_reference,'') is null then raise exception 'Invalid payment intent'; end if;
 if v_order.provider_reference is not null and v_order.provider_reference<>p_reference then raise exception 'Payment reference mismatch'; end if;
 update public.orders set provider_reference=p_reference,payment_qr=p_qr,virtual_account=p_virtual_account,
 payment_state=case when payment_state='creating' then 'pending' else payment_state end where id=p_order_id;
end $$;

-- Authoritative signed payment event, replay protected and atomic with serialized inventory + commission posting.
create function public.settle_payment(p_event_id text,p_digest text,p_order_id uuid,p_reference text,p_amount bigint,p_currency text,p_paid_at timestamptz)
 returns void language plpgsql security definer set search_path='' as $$
declare v_order public.orders; v_existing public.provider_events; v_serials text[]; v_recipient public.profiles; v_level integer; v_rate numeric; v_levels integer; v_ids uuid[];
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then raise exception 'Order not found'; end if;
 select * into v_existing from public.provider_events where provider='payment' and event_id=p_event_id;
 if v_existing.event_id is not null then
  if v_existing.payload_digest<>p_digest or v_existing.entity_id<>p_order_id then raise exception 'Replayed event payload mismatch'; end if;
  return;
 end if;
 if p_event_id is null or p_digest is null or p_reference is null or p_reference is distinct from v_order.provider_reference
  or p_amount is distinct from v_order.total or p_currency is distinct from v_order.currency or p_paid_at is null
  or p_paid_at>now()+interval '5 minutes' then raise exception 'Payment event does not match the order'; end if;
 insert into public.provider_events(provider,event_id,payload_digest,event_type,entity_id) values('payment',p_event_id,p_digest,'payment.paid',p_order_id);
 if v_order.payment_state='paid' then return; end if;
 if v_order.payment_state='exception' then return; end if;
 if p_paid_at>v_order.expires_at or p_paid_at<v_order.created_at-interval '5 minutes' then
  update public.orders set payment_state='exception',exception_reason='Paid outside the valid payment window; finance review required',paid_at=p_paid_at where id=p_order_id;
  insert into public.audit_log(event,entity_id,detail) values('payment.exception',p_order_id,'{"reason":"expired_payment"}'); return;
 end if;
 select coalesce(array_agg(serial),'{}'::text[]) into v_serials from (
  select serial from public.serial_inventory where product_id=v_order.product_id and stockpoint_id=v_order.stockpoint_id and state='available'
  order by serial limit v_order.quantity for update skip locked
 ) s;
 if cardinality(v_serials)<v_order.quantity then
  update public.orders set payment_state='exception',exception_reason='Payment received; inventory allocation requires finance review',paid_at=p_paid_at where id=p_order_id;
  insert into public.audit_log(event,entity_id,detail) values('payment.exception',p_order_id,'{"reason":"inventory_shortfall"}'); return;
 end if;
 update public.serial_inventory set state='reserved',order_id=p_order_id,reserved_at=now() where serial=any(v_serials);
 update public.orders set payment_state='paid',status='ready',paid_at=p_paid_at,price_locked_at=p_paid_at,
  pickup_code=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,12)),pickup_token=encode(extensions.gen_random_bytes(32),'hex') where id=p_order_id;
 -- Qualification is granted only after authoritative payment and stock allocation, never at signup or browser confirmation.
 update public.profiles set tier=case when v_order.purchase_intent='premium' and v_order.grams*v_order.quantity>=20 then 'Premium'
  when v_order.purchase_intent='classic' and v_order.grams*v_order.quantity>=10 and tier='Registered' then 'Classic' else tier end
  where id=v_order.buyer_id;
 select commission_levels into v_levels from public.program_settings where id=1;
 if v_order.referral_code is not null then
  v_ids:=array_prepend(v_order.buyer_id,v_order.upline_ids);
  for v_level in 0..least(v_levels,cardinality(v_order.upline_ids)) loop
   select * into v_recipient from public.profiles where id=v_ids[v_level+1];
   if v_recipient.tier in ('Classic','Premium') and v_recipient.verification_status='verified' then
    v_rate:=case when v_recipient.tier='Premium' then (array[1.5,1.0,0.5,0.25]::numeric[])[v_level+1]
     else (array[1.0,0.75,0.375,0.1875]::numeric[])[v_level+1] end;
    insert into public.commission_ledger(order_id,recipient_id,level,tier,rate,amount)
    values(p_order_id,v_recipient.id,v_level,v_recipient.tier,v_rate,floor(v_order.total*v_rate/100)) on conflict do nothing;
   end if;
  end loop;
 end if;
 insert into public.audit_log(event,entity_id) values('payment.paid_and_serials_reserved',p_order_id);
end $$;

create function public.apply_kyc_event(p_event_id text,p_digest text,p_profile_id uuid,p_submission_id uuid,p_status text,p_reason text)
 returns void language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles; v_existing public.provider_events;
begin
 if p_status not in ('verified','rejected') or p_event_id is null or p_digest is null then raise exception 'Invalid KYC status event'; end if;
 select * into v_profile from public.profiles where id=p_profile_id for update;
 if v_profile.id is null then raise exception 'Profile not found'; end if;
 select * into v_existing from public.provider_events where provider='kyc' and event_id=p_event_id;
 if v_existing.event_id is not null then
  if v_existing.payload_digest<>p_digest or v_existing.entity_id<>p_profile_id then raise exception 'Replayed event payload mismatch'; end if;
  return;
 end if;
 insert into public.provider_events(provider,event_id,payload_digest,event_type,entity_id) values('kyc',p_event_id,p_digest,'kyc.'||p_status,p_profile_id);
 -- Old provider deliveries must not overwrite a newer identity submission or an already verified identity.
 if v_profile.kyc_submission_id is distinct from p_submission_id or v_profile.verification_status<>'pending' then return; end if;
 update public.profiles set verification_status=p_status,verified_at=case when p_status='verified' then now() end,
  rejection_reason=case when p_status='rejected' then left(coalesce(p_reason,'Verification could not be completed'),300) end where id=p_profile_id;
 insert into public.audit_log(event,entity_id) values('identity.'||p_status,p_profile_id);
end $$;

-- Explicit allow-list for callable functions. PostgreSQL otherwise grants EXECUTE to PUBLIC by default.
revoke all on function public.handle_auth_profile(),public.profile_json(uuid),public.mask_name(text),public.order_json(public.orders,uuid),
 public.submit_verification(text,text,text,text,boolean),public.get_order(uuid),public.get_app_data(),
 public.create_checkout_draft(uuid,text,integer,text,uuid,text,text),public.attach_payment_intent(uuid,text,text,text),
 public.settle_payment(text,text,uuid,text,bigint,text,timestamptz),public.apply_kyc_event(text,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_app_data() to anon,authenticated;
grant execute on function public.submit_verification(text,text,text,text,boolean),public.get_order(uuid) to authenticated;
grant execute on function public.create_checkout_draft(uuid,text,integer,text,uuid,text,text),public.attach_payment_intent(uuid,text,text,text),
 public.settle_payment(text,text,uuid,text,bigint,text,timestamptz),public.apply_kyc_event(text,text,uuid,uuid,text,text) to service_role;
