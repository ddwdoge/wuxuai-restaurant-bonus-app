import { useState } from 'react';
import { useBillingReadiness } from './useBillingReadiness';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { billingReadinessMessages } from './billingReadinessMessages.mjs';
import './billing-readiness.css';

export function PlatformBillingReadiness() {
 const {language} = useI18n();
 const t = billingReadinessMessages(language);
 const [offset,setOffset] = useState(0);
 const {data,error,refresh} = useBillingReadiness(undefined,offset);
 const number = (value: number) => new Intl.NumberFormat(language).format(value);
 return <section className="card billing-readiness" data-testid="billing-readiness" data-i18n-skip="true" aria-labelledby="billing-readiness-title">
  <header><h2 id="billing-readiness-title">{t.title}</h2><button type="button" className="button secondary" onClick={refresh}>{t.refresh}</button></header>
  {!data ? <p role={error ? 'alert' : 'status'}>{error ? t.error : t.loading}</p> : <>
   <h3>{t.catalog}</h3><div className="billing-readiness-grid">{data.products.map(({test:p})=><article key={p.product_code}>
    <h4>{p.product_code === 'OFFER_CAPACITY' ? t.offers : p.product_code === 'CUSTOMER_CAPACITY' ? t.customers : p.product_code}</h4>
    <p>{new Intl.NumberFormat(language,{style:'currency',currency:p.currency}).format(p.monthly_price_minor/100)} {t.priceSuffix}</p>
    {p.product_kind==='PLAN' ? <><p>{number(p.base_offer_limit!)} {t.offers}</p><p>{number(p.base_customer_limit!)} {t.customers}</p></> : <><p>+{number(p.capacity_per_unit!)}</p><p>{t.addonNote}</p></>}
   </article>)}</div><p>{t.window}</p>
   <div className="billing-readiness-grid"><article><h3>{t.seller}</h3><p>{data.products[0]?.test.seller_name}</p><strong>{data.products[0]?.test.seller_readiness}</strong><p>{t.sellerNote}</p><p>{t.liveBilling}: <strong>{data.live_billing}</strong></p></article>
   {(['test','live'] as const).map(env=><article key={env}><h3>Stripe {env.toUpperCase()}</h3>{data.products.map(p=><p key={p[env].product_code}>{p[env].product_code}: <strong>{p[env].binding_status}</strong></p>)}<p>{t.blocked}</p></article>)}</div>
   <h3>{t.trial}</h3><p>{t.trialNote}</p>
   <h3>PENDING_ACTIVATION · {number(data.pending_count)} {t.pending}</h3><p>{data.pending_installed ? 'SETUP_ONLY' : 'BLOCKED'} · {t.setup}</p>
   <h3>{t.businesses}</h3><div className="billing-readiness-grid">{data.businesses.map(b=><article key={b.restaurant_id}><h4>{b.name}</h4><dl>
    <dt>{t.activation}</dt><dd>{b.activation.status}</dd><dt>{t.country}</dt><dd>{b.country ?? '—'} / {b.commercial.release_state ?? 'LOCKED'}</dd>
    <dt>{t.kyb}</dt><dd>{b.kyb_status}</dd><dt>{t.subscription}</dt><dd>{b.subscription_status?.toUpperCase() ?? '—'}</dd>
    <dt>{t.trial}</dt><dd>{b.trial_status}</dd><dt>{t.reason}</dt><dd>{b.actions.reason}</dd>
   </dl><p>{b.actions.legacy_eligible ? t.legacy : t.blocked}</p></article>)}</div>
   {!data.businesses.length ? <p>{t.empty}</p> : null}
   <nav aria-label={t.businesses}><button type="button" className="button secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>{t.previous}</button><button type="button" className="button secondary" disabled={offset+50>=data.total} onClick={()=>setOffset(offset+50)}>{t.next}</button></nav>
  </>}
 </section>;
}
