import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { localeTag } from "../../shared/i18n/formatters.mjs";
import { supabase } from "../../shared/lib/supabase";
import { billingCatalogMessages } from "./billingCatalogMessages.mjs";

type Product = {
  product_code: string;
  product_kind: "PLAN" | "ADD_ON";
  monthly_price_minor: number;
  currency: string;
  base_offer_limit: number | null;
  base_customer_limit: number | null;
  capacity_per_unit: number | null;
};

// Informational read only: no checkout, provider call, acknowledgement or write.
export function BillingCatalogInfo({ restaurantId }: { restaurantId: string }) {
  return <TenantBillingCatalogInfo key={restaurantId} restaurantId={restaurantId} />;
}

function TenantBillingCatalogInfo({ restaurantId }: { restaurantId: string }) {
  const { language } = useI18n();
  const [products, setProducts] = useState<Product[] | null>(null);
  const messages = billingCatalogMessages(language);
  useEffect(() => {
    let current = true;
    if (supabase) void supabase.rpc("get_restaurant_billing_catalog", {
      input_restaurant_id: restaurantId, input_environment: "TEST",
    }).then(({ data, error }) => {
      if (current) setProducts(error ? null : data?.products ?? null);
    });
    return () => { current = false; };
  }, [restaurantId]);
  const number = (value: number) => new Intl.NumberFormat(localeTag(language)).format(value);
  const price = (p: Product) => new Intl.NumberFormat(localeTag(language), {
    style: "currency", currency: p.currency,
  }).format(p.monthly_price_minor / 100);
  return <section className="card" data-i18n-skip="true" aria-label={messages.title}>
    <h2>{messages.title}</h2>
    {products ? products.map(p => <p key={p.product_code}>
      <strong>{p.product_kind === "PLAN" ? p.product_code : p.product_code === "OFFER_CAPACITY" ? messages.offerAddon : messages.customerAddon}</strong>
      {": "}{price(p)} {messages.netMonth}{" · "}
      {p.product_kind === "PLAN"
        ? `${number(p.base_offer_limit!)} ${messages.offers} / ${number(p.base_customer_limit!)} ${messages.customers}`
        : `+${number(p.capacity_per_unit!)} ${p.product_code === "OFFER_CAPACITY" ? messages.offers : messages.customers}`}
    </p>) : <p role="status">{messages.unavailable}</p>}
    <p>{messages.window}</p><p>{messages.trial}</p><p>{messages.locked}</p>
  </section>;
}
