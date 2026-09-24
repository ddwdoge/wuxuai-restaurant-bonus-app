import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { useTenant } from "../tenant/TenantProvider";
import { loadRestaurantLegalSetup } from "../legal/legalService";
import { readOwnerVerification, submitOwnerVerification, type VerificationOwnerStatus, type VerificationProfile, type VerificationReadiness } from "./businessVerificationService";

const copy = {
  de: { title: "Betriebsverifizierung", intro: "Bereite deine Firmendaten vor und reiche sie zur manuellen Prüfung ein. Es beginnt weder ein Trial noch eine Zahlung.", data: "Unternehmensdaten", edit: "Firmendaten bearbeiten", register: "Registertyp", method: "Prüfweg", manual: "Manuelle Prüfung", manualInfo: "Erforderlich sind Unternehmensnachweis, Geschäftsberechtigung und Vertretungsnachweis. Unser Verifikationsteam kontaktiert dich über einen sicheren Prüfweg. Bitte sende keine Dokumente per normaler E-Mail.", digital: "Digitale Prüfung – wird vorbereitet", privacy: "Die Angaben werden für die Betriebsprüfung verwendet. Keine automatische Register-, UID-, Adress- oder Identitätsprüfung findet statt.", submit: "Zur Prüfung einreichen", waiting: "Betriebsverifizierung ausstehend", failed: "Verifikationsstatus derzeit nicht verfügbar.", incomplete: "Ergänze zuerst die Firmendaten in den rechtlichen Einstellungen.", retry: "Erneut laden", country: "Land", address: "Geschäftsanschrift", status: "Status", none: "Noch nicht eingereicht", submitting: "Wird eingereicht …" },
  en: { title: "Business verification", intro: "Prepare your business details and submit them for manual review. No trial or payment starts.", data: "Business details", edit: "Edit business details", register: "Register type", method: "Verification method", manual: "Manual review", manualInfo: "Company proof, business authorization and representation proof are required. Our team will contact you through a secure review channel. Do not email documents through ordinary email.", digital: "Digital review – in preparation", privacy: "Details are used for business review. Registry, VAT, address and identity checks are not automated.", submit: "Submit for review", waiting: "Business verification pending", failed: "Verification status is currently unavailable.", incomplete: "Complete business details in legal settings first.", retry: "Reload", country: "Country", address: "Business address", status: "Status", none: "Not submitted", submitting: "Submitting …" },
  fr: { title: "Vérification de l’établissement", intro: "Préparez les données de l’entreprise et soumettez-les à un examen manuel. Aucun essai ni paiement ne démarre.", data: "Données de l’entreprise", edit: "Modifier les données", register: "Type de registre", method: "Méthode de vérification", manual: "Examen manuel", manualInfo: "Une preuve de l’entreprise, une autorisation commerciale et une preuve de représentation sont nécessaires. Notre équipe vous contactera par un canal sécurisé. N’envoyez pas de documents par courriel ordinaire.", digital: "Examen numérique – en préparation", privacy: "Ces données servent à l’examen de l’entreprise. Aucun contrôle automatique du registre, de la TVA, de l’adresse ou de l’identité n’est effectué.", submit: "Soumettre pour examen", waiting: "Vérification en attente", failed: "Statut indisponible pour le moment.", incomplete: "Complétez d’abord les données dans les paramètres juridiques.", retry: "Recharger", country: "Pays", address: "Adresse professionnelle", status: "Statut", none: "Non soumis", submitting: "Envoi …" },
  it: { title: "Verifica dell’attività", intro: "Prepara i dati aziendali e inviali per la verifica manuale. Non iniziano prove né pagamenti.", data: "Dati aziendali", edit: "Modifica dati aziendali", register: "Tipo di registro", method: "Metodo di verifica", manual: "Verifica manuale", manualInfo: "Servono prova dell’impresa, autorizzazione commerciale e prova di rappresentanza. Il team ti contatterà tramite un canale sicuro. Non inviare documenti via email ordinaria.", digital: "Verifica digitale – in preparazione", privacy: "I dati sono usati per la verifica aziendale. Registro, IVA, indirizzo e identità non sono verificati automaticamente.", submit: "Invia per verifica", waiting: "Verifica in sospeso", failed: "Stato della verifica non disponibile.", incomplete: "Completa prima i dati nelle impostazioni legali.", retry: "Ricarica", country: "Paese", address: "Indirizzo commerciale", status: "Stato", none: "Non inviato", submitting: "Invio …" },
  es: { title: "Verificación del negocio", intro: "Prepara los datos de la empresa y envíalos para revisión manual. No empieza ninguna prueba ni pago.", data: "Datos de la empresa", edit: "Editar datos", register: "Tipo de registro", method: "Método de verificación", manual: "Revisión manual", manualInfo: "Se requieren prueba de empresa, autorización comercial y representación. El equipo te contactará por un canal seguro. No envíes documentos por correo ordinario.", digital: "Revisión digital – en preparación", privacy: "Los datos se usan para revisar el negocio. No hay comprobación automática del registro, IVA, dirección ni identidad.", submit: "Enviar para revisión", waiting: "Verificación pendiente", failed: "Estado de verificación no disponible.", incomplete: "Completa primero los datos en los ajustes legales.", retry: "Recargar", country: "País", address: "Dirección comercial", status: "Estado", none: "Sin enviar", submitting: "Enviando …" },
  zh: { title: "商户验证", intro: "填写企业资料并提交人工审核。此操作不会启动试用或付款。", data: "企业资料", edit: "编辑企业资料", register: "登记类型", method: "验证方式", manual: "人工审核", manualInfo: "需要企业证明、经营许可及代表权证明。审核团队会通过安全渠道联系你。请勿通过普通电子邮件发送文件。", digital: "数字验证——筹备中", privacy: "资料仅用于商户审核。目前不会自动核查登记、税号、地址或身份。", submit: "提交审核", waiting: "商户验证待处理", failed: "暂时无法获取验证状态。", incomplete: "请先在法律设置中补全企业资料。", retry: "重新加载", country: "国家", address: "营业地址", status: "状态", none: "尚未提交", submitting: "提交中……" },
  ko: { title: "사업체 인증", intro: "사업체 정보를 준비하여 수동 검토를 요청하세요. 체험이나 결제는 시작되지 않습니다.", data: "사업체 정보", edit: "사업체 정보 수정", register: "등록 유형", method: "인증 방법", manual: "수동 검토", manualInfo: "사업체 증명, 영업 자격 및 대표 권한 증명이 필요합니다. 담당팀이 안전한 경로로 연락합니다. 일반 이메일로 문서를 보내지 마세요.", digital: "디지털 검토 – 준비 중", privacy: "정보는 사업체 검토에 사용됩니다. 등록·세금번호·주소·신원은 자동으로 확인되지 않습니다.", submit: "검토 요청", waiting: "사업체 인증 대기 중", failed: "인증 상태를 확인할 수 없습니다.", incomplete: "먼저 법적 설정에서 사업체 정보를 완성하세요.", retry: "다시 불러오기", country: "국가", address: "사업장 주소", status: "상태", none: "미제출", submitting: "제출 중…" },
} as const;

export function OwnerBusinessVerificationPage() {
  const { language } = useI18n();
  const t = copy[language as keyof typeof copy] ?? copy.de;
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id;
  const [readiness, setReadiness] = useState<VerificationReadiness | null>(null);
  const [profile, setProfile] = useState<VerificationProfile | null>(null);
  const [ownerStatus, setOwnerStatus] = useState<VerificationOwnerStatus | null>(null);
  const [submittedProfile, setSubmittedProfile] = useState<Record<string, string | null> | null>(null);
  const [registerType, setRegisterType] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useRef<{ request: string; correlation: string } | null>(null);
  const statusNames: Record<string, Record<string, string>> = {
    PENDING_ACTIVATION: { de: "Eingereicht / ausstehend", en: "Submitted / pending", fr: "Soumis / en attente", it: "Inviato / in attesa", es: "Enviado / pendiente", zh: "已提交／待审核", ko: "제출됨 / 대기 중" },
    IN_REVIEW: { de: "In Prüfung", en: "In review", fr: "En cours d’examen", it: "In revisione", es: "En revisión", zh: "审核中", ko: "검토 중" },
    VERIFIED: { de: "Bestätigt", en: "Verified", fr: "Vérifié", it: "Verificato", es: "Verificado", zh: "已验证", ko: "확인됨" },
    REJECTED: { de: "Abgelehnt", en: "Rejected", fr: "Refusé", it: "Respinto", es: "Rechazado", zh: "已拒绝", ko: "거절됨" },
    SUSPENDED: { de: "Gesperrt", en: "Suspended", fr: "Suspendu", it: "Sospeso", es: "Suspendido", zh: "已暂停", ko: "중단됨" },
  };

  const reload = useCallback(async () => {
    if (!restaurantId) return;
    setError("");
    try {
      const [data, legal] = await Promise.all([readOwnerVerification(restaurantId), loadRestaurantLegalSetup(restaurantId)]);
      setReadiness(data.readiness);
      setProfile(data.profile);
      setOwnerStatus(data.ownerStatus);
      setSubmittedProfile(legal.profile);
      if (data.profile.register_type) setRegisterType(data.profile.register_type);
    } catch { setError(t.failed); }
  }, [restaurantId, t.failed]);
  useEffect(() => { void reload(); }, [reload]);

  async function submit() {
    if (!restaurantId || busy || registerType.trim().length < 2) return;
    ids.current ??= { request: crypto.randomUUID(), correlation: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      await submitOwnerVerification(restaurantId, registerType.trim(), ids.current.request, ids.current.correlation);
      ids.current = null;
      await reload();
    } catch { setError(t.incomplete); }
    finally { setBusy(false); }
  }

  return <main className="page-container" data-testid="owner-business-verification">
    <header className="page-header"><div><h1>{t.title}</h1><p>{t.intro}</p></div></header>
    <section className="card" aria-labelledby="business-verification-data">
      <h2 id="business-verification-data">{t.data}</h2>
      <p>{t.country}: {submittedProfile?.country ?? activeRestaurant?.country ?? "—"}</p>
      <p>{submittedProfile?.company_name ?? "—"} · {submittedProfile?.legal_form ?? "—"}</p>
      <p>{t.address}: {profile?.business_street ?? submittedProfile?.street ?? "—"}, {profile?.business_postal_code ?? submittedProfile?.postal_code ?? ""} {profile?.business_city ?? submittedProfile?.city ?? ""}</p>
      {profile?.revision ? <p>{t.status}: {profile.status} · #{profile.revision}</p> : null}
      <Link className="button secondary" to="/admin/legal">{t.edit}</Link>
    </section>
    <section className="card" aria-labelledby="business-verification-method">
      <h2 id="business-verification-method">{t.method}</h2>
      <label htmlFor="business-register-type">{t.register}</label>
      <input className="input" id="business-register-type" maxLength={120} onChange={(event) => { ids.current = null; setRegisterType(event.target.value); }} required value={registerType} />
      <p><label><input checked readOnly type="radio" name="business-verification-method" /> {t.manual}</label></p>
      <p>{t.manualInfo}</p>
      <p><label><input disabled type="radio" name="business-verification-method" /> {t.digital}</label></p>
      <p>{t.privacy}</p>
      <p role="status">{t.status}: {readiness?.status ? statusNames[readiness.status]?.[language] ?? readiness.status : t.none}</p>
      {ownerStatus?.rejection_reason ? <p role="alert">{ownerStatus.rejection_reason}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="button" disabled={busy || registerType.trim().length < 2 || !ownerStatus?.pending_tenant || !ownerStatus.submission_allowed} onClick={() => void submit()} type="button">
        {busy ? t.submitting : t.submit}
      </button>
      <button className="button secondary" onClick={() => void reload()} type="button">{t.retry}</button>
    </section>
  </main>;
}
