import { supabase } from "../../shared/lib/supabase";
import type { RestaurantOffer } from "../offers/restaurantOfferService";

export type OfferInboxCursor = { created_at: string; id: string };
export type OfferInboxItem = OfferInboxCursor & {
  read_at: string | null;
  offer_id: string;
  title: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
};
export type OfferInbox = {
  available: boolean;
  unread_count: number;
  items: OfferInboxItem[];
  next_cursor: OfferInboxCursor | null;
};

export async function readCustomerOfferInbox(cursor: OfferInboxCursor | null = null, limit = 20): Promise<OfferInbox> {
  if (!supabase) throw new Error("INBOX_UNAVAILABLE");
  const { data, error } = await supabase.rpc("get_customer_offer_inbox", {
    input_limit: limit,
    input_before_created_at: cursor?.created_at ?? null,
    input_before_id: cursor?.id ?? null,
  });
  if (error || !data) throw error ?? new Error("INBOX_UNAVAILABLE");
  return data as OfferInbox;
}

export async function openCustomerOfferInboxEntry(id: string): Promise<{ id: string; read_at: string; offer: RestaurantOffer }> {
  if (!supabase) throw new Error("INBOX_UNAVAILABLE");
  const { data, error } = await supabase.rpc("open_customer_offer_inbox_entry", { input_notification_id: id });
  if (error || !data) throw error ?? new Error("INBOX_UNAVAILABLE");
  return data;
}

// Only a refresh signal crosses tabs, never identity, offer contents or credentials.
const tabId = crypto.randomUUID();
export function announceOfferInboxChange() {
  window.dispatchEvent(new Event("wuxuai-offer-inbox-change"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("wuxuai-offer-inbox");
    channel.postMessage({ sender: tabId });
    channel.close();
  }
}

export function watchOfferInboxRefresh(refresh: () => void) {
  const visible = () => { if (document.visibilityState === "visible") refresh(); };
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("wuxuai-offer-inbox-change", refresh);
  document.addEventListener("visibilitychange", visible);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("wuxuai-offer-inbox");
  if (channel) channel.onmessage = event => { if (event.data?.sender !== tabId) refresh(); };
  return () => {
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
    window.removeEventListener("wuxuai-offer-inbox-change", refresh);
    document.removeEventListener("visibilitychange", visible);
    channel?.close();
  };
}

const copy = {
  de: ["Angebote", "Deine Angebotsnachrichten", "Ungelesen", "Angebote werden geladen.", "Angebote konnten gerade nicht geladen werden.", "Erneut versuchen", "Keine aktuellen Angebotsnachrichten", "Weitere laden", "Angebot nicht mehr verfügbar. Bitte lade die Liste neu.", "Schließen", "Gelesen", "Zurück"],
  en: ["Offers", "Your offer notifications", "Unread", "Loading offers.", "Offers could not be loaded.", "Try again", "No current offer notifications", "Load more", "Offer no longer available. Please reload the list.", "Close", "Read", "Back"],
  fr: ["Offres", "Vos notifications d’offres", "Non lues", "Chargement des offres.", "Impossible de charger les offres.", "Réessayer", "Aucune offre actuelle", "Voir plus", "Offre indisponible. Rechargez la liste.", "Fermer", "Lue", "Retour"],
  it: ["Offerte", "Le tue notifiche di offerte", "Non lette", "Caricamento offerte.", "Impossibile caricare le offerte.", "Riprova", "Nessuna offerta attuale", "Carica altre", "Offerta non disponibile. Ricarica l’elenco.", "Chiudi", "Letta", "Indietro"],
  es: ["Ofertas", "Tus notificaciones de ofertas", "Sin leer", "Cargando ofertas.", "No se pudieron cargar las ofertas.", "Reintentar", "No hay ofertas actuales", "Cargar más", "Oferta no disponible. Recarga la lista.", "Cerrar", "Leída", "Volver"],
  zh: ["优惠", "你的优惠通知", "未读", "正在加载优惠。", "暂时无法加载优惠。", "重试", "暂无有效优惠通知", "加载更多", "优惠已失效，请重新加载列表。", "关闭", "已读", "返回"],
  ko: ["혜택", "혜택 알림", "읽지 않음", "혜택을 불러오는 중입니다.", "혜택을 불러올 수 없습니다.", "다시 시도", "현재 혜택 알림이 없습니다", "더 보기", "혜택이 만료되었습니다. 목록을 새로고침하세요.", "닫기", "읽음", "뒤로"],
} as const;
export function offerInboxText(language: string) { return copy[language as keyof typeof copy] ?? copy.de; }
