import { useCallback, useEffect, useRef, useState } from "react";
import { RewardImageFrame } from "../../shared/components/RewardImageFrame";
import { useI18n } from "../../shared/i18n/I18nProvider";
import {
  actOnSecureRedemption,
  loadSecureRedemptionQueue,
  rotateSecureRedemptionPin,
  type SecureRedemptionQueue as QueueState,
} from "../rewards/secureRedemptionService";

const copy = {
  de: ["Offene Einlösungen", "Keine offenen Anträge.", "Bestätigen", "Ablehnen", "Redemption-PIN erneuern", "Neue PIN – nur einmal sichtbar:", "Gültig bis", "Anfrage", "Verbleibend", "Einlösung konnte nicht geprüft werden."],
  en: ["Open redemptions", "No open requests.", "Approve", "Reject", "Rotate redemption PIN", "New PIN – shown only once:", "Valid until", "Requested", "Remaining", "Redemption could not be checked."],
  fr: ["Échanges en attente", "Aucune demande ouverte.", "Confirmer", "Refuser", "Renouveler le code d'échange", "Nouveau code – affiché une seule fois :", "Valable jusqu'au", "Demande", "Temps restant", "Échange non vérifiable."],
  it: ["Riscatti in attesa", "Nessuna richiesta aperta.", "Conferma", "Rifiuta", "Rinnova PIN riscatto", "Nuovo PIN – visibile una sola volta:", "Valido fino al", "Richiesta", "Tempo rimasto", "Impossibile verificare il riscatto."],
  es: ["Canjes pendientes", "No hay solicitudes abiertas.", "Confirmar", "Rechazar", "Renovar PIN de canje", "PIN nuevo – visible una sola vez:", "Válido hasta", "Solicitud", "Tiempo restante", "No se pudo verificar el canje."],
  zh: ["待确认兑换", "没有待处理申请。", "确认", "拒绝", "更新兑换密码", "新密码（仅显示一次）：", "有效期至", "申请时间", "剩余时间", "无法核验兑换。"],
  ko: ["대기 중인 교환", "대기 중인 요청이 없습니다.", "승인", "거절", "교환 PIN 갱신", "새 PIN – 한 번만 표시:", "유효 기간", "요청 시간", "남은 시간", "교환을 확인할 수 없습니다."],
} as const;

export function SecureRedemptionQueue({ restaurantSlug, owner }: { restaurantSlug: string; owner: boolean }) {
  return <ScopedSecureRedemptionQueue key={restaurantSlug} restaurantSlug={restaurantSlug} owner={owner} />;
}

function ScopedSecureRedemptionQueue({ restaurantSlug, owner }: { restaurantSlug: string; owner: boolean }) {
  const { language } = useI18n();
  const t = copy[language] ?? copy.de;
  const generation = useRef(0);
  const requestSequence = useRef(0);
  const [queueState, setQueueState] = useState<{ slug: string; generation: number; queue: QueueState } | null>(null);
  const [error, setError] = useState<{ slug: string; generation: number; message: string } | null>(null);
  const [pending, setPending] = useState<{ slug: string; generation: number; id: string } | null>(null);
  const [newPin, setNewPin] = useState<{ slug: string; generation: number; pin: string; validUntil: string } | null>(null);
  const [clock, setClock] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);

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
      setQueueState({ slug, generation: requestGeneration, queue: next });
      setClock(Date.now());
      setClockOffset(new Date(next.server_now).getTime() - Date.now());
      setError(null);
    } catch {
      if (generation.current !== requestGeneration || requestSequence.current !== sequence) return;
      setQueueState(null);
      setError({ slug, generation: requestGeneration, message: t[9] });
    }
  }, [t]);

  useEffect(() => {
    const generationRef = generation;
    const sequenceRef = requestSequence;
    const requestGeneration = ++generationRef.current;
    sequenceRef.current++;
    setQueueState(null);
    setError(null);
    setPending(null);
    setNewPin(null);
    void refresh(restaurantSlug, requestGeneration);
    const timer = window.setInterval(() => { setClock(Date.now()); void refresh(restaurantSlug, requestGeneration); }, 5000);
    return () => {
      window.clearInterval(timer);
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

  async function act(action: "approve" | "reject", redemptionId: string, correlationId: string) {
    if (!queue || !queue.requests.some((request) => request.redemption_id === redemptionId)) return;
    const requestGeneration = generation.current;
    setPending({ slug: restaurantSlug, generation: requestGeneration, id: redemptionId });
    try {
      await actOnSecureRedemption(action, redemptionId, correlationId);
      if (generation.current === requestGeneration) await refresh(restaurantSlug, requestGeneration);
    } catch {
      if (generation.current === requestGeneration)
        setError({ slug: restaurantSlug, generation: requestGeneration, message: t[9] });
    } finally {
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
  return <section className="settings-info-card" aria-live="polite">
    <h2>{t[0]}</h2>
    {visibleError ? <p role="alert">{visibleError}</p> : null}
    {!queue.requests.length ? <p>{t[1]}</p> : null}
    {queue.requests.map((request) => {
      const remaining = Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - clock - clockOffset) / 1000));
      return <article key={request.redemption_id} className="settings-info-card">
        <div className="secure-redemption-queue-image">
          <RewardImageFrame alt={request.reward_title ?? ""} imageUrl={request.reward_image_url}
            crop={{ zoom: request.image_zoom, positionX: request.image_position_x,
              positionY: request.image_position_y }} />
        </div>
        <h3>{request.reward_title}</h3>
        <p>{request.customer_label} · {request.presentation_type === "gift" ? "🎁" : "⭐"}</p>
        <p>{t[7]}: <time dateTime={request.requested_at}>{new Date(request.requested_at ?? request.expires_at).toLocaleTimeString(language)}</time></p>
        <p>{t[8]}: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" style={{ minHeight: 44 }} type="button" disabled={pendingId !== null || remaining === 0}
            onClick={() => void act("approve", request.redemption_id, request.correlation_id)}>{t[2]}</button>
          <button className="button button-secondary" style={{ minHeight: 44 }} type="button" disabled={pendingId !== null || remaining === 0}
            onClick={() => void act("reject", request.redemption_id, request.correlation_id)}>{t[3]}</button>
        </div>
      </article>;
    })}
    {owner && queue.actor_role === "OWNER" ? <>
      <button className="button button-secondary" style={{ minHeight: 44 }} type="button"
        disabled={pendingId !== null} onClick={() => void rotatePin()}>{t[4]}</button>
      {visiblePin ? <p>{t[5]} <strong>{visiblePin.pin}</strong> · {t[6]} <time dateTime={visiblePin.validUntil}>{new Date(visiblePin.validUntil).toLocaleString(language)}</time></p> : null}
    </> : null}
  </section>;
}
