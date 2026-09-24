import { useEffect, useRef, useState } from "react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { PlatformAdminLayout } from "../platform/PlatformAdminLayout";
import { manageVerification, readVerificationAdminDetail, readVerificationQueue,
  type VerificationAdminAction, type VerificationAdminDetail, type VerificationQueueItem } from "./businessVerificationService";

const actionNames: Record<VerificationAdminAction, Record<string, string>> = {
  START_REVIEW: { de: "Prüfung beginnen", en: "Start review", fr: "Commencer l’examen", it: "Avvia revisione", es: "Iniciar revisión", zh: "开始审核", ko: "검토 시작" },
  REJECT: { de: "Ablehnen", en: "Reject", fr: "Refuser", it: "Rifiuta", es: "Rechazar", zh: "拒绝", ko: "거절" },
  SUSPEND: { de: "Aussetzen", en: "Suspend", fr: "Suspendre", it: "Sospendi", es: "Suspender", zh: "暂停", ko: "중단" },
  CORRECT_PROFILE: { de: "Profil korrigieren", en: "Correct profile", fr: "Corriger le profil", it: "Correggi profilo", es: "Corregir perfil", zh: "更正资料", ko: "프로필 수정" },
  GRANT_TEST: { de: "Synthetischen Testzugang geben", en: "Grant synthetic test access", fr: "Accorder l’accès de test synthétique", it: "Concedi accesso di test sintetico", es: "Conceder acceso de prueba sintética", zh: "授予合成测试权限", ko: "합성 테스트 권한 부여" },
  REVOKE_TEST: { de: "Testzugang widerrufen", en: "Revoke test access", fr: "Révoquer l’accès de test", it: "Revoca accesso di test", es: "Revocar acceso de prueba", zh: "撤销测试权限", ko: "테스트 권한 철회" },
};

const adminCopy: Record<string, { country: string; status: string; method: string; date: string; actions: string; locked: string; reasonCode: string; reason: string; phrase: string; cancel: string; noActivation: string; synthetic: string }> = {
  de: { country: "Land", status: "Status", method: "Methode", date: "Datum", actions: "Zulässige Aktionen", locked: "Echte Verifikation und Aktivierung bleiben gesperrt. Jede Aktion benötigt eine frische Administrator-Anmeldung.", reasonCode: "Grundcode", reason: "Begründung ohne personenbezogene Daten", phrase: "Bestätigungsphrase exakt eingeben:", cancel: "Abbrechen", noActivation: "Kein Trial, keine Zahlung und keine Freischaltung.", synthetic: "Nur synthetischer Staging-Test, höchstens 24 Stunden, kein Live-Zugang." },
  en: { country: "Country", status: "Status", method: "Method", date: "Date", actions: "Allowed actions", locked: "Real verification and activation remain blocked. Every action requires recent administrator authentication.", reasonCode: "Reason code", reason: "Reason without personal data", phrase: "Type the exact confirmation phrase:", cancel: "Cancel", noActivation: "No trial, payment or entitlement activation.", synthetic: "Synthetic staging test only, at most 24 hours, no live access." },
  fr: { country: "Pays", status: "Statut", method: "Méthode", date: "Date", actions: "Actions autorisées", locked: "La vérification réelle reste bloquée. Chaque action exige une authentification récente.", reasonCode: "Code de motif", reason: "Motif sans données personnelles", phrase: "Saisissez exactement la phrase :", cancel: "Annuler", noActivation: "Aucun essai, paiement ou droit activé.", synthetic: "Test synthétique uniquement, 24 heures au maximum, sans accès réel." },
  it: { country: "Paese", status: "Stato", method: "Metodo", date: "Data", actions: "Azioni consentite", locked: "La verifica reale resta bloccata. Ogni azione richiede autenticazione recente.", reasonCode: "Codice motivo", reason: "Motivo senza dati personali", phrase: "Inserisci la frase esatta:", cancel: "Annulla", noActivation: "Nessuna prova, pagamento o diritto attivato.", synthetic: "Solo test sintetico, massimo 24 ore, nessun accesso live." },
  es: { country: "País", status: "Estado", method: "Método", date: "Fecha", actions: "Acciones permitidas", locked: "La verificación real sigue bloqueada. Cada acción requiere autenticación reciente.", reasonCode: "Código del motivo", reason: "Motivo sin datos personales", phrase: "Introduce la frase exacta:", cancel: "Cancelar", noActivation: "Sin prueba, pago ni derechos activados.", synthetic: "Solo prueba sintética, máximo 24 horas, sin acceso real." },
  zh: { country: "国家", status: "状态", method: "方式", date: "日期", actions: "允许的操作", locked: "真实验证与激活仍被阻止。每次操作均需近期管理员认证。", reasonCode: "原因代码", reason: "不含个人信息的原因", phrase: "准确输入确认短语：", cancel: "取消", noActivation: "不会激活试用、付款或权限。", synthetic: "仅限合成测试，最长 24 小时，无正式环境访问。" },
  ko: { country: "국가", status: "상태", method: "방식", date: "날짜", actions: "허용된 작업", locked: "실제 인증과 활성화는 차단됩니다. 모든 작업에는 최근 관리자 인증이 필요합니다.", reasonCode: "사유 코드", reason: "개인정보 없는 사유", phrase: "확인 문구를 정확히 입력하세요:", cancel: "취소", noActivation: "체험, 결제, 권한이 활성화되지 않습니다.", synthetic: "합성 테스트 전용, 최대 24시간, 실제 서비스 접근 불가." },
};

const labels: Record<string, { title: string; intro: string; empty: string; details: string; revisions: string; history: string; evidence: string; error: string; close: string }> = {
  de: { title: "Betriebsprüfung", intro: "Eingereichte Betriebe lesen. Echte Verifikation bleibt gesperrt.", empty: "Keine Einreichungen", details: "Details", revisions: "Profilrevisionen", history: "Statushistorie", evidence: "Evidence-Metadaten", error: "Prüfdaten konnten nicht geladen werden.", close: "Schließen" },
  en: { title: "Business verification", intro: "Read submitted businesses. Real verification remains blocked.", empty: "No submissions", details: "Details", revisions: "Profile revisions", history: "Status history", evidence: "Evidence metadata", error: "Review data could not be loaded.", close: "Close" },
  fr: { title: "Vérification des établissements", intro: "Lire les demandes. La vérification réelle reste bloquée.", empty: "Aucune demande", details: "Détails", revisions: "Révisions du profil", history: "Historique des statuts", evidence: "Métadonnées des preuves", error: "Impossible de charger les données.", close: "Fermer" },
  it: { title: "Verifica delle attività", intro: "Consulta le richieste. La verifica reale resta bloccata.", empty: "Nessuna richiesta", details: "Dettagli", revisions: "Revisioni del profilo", history: "Cronologia degli stati", evidence: "Metadati delle prove", error: "Impossibile caricare i dati.", close: "Chiudi" },
  es: { title: "Verificación de negocios", intro: "Consulta las solicitudes. La verificación real sigue bloqueada.", empty: "Sin solicitudes", details: "Detalles", revisions: "Revisiones del perfil", history: "Historial de estados", evidence: "Metadatos de pruebas", error: "No se pudieron cargar los datos.", close: "Cerrar" },
  zh: { title: "商户审核", intro: "只读查看提交资料。真实验证仍被禁用。", empty: "暂无提交", details: "详情", revisions: "资料修订", history: "状态历史", evidence: "证据元数据", error: "无法加载审核资料。", close: "关闭" },
  ko: { title: "사업체 검토", intro: "제출 자료를 읽기 전용으로 확인합니다. 실제 인증은 차단됩니다.", empty: "제출 없음", details: "상세 정보", revisions: "프로필 수정 이력", history: "상태 기록", evidence: "증빙 메타데이터", error: "검토 자료를 불러올 수 없습니다.", close: "닫기" },
};

export function PlatformBusinessVerificationPage() {
  const { language } = useI18n();
  const t = labels[language] ?? labels.de;
  const a = adminCopy[language] ?? adminCopy.de;
  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [detail, setDetail] = useState<VerificationAdminDetail | null>(null);
  const [error, setError] = useState(false);
  const [action, setAction] = useState<VerificationAdminAction | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [profileDraft, setProfileDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const ids = useRef<{ requestId: string; correlationId: string } | null>(null);
  useEffect(() => {
    let active = true;
    void readVerificationQueue().then((rows) => { if (active) setQueue(rows); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  async function showDetail(caseId: string) {
    try { setDetail(await readVerificationAdminDetail(caseId)); setError(false); }
    catch { setError(true); }
  }
  function clearAction() {
    setAction(null); setReasonCode(""); setReason(""); setConfirmation("");
    setProfileDraft({}); setActionError(""); ids.current = null;
  }
  function selectAction(next: VerificationAdminAction) {
    clearAction();
    setAction(next);
    const latest = detail?.profiles[0];
    if (next === "CORRECT_PROFILE" && latest) {
      setProfileDraft(Object.fromEntries(["legal_name", "legal_form", "register_type", "register_identifier", "vat_id", "business_street", "business_postal_code", "business_city", "business_country", "authorized_representative"].map((key) => [key, String(latest[key as keyof typeof latest] ?? "")] )));
    }
  }
  async function submitAction() {
    if (!detail || !action || busy || !detail.allowed_actions.includes(action)) return;
    const phrase = `CONFIRMED:${detail.restaurant_name}:${detail.restaurant_id}:${action}`;
    if (confirmation !== phrase || !/^[A-Z][A-Z0-9_]{2,79}$/.test(reasonCode) || reason.trim().length < 10) return;
    ids.current ??= { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    setBusy(true); setActionError("");
    try {
      await manageVerification({ restaurantId: detail.restaurant_id, action,
        method: action === "START_REVIEW" ? "MANUAL" : undefined,
        reasonCode, reason: reason.trim(), profile: action === "CORRECT_PROFILE" ? profileDraft : undefined,
        requestId: ids.current.requestId, correlationId: ids.current.correlationId, confirmation });
      const [freshDetail, freshQueue] = await Promise.all([readVerificationAdminDetail(detail.case_id), readVerificationQueue()]);
      setDetail(freshDetail); setQueue(freshQueue); clearAction();
    } catch { setActionError(t.error); }
    finally { setBusy(false); }
  }
  return <PlatformAdminLayout title={t.title} description={t.intro}>
    <section className="card"><h2>{t.title}</h2>
      {queue.length ? <div style={{ overflowX: "auto" }}><table><thead><tr>
        <th>{a.country}</th><th>{a.status}</th><th>{a.method}</th><th>{a.date}</th><th />
      </tr></thead><tbody>{queue.map((item) => <tr key={item.case_id}>
        <td>{item.country}</td><td>{item.status}</td><td>{item.method}</td>
        <td>{new Date(item.submitted_at).toLocaleDateString(language)}</td>
        <td><button className="button secondary" onClick={() => void showDetail(item.case_id)} style={{ minHeight: 44 }} type="button">{t.details}</button></td>
      </tr>)}</tbody></table></div> : <p>{t.empty}</p>}
    </section>
    {error ? <p role="alert">{t.error}</p> : null}
    <AppDrawer open={Boolean(detail)} onClose={() => { if (!busy) { clearAction(); setDetail(null); } }} size="large"
      title={detail?.restaurant_name ?? t.title} description={t.intro}
      footer={<button className="button secondary" disabled={busy} onClick={() => { clearAction(); setDetail(null); }} style={{ minHeight: 44 }} type="button">{t.close}</button>}>
      {detail ? <div>
        <p>{detail.country} · {detail.method} · {detail.status}</p>
        <h3>{t.revisions}</h3>
        {detail.profiles.map((item) => <article className="card" key={item.id}>
          <strong>#{item.revision} · {item.status}</strong>
          <p>{item.legal_name} · {item.legal_form}</p>
          <p>{item.business_street}, {item.business_postal_code} {item.business_city}, {item.business_country}</p>
        </article>)}
        <h3>{t.history}</h3>{detail.history.map((item, index) => <p key={`${item.decided_at}-${index}`}>{item.action} · {item.new_status} · {item.reason_code}</p>)}
        <h3>{t.evidence}</h3>{detail.evidence.map((item, index) => <p key={`${item.content_hash}-${index}`}>{item.evidence_type} · {item.retention_class}</p>)}
        <h3>{a.actions}</h3>
        <p>{a.locked}</p>
        {detail.allowed_actions.map((candidate) => <button className="button secondary" disabled={busy} key={candidate} style={{ minHeight: 44 }}
          onClick={() => selectAction(candidate)} type="button">{actionNames[candidate][language] ?? actionNames[candidate].de}</button>)}
        {action ? <section aria-label={actionNames[action][language] ?? actionNames[action].de} className="card">
          <h4>{actionNames[action][language] ?? actionNames[action].de}</h4>
          <p>{detail.restaurant_name} · {detail.country}. {action === "GRANT_TEST" ? a.synthetic : a.noActivation}</p>
          {action === "CORRECT_PROFILE" ? Object.entries(profileDraft).map(([key, value]) => <label key={key} style={{ display: "block" }}>{key}
            <input className="input" maxLength={240} onChange={(event) => { ids.current = null; setProfileDraft((previous) => ({ ...previous, [key]: event.target.value })); }} value={value} />
          </label>) : null}
          <label style={{ display: "block" }}>{a.reasonCode}<input className="input" maxLength={80} onChange={(event) => { ids.current = null; setReasonCode(event.target.value.toUpperCase()); }} value={reasonCode} /></label>
          <label style={{ display: "block" }}>{a.reason}<textarea className="input" maxLength={500} onChange={(event) => { ids.current = null; setReason(event.target.value); }} value={reason} /></label>
          <p>{a.phrase} <code>{`CONFIRMED:${detail.restaurant_name}:${detail.restaurant_id}:${action}`}</code></p>
          <input aria-label={a.phrase} className="input" onChange={(event) => { ids.current = null; setConfirmation(event.target.value); }} value={confirmation} />
          {actionError ? <p role="alert">{actionError}</p> : null}
          <button className="button" disabled={busy || confirmation !== `CONFIRMED:${detail.restaurant_name}:${detail.restaurant_id}:${action}` || !/^[A-Z][A-Z0-9_]{2,79}$/.test(reasonCode) || reason.trim().length < 10} style={{ minHeight: 44 }}
            onClick={() => void submitAction()} type="button">{busy ? "…" : actionNames[action][language] ?? actionNames[action].de}</button>
          <button className="button secondary" disabled={busy} onClick={clearAction} style={{ minHeight: 44 }} type="button">{a.cancel}</button>
        </section> : null}
      </div> : null}
    </AppDrawer>
  </PlatformAdminLayout>;
}
