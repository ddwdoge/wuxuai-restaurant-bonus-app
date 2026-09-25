import { useCallback, useEffect, useRef, useState } from "react";
import { RewardImageFrame } from "../../shared/components/RewardImageFrame";
import { useI18n } from "../../shared/i18n/I18nProvider";
import {
  actOnSecureRedemption,
  loadSecureRedemptionQueue,
  rotateSecureRedemptionPin,
  type SecureRedemptionQueue as QueueState,
} from "../rewards/secureRedemptionService";
import { nextRedemptionCard, stabilizeRedemptionQueue } from "./secureRedemptionQueuePresentation";

const copy = {
  de: ["Offene Einlösungen", "Keine offenen Anträge.", "Bestätigen", "Ablehnen", "Redemption-PIN erneuern", "Neue PIN – nur einmal sichtbar:", "Gültig bis", "Anfrage", "Verbleibend", "Einlösung konnte nicht geprüft werden.", "Vorherige", "Nächste", "von", "Alle anzeigen", "Schließen", "Abbrechen", "Abgelaufen", "Offen", "PIN bestätigt"],
  en: ["Open redemptions", "No open requests.", "Approve", "Reject", "Rotate redemption PIN", "New PIN – shown only once:", "Valid until", "Requested", "Remaining", "Redemption could not be checked.", "Previous", "Next", "of", "Show all", "Close", "Cancel", "Expired", "Open", "PIN verified"],
  fr: ["Échanges en attente", "Aucune demande ouverte.", "Confirmer", "Refuser", "Renouveler le code d'échange", "Nouveau code – affiché une seule fois :", "Valable jusqu'au", "Demande", "Temps restant", "Échange non vérifiable.", "Précédente", "Suivante", "sur", "Tout afficher", "Fermer", "Annuler", "Expirée", "Ouverte", "Code vérifié"],
  it: ["Riscatti in attesa", "Nessuna richiesta aperta.", "Conferma", "Rifiuta", "Rinnova PIN riscatto", "Nuovo PIN – visibile una sola volta:", "Valido fino al", "Richiesta", "Tempo rimasto", "Impossibile verificare il riscatto.", "Precedente", "Successiva", "di", "Mostra tutte", "Chiudi", "Annulla", "Scaduta", "Aperta", "PIN verificato"],
  es: ["Canjes pendientes", "No hay solicitudes abiertas.", "Confirmar", "Rechazar", "Renovar PIN de canje", "PIN nuevo – visible una sola vez:", "Válido hasta", "Solicitud", "Tiempo restante", "No se pudo verificar el canje.", "Anterior", "Siguiente", "de", "Mostrar todas", "Cerrar", "Cancelar", "Caducada", "Abierta", "PIN verificado"],
  zh: ["待确认兑换", "没有待处理申请。", "确认", "拒绝", "更新兑换密码", "新密码（仅显示一次）：", "有效期至", "申请时间", "剩余时间", "无法核验兑换。", "上一项", "下一项", "共", "查看全部", "关闭", "取消", "已过期", "待处理", "密码已验证"],
  ko: ["대기 중인 교환", "대기 중인 요청이 없습니다.", "승인", "거절", "교환 PIN 갱신", "새 PIN – 한 번만 표시:", "유효 기간", "요청 시간", "남은 시간", "교환을 확인할 수 없습니다.", "이전", "다음", "중", "모두 보기", "닫기", "취소", "만료됨", "대기 중", "PIN 확인됨"],
} as const;

export function SecureRedemptionQueue({ restaurantSlug, owner }: { restaurantSlug: string; owner: boolean }) {
  return <ScopedSecureRedemptionQueue key={restaurantSlug} restaurantSlug={restaurantSlug} owner={owner} />;
}

function ScopedSecureRedemptionQueue({ restaurantSlug, owner }: { restaurantSlug: string; owner: boolean }) {
  const { language } = useI18n();
  const t = copy[language] ?? copy.de;
  const generation = useRef(0);
  const requestSequence = useRef(0);
  const orderIds = useRef<string[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const actionInFlight = useRef(false);
  const navigationTarget = useRef<string | null>(null);
  const navigationTimer = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const showAllButtonRef = useRef<HTMLButtonElement>(null);
  const [queueState, setQueueState] = useState<{ slug: string; generation: number; queue: QueueState } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<{ slug: string; generation: number; message: string } | null>(null);
  const [pending, setPending] = useState<{ slug: string; generation: number; id: string } | null>(null);
  const [newPin, setNewPin] = useState<{ slug: string; generation: number; pin: string; validUntil: string } | null>(null);
  const [clock, setClock] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);

  const scrollToCard = useCallback((id: string | null) => {
    const viewport = viewportRef.current;
    if (!viewport || !id) return;
    const card = [...viewport.children].find((child) => (child as HTMLElement).dataset.requestId === id);
    if (!card) return;
    navigationTarget.current = id;
    if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => { navigationTarget.current = null; }, 500);
    const left = viewport.scrollLeft + card.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
    viewport.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, []);

  const refresh = useCallback(async (slug: string, requestGeneration: number) => {
    if (!slug || document.hidden) return;
    const sequence = ++requestSequence.current;
    try {
      const next = await loadSecureRedemptionQueue(slug);
      if (generation.current !== requestGeneration || requestSequence.current !== sequence) return;
      if (next.actor_role !== "STAFF" && next.actor_role !== "OWNER") {
        setQueueState(null);
        return;
      }
      const requests = stabilizeRedemptionQueue(orderIds.current, next.requests);
      const nextIds = requests.map((request) => request.redemption_id);
      const formerActive = activeIdRef.current;
      const selected = nextRedemptionCard(formerActive, orderIds.current, nextIds);
      orderIds.current = nextIds;
      activeIdRef.current = selected;
      setActiveId(selected);
      setQueueState({ slug, generation: requestGeneration, queue: { ...next, requests } });
      if (formerActive && !nextIds.includes(formerActive))
        window.requestAnimationFrame(() => scrollToCard(selected));
      setClock(Date.now());
      setClockOffset(new Date(next.server_now).getTime() - Date.now());
      setError(null);
    } catch {
      if (generation.current !== requestGeneration || requestSequence.current !== sequence) return;
      setQueueState(null);
      setError({ slug, generation: requestGeneration, message: t[9] });
    }
  }, [scrollToCard, t]);

  useEffect(() => {
    const generationRef = generation;
    const sequenceRef = requestSequence;
    const requestGeneration = ++generationRef.current;
    sequenceRef.current++;
    setQueueState(null);
    setError(null);
    setPending(null);
    setNewPin(null);
    orderIds.current = [];
    activeIdRef.current = null;
    actionInFlight.current = false;
    navigationTarget.current = null;
    setActiveId(null);
    void refresh(restaurantSlug, requestGeneration);
    const timer = window.setInterval(() => { void refresh(restaurantSlug, requestGeneration); }, 5000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clockTimer);
      if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
      generationRef.current++;
      sequenceRef.current++;
    };
  }, [refresh, restaurantSlug]);

  const scoped = queueState?.slug === restaurantSlug;
  const queue = scoped && (queueState.queue.actor_role === "STAFF" || queueState.queue.actor_role === "OWNER")
    ? queueState.queue : null;
  const pendingId = pending?.slug === restaurantSlug ? pending.id : null;
  const visibleError = error?.slug === restaurantSlug ? error.message : "";
  const visiblePin = newPin?.slug === restaurantSlug ? newPin : null;
  const activeIndex = queue ? Math.max(0, queue.requests.findIndex((request) => request.redemption_id === activeId)) : 0;

  function move(direction: -1 | 1) {
    if (!queue) return;
    const next = queue.requests[activeIndex + direction];
    if (!next) return;
    activeIdRef.current = next.redemption_id;
    setActiveId(next.redemption_id);
    scrollToCard(next.redemption_id);
  }

  function trackManualScroll() {
    if (navigationTarget.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const firstEdge = viewport.getBoundingClientRect().left;
    const nearest = [...viewport.children]
      .map((child) => ({ id: (child as HTMLElement).dataset.requestId,
        distance: Math.abs(child.getBoundingClientRect().left - firstEdge) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest?.id && nearest.id !== activeIdRef.current) {
      activeIdRef.current = nearest.id;
      setActiveId(nearest.id);
    }
  }

  async function act(action: "approve" | "reject", redemptionId: string, correlationId: string) {
    if (!queue || actionInFlight.current) return;
    const request = queue.requests.find((item) => item.redemption_id === redemptionId);
    if (!request || !["REQUESTED", "PIN_VERIFIED"].includes(request.status)
      || new Date(request.expires_at).getTime() <= clock + clockOffset) return;
    actionInFlight.current = true;
    const requestGeneration = generation.current;
    setPending({ slug: restaurantSlug, generation: requestGeneration, id: redemptionId });
    try {
      await actOnSecureRedemption(action, redemptionId, correlationId);
      if (generation.current === requestGeneration) {
        await refresh(restaurantSlug, requestGeneration);
        window.requestAnimationFrame(() => {
          if (generation.current !== requestGeneration) return;
          const nextCard = [...(viewportRef.current?.children ?? [])].find((child) =>
            (child as HTMLElement).dataset.requestId === activeIdRef.current) as HTMLElement | undefined;
          (nextCard ?? headingRef.current)?.focus({ preventScroll: true });
        });
      }
    } catch {
      if (generation.current === requestGeneration)
        setError({ slug: restaurantSlug, generation: requestGeneration, message: t[9] });
    } finally {
      actionInFlight.current = false;
      if (generation.current === requestGeneration) setPending(null);
    }
  }

  async function rotatePin() {
    if (!queue || queue.actor_role !== "OWNER") return;
    const requestGeneration = generation.current;
    setPending({ slug: restaurantSlug, generation: requestGeneration, id: "pin" });
    setNewPin(null);
    try {
      const result = await rotateSecureRedemptionPin(restaurantSlug);
      if (generation.current === requestGeneration)
        setNewPin({ slug: restaurantSlug, generation: requestGeneration,
          pin: result.pin, validUntil: result.valid_until });
    } catch {
      if (generation.current === requestGeneration)
        setError({ slug: restaurantSlug, generation: requestGeneration, message: t[9] });
    } finally {
      if (generation.current === requestGeneration) setPending(null);
    }
  }

  // Portal access is wider than queue access. No queue markup is rendered until
  // the current tenant's authoritative queue RPC confirms STAFF or OWNER.
  if (!queue) return null;
  const positionLabel = language === "zh"
    ? `第 ${activeIndex + 1} 项，共 ${queue.requests.length} 项`
    : language === "ko"
      ? `전체 ${queue.requests.length}개 중 ${activeIndex + 1}번째`
      : `${activeIndex + 1} ${t[12]} ${queue.requests.length}`;
  const card = (request: QueueState["requests"][number], all = false) => {
    const remaining = Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - clock - clockOffset) / 1000));
    const expired = remaining === 0 || request.status === "EXPIRED";
    const status = expired ? t[16] : request.status === "PIN_VERIFIED" ? t[18] : t[17];
    return <article key={request.redemption_id} data-request-id={request.redemption_id} tabIndex={-1}
      className={`secure-redemption-card${all ? " secure-redemption-card--all" : ""}`}>
      <div className="secure-redemption-card-main">
        <div className="secure-redemption-queue-image">
          <RewardImageFrame alt={request.reward_title ?? ""} imageUrl={request.reward_image_url}
            crop={{ zoom: request.image_zoom, positionX: request.image_position_x,
              positionY: request.image_position_y }} />
        </div>
        <div className="secure-redemption-card-copy">
          <h3 title={request.reward_title}>{request.reward_title}</h3>
          <p title={request.customer_label}>{request.customer_label} · {request.presentation_type === "gift" ? "🎁" : "⭐"}</p>
          <p>{t[7]}: <time dateTime={request.requested_at}>{new Date(request.requested_at ?? request.expires_at).toLocaleTimeString(language)}</time></p>
          <p className="secure-redemption-card-status">{status} · {t[8]}: <span aria-live="off">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></p>
        </div>
      </div>
      <div className="secure-redemption-card-actions">
        <button className="button" type="button" disabled={pendingId !== null || expired}
          onClick={() => void act("approve", request.redemption_id, request.correlation_id)}>{t[2]}</button>
        <button className="button button-secondary" type="button" disabled={pendingId !== null || expired}
          onClick={() => void act("reject", request.redemption_id, request.correlation_id)}>{t[3]}</button>
      </div>
    </article>;
  };
  return <section className="settings-info-card secure-redemption-queue" aria-label={`${t[0]} · ${queue.requests.length}`}>
    <div className="secure-redemption-queue-heading">
      <h2 ref={headingRef} tabIndex={-1}>{t[0]} · {queue.requests.length}</h2>
      {queue.requests.length > 2 ? <button ref={showAllButtonRef} type="button" className="button button-secondary"
        onClick={() => dialogRef.current?.showModal()}>{t[13]}</button> : null}
    </div>
    {visibleError ? <p role="alert">{visibleError}</p> : null}
    {!queue.requests.length ? <p>{t[1]}</p> : null}
    {queue.requests.length ? <>
      <div ref={viewportRef} className="secure-redemption-queue-track" onScroll={trackManualScroll}
        aria-label={t[0]} tabIndex={0}>
        {queue.requests.map((request) => card(request))}
      </div>
      <div className="secure-redemption-queue-navigation">
        {queue.requests.length > 1 ? <button type="button" className="secure-redemption-queue-arrow"
          aria-label={t[10]} disabled={activeIndex === 0} onClick={() => move(-1)}>←</button> : null}
        <span aria-live="polite">{positionLabel}</span>
        {queue.requests.length > 1 ? <button type="button" className="secure-redemption-queue-arrow"
          aria-label={t[11]} disabled={activeIndex >= queue.requests.length - 1} onClick={() => move(1)}>→</button> : null}
      </div>
    </> : null}
    <dialog ref={dialogRef} className="secure-redemption-all-dialog" aria-label={t[13]}
      onClose={() => showAllButtonRef.current?.focus()}>
      <div className="secure-redemption-all-heading"><h2>{t[0]} · {queue.requests.length}</h2>
        <button type="button" className="secure-redemption-queue-arrow" aria-label={t[14]}
          onClick={() => dialogRef.current?.close()}>×</button></div>
      <div className="secure-redemption-all-list">{queue.requests.map((request) => card(request, true))}</div>
      <button type="button" className="button button-secondary" onClick={() => dialogRef.current?.close()}>{t[15]}</button>
    </dialog>
    {owner && queue.actor_role === "OWNER" ? <>
      <button className="button button-secondary" style={{ minHeight: 44 }} type="button"
        disabled={pendingId !== null} onClick={() => void rotatePin()}>{t[4]}</button>
      {visiblePin ? <p>{t[5]} <strong>{visiblePin.pin}</strong> · {t[6]} <time dateTime={visiblePin.validUntil}>{new Date(visiblePin.validUntil).toLocaleString(language)}</time></p> : null}
    </> : null}
  </section>;
}
