import { useEffect, useRef, useState } from "react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { PlatformAdminLayout } from "../platform/PlatformAdminLayout";
import { manageVerification, openPlatformKybDocument, readPlatformKybReviewDetail,
  readPlatformKybReviewQueue, readVerificationAdminDetail,
  type KybDocument, type PlatformKybReviewDetail, type PlatformKybReviewQueueItem,
  type VerificationAdminAction, type VerificationAdminDetail } from "./businessVerificationService";
import "./platform-business-verification.css";

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

const kybCopy: Record<string, { documents: string; documentCount: string; version: string; open: string; opening: string; audit: string; missing: string; noInference: string; openError: string }> = {
  de: { documents: "Private KYB-Nachweise", documentCount: "Nachweise", version: "Fassung", open: "Sicher öffnen", opening: "Wird sicher geladen …", audit: "Dokumentverlauf", missing: "Nicht angegeben", noInference: "Vorhandene Uploads belegen weder Vollständigkeit noch Freigabefähigkeit. Pflichtnachweise je Rechtsform und Aufbewahrungsfristen sind noch nicht festgelegt.", openError: "Das private Dokument konnte nicht sicher geöffnet werden." },
  en: { documents: "Private KYB evidence", documentCount: "Evidence", version: "Version", open: "Open securely", opening: "Loading securely …", audit: "Document history", missing: "Not provided", noInference: "Uploaded files do not prove completeness or readiness for approval. Required evidence by legal form and retention periods are not defined yet.", openError: "The private document could not be opened securely." },
  fr: { documents: "Justificatifs KYB privés", documentCount: "Justificatifs", version: "Version", open: "Ouvrir en sécurité", opening: "Chargement sécurisé…", audit: "Historique du document", missing: "Non renseigné", noInference: "Les fichiers téléversés ne prouvent ni l’exhaustivité ni l’aptitude à l’approbation. Les pièces obligatoires par forme juridique et les durées de conservation ne sont pas encore définies.", openError: "Le document privé n’a pas pu être ouvert en sécurité." },
  it: { documents: "Documenti KYB privati", documentCount: "Documenti", version: "Versione", open: "Apri in sicurezza", opening: "Caricamento sicuro…", audit: "Cronologia del documento", missing: "Non indicato", noInference: "I file caricati non dimostrano completezza né idoneità all’approvazione. I documenti obbligatori per forma giuridica e i periodi di conservazione non sono ancora definiti.", openError: "Impossibile aprire il documento privato in modo sicuro." },
  es: { documents: "Documentos KYB privados", documentCount: "Documentos", version: "Versión", open: "Abrir de forma segura", opening: "Carga segura…", audit: "Historial del documento", missing: "No indicado", noInference: "Los archivos subidos no demuestran integridad ni aptitud para aprobación. Los documentos obligatorios según la forma jurídica y los plazos de conservación aún no están definidos.", openError: "No se pudo abrir el documento privado de forma segura." },
  zh: { documents: "私密 KYB 证明", documentCount: "证明文件", version: "版本", open: "安全打开", opening: "正在安全加载……", audit: "文件记录", missing: "未提供", noInference: "已上传文件不代表资料完整或具备批准条件。各法律形式所需文件及保存期限尚未确定。", openError: "无法安全打开私密文件。" },
  ko: { documents: "비공개 KYB 증빙", documentCount: "증빙", version: "버전", open: "안전하게 열기", opening: "안전하게 불러오는 중…", audit: "문서 이력", missing: "제공되지 않음", noInference: "업로드된 파일만으로 완전성이나 승인 가능성이 입증되지 않습니다. 법적 형태별 필수 증빙과 보존 기간은 아직 정해지지 않았습니다.", openError: "비공개 문서를 안전하게 열 수 없습니다." },
};

const documentTypeLabels: Record<string, Record<string, string>> = {
  GISA_EXTRACT: { de: "GISA-Auszug", en: "GISA extract", fr: "Extrait GISA", it: "Estratto GISA", es: "Extracto GISA", zh: "GISA 摘录", ko: "GISA 등록부 발췌본" },
  COMPANY_REGISTER_EXTRACT: { de: "Firmenbuchauszug", en: "Company register extract", fr: "Extrait du registre des sociétés", it: "Estratto del registro delle imprese", es: "Extracto del registro mercantil", zh: "公司登记册摘录", ko: "회사 등기부 발췌본" },
  TRADE_LICENSE: { de: "Gewerbeberechtigung", en: "Trade licence", fr: "Autorisation commerciale", it: "Licenza commerciale", es: "Licencia comercial", zh: "营业许可", ko: "영업 허가증" },
  TAX_REGISTRATION: { de: "Steuerregistrierung", en: "Tax registration", fr: "Enregistrement fiscal", it: "Registrazione fiscale", es: "Registro fiscal", zh: "税务登记", ko: "세무 등록" },
  REPRESENTATIVE_ID: { de: "Identitätsnachweis der Vertretung", en: "Representative identity document", fr: "Pièce d’identité du représentant", it: "Documento d’identità del rappresentante", es: "Documento de identidad del representante", zh: "代表人身份证明", ko: "대표자 신분증" },
  POWER_OF_ATTORNEY: { de: "Vollmacht", en: "Power of attorney", fr: "Procuration", it: "Procura", es: "Poder de representación", zh: "授权委托书", ko: "위임장" },
};

export function PlatformBusinessVerificationPage() {
  const { language } = useI18n();
  const t = labels[language] ?? labels.de;
  const a = adminCopy[language] ?? adminCopy.de;
  const k = kybCopy[language] ?? kybCopy.de;
  const [queue, setQueue] = useState<PlatformKybReviewQueueItem[]>([]);
  const [detail, setDetail] = useState<VerificationAdminDetail | null>(null);
  const [kybDetail, setKybDetail] = useState<PlatformKybReviewDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState("");
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
    void readPlatformKybReviewQueue().then((rows) => { if (active) setQueue(rows); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  async function showDetail(caseId: string) {
    try {
      const [adminDetail, documentDetail] = await Promise.all([
        readVerificationAdminDetail(caseId), readPlatformKybReviewDetail(caseId),
      ]);
      setDetail(adminDetail); setKybDetail(documentDetail); setDocumentError(""); setError(false);
    }
    catch { setError(true); }
  }
  async function openDocument(document: KybDocument) {
    if (openingId) return;
    setOpeningId(document.document_id); setDocumentError("");
    try {
      const blob = await openPlatformKybDocument(document);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setDocumentError(k.openError); }
    finally { setOpeningId(null); }
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
      const [freshDetail, freshKybDetail, freshQueue] = await Promise.all([
        readVerificationAdminDetail(detail.case_id), readPlatformKybReviewDetail(detail.case_id), readPlatformKybReviewQueue(),
      ]);
      setDetail(freshDetail); setKybDetail(freshKybDetail); setQueue(freshQueue); clearAction();
    } catch { setActionError(t.error); }
    finally { setBusy(false); }
  }
  return <PlatformAdminLayout title={t.title} description={t.intro}>
    <section className="card"><h2>{t.title}</h2>
      {queue.length ? <div style={{ overflowX: "auto" }}><table><thead><tr>
        <th>{t.title}</th><th>{a.country}</th><th>{a.status}</th><th>{k.documentCount}</th><th>{a.date}</th><th />
      </tr></thead><tbody>{queue.map((item) => <tr key={item.case_id}>
        <td>{item.restaurant_name}</td><td>{item.country}</td><td>{item.status}</td><td>{item.document_count}</td>
        <td>{new Date(item.latest_document_at).toLocaleDateString(language)}</td>
        <td><button className="button secondary" onClick={() => void showDetail(item.case_id)} style={{ minHeight: 44 }} type="button">{t.details}</button></td>
      </tr>)}</tbody></table></div> : <p>{t.empty}</p>}
    </section>
    {error ? <p role="alert">{t.error}</p> : null}
    <AppDrawer open={Boolean(detail && kybDetail)} onClose={() => { if (!busy) { clearAction(); setDetail(null); setKybDetail(null); } }} size="large"
      title={detail?.restaurant_name ?? t.title} description={t.intro}
      footer={<button className="button secondary" disabled={busy} onClick={() => { clearAction(); setDetail(null); setKybDetail(null); }} style={{ minHeight: 44 }} type="button">{t.close}</button>}>
      {detail && kybDetail ? <div>
        <p>{detail.country} · {detail.method} · {detail.status}</p>
        <section aria-labelledby="platform-kyb-documents" className="platform-kyb-review-section" data-testid="platform-kyb-document-review">
          <h3 id="platform-kyb-documents">{k.documents}</h3>
          <p className="platform-kyb-review-notice">{k.noInference}</p>
          {kybDetail.documents.length ? <ul className="platform-kyb-document-list">
            {kybDetail.documents.map((document) => <li key={document.document_id}>
              <div><strong>{documentTypeLabels[document.document_type]?.[language] ?? documentTypeLabels[document.document_type]?.de ?? k.missing}</strong>
                <span>{k.version} {document.version} · {document.status}</span>
                <time dateTime={document.uploaded_at ?? document.reserved_at}>{new Intl.DateTimeFormat(language).format(new Date(document.uploaded_at ?? document.reserved_at))}</time>
              </div>
              {document.status !== "PENDING_UPLOAD" && document.status !== "DELETED" ? <button className="button secondary" disabled={Boolean(openingId)} onClick={() => void openDocument(document)} type="button">
                {openingId === document.document_id ? k.opening : k.open}
              </button> : null}
            </li>)}
          </ul> : <p>{t.empty}</p>}
          {documentError ? <p role="alert">{documentError}</p> : null}
          <h3>{k.audit}</h3>
          {kybDetail.document_events.length ? <ol className="platform-kyb-audit-list">
            {kybDetail.document_events.map((event, index) => <li key={`${event.document_id}-${event.created_at}-${index}`}>
              <strong>{event.event_type}</strong><span>{event.previous_status ?? k.missing} → {event.new_status}</span>
              <span>{event.reason_code}</span><time dateTime={event.created_at}>{new Intl.DateTimeFormat(language).format(new Date(event.created_at))}</time>
            </li>)}
          </ol> : <p>{k.missing}</p>}
        </section>
        <h3>{t.revisions}</h3>
        {detail.profiles.map((item) => <article className="card" key={item.id}>
          <strong>#{item.revision} · {item.status}</strong>
          <p>{item.legal_name || k.missing} · {item.legal_form || k.missing}</p>
          <p>{item.business_street || k.missing}, {item.business_postal_code || k.missing} {item.business_city || k.missing}, {item.business_country || k.missing}</p>
        </article>)}
        <h3>{t.history}</h3>{detail.history.map((item, index) => <p key={`${item.decided_at}-${index}`}>{item.action} · {item.new_status} · {item.reason_code}</p>)}
        <h3>{t.evidence}</h3>{detail.evidence.map((item, index) => <p key={`${item.uploaded_at}-${index}`}>{item.evidence_type} · {item.retention_class}</p>)}
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
