import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { useTenant } from "../tenant/TenantProvider";
import {
  downloadOwnerKybDocument,
  KYB_DOCUMENT_TYPES,
  KybDocumentError,
  listOwnerKybDocuments,
  readOwnerVerification,
  submitOwnerVerification,
  uploadOwnerKybDocument,
  type KybDocument,
  type KybDocumentType,
  type VerificationOwnerStatus,
  type VerificationProfile,
} from "./businessVerificationService";
import "./owner-business-verification.css";

const copy = {
  de: { title: "Betriebsverifizierung", intro: "Bereite deine Firmendaten vor und reiche sie zur manuellen Prüfung ein. Es beginnt weder ein Trial noch eine Zahlung.", data: "Unternehmensdaten", edit: "Firmendaten bearbeiten", register: "Registertyp", method: "Prüfweg", manual: "Manuelle Prüfung", manualInfo: "Erforderlich sind Unternehmensnachweis, Geschäftsberechtigung und Vertretungsnachweis. Unser Verifikationsteam kontaktiert dich über einen sicheren Prüfweg. Bitte sende keine Dokumente per normaler E-Mail.", digital: "Digitale Prüfung – wird vorbereitet", privacy: "Die Angaben werden für die Betriebsprüfung verwendet. Keine automatische Register-, UID-, Adress- oder Identitätsprüfung findet statt.", submit: "Zur Prüfung einreichen", waiting: "Betriebsverifizierung ausstehend", failed: "Verifikationsstatus derzeit nicht verfügbar.", incomplete: "Ergänze zuerst die Firmendaten in den rechtlichen Einstellungen.", retry: "Erneut laden", country: "Land", address: "Geschäftsanschrift", status: "Status", none: "Noch nicht eingereicht", submitting: "Wird eingereicht …" },
  en: { title: "Business verification", intro: "Prepare your business details and submit them for manual review. No trial or payment starts.", data: "Business details", edit: "Edit business details", register: "Register type", method: "Verification method", manual: "Manual review", manualInfo: "Company proof, business authorization and representation proof are required. Our team will contact you through a secure review channel. Do not email documents through ordinary email.", digital: "Digital review – in preparation", privacy: "Details are used for business review. Registry, VAT, address and identity checks are not automated.", submit: "Submit for review", waiting: "Business verification pending", failed: "Verification status is currently unavailable.", incomplete: "Complete business details in legal settings first.", retry: "Reload", country: "Country", address: "Business address", status: "Status", none: "Not submitted", submitting: "Submitting …" },
  fr: { title: "Vérification de l’établissement", intro: "Préparez les données de l’entreprise et soumettez-les à un examen manuel. Aucun essai ni paiement ne démarre.", data: "Données de l’entreprise", edit: "Modifier les données", register: "Type de registre", method: "Méthode de vérification", manual: "Examen manuel", manualInfo: "Une preuve de l’entreprise, une autorisation commerciale et une preuve de représentation sont nécessaires. Notre équipe vous contactera par un canal sécurisé. N’envoyez pas de documents par courriel ordinaire.", digital: "Examen numérique – en préparation", privacy: "Ces données servent à l’examen de l’entreprise. Aucun contrôle automatique du registre, de la TVA, de l’adresse ou de l’identité n’est effectué.", submit: "Soumettre pour examen", waiting: "Vérification en attente", failed: "Statut indisponible pour le moment.", incomplete: "Complétez d’abord les données dans les paramètres juridiques.", retry: "Recharger", country: "Pays", address: "Adresse professionnelle", status: "Statut", none: "Non soumis", submitting: "Envoi …" },
  it: { title: "Verifica dell’attività", intro: "Prepara i dati aziendali e inviali per la verifica manuale. Non iniziano prove né pagamenti.", data: "Dati aziendali", edit: "Modifica dati aziendali", register: "Tipo di registro", method: "Metodo di verifica", manual: "Verifica manuale", manualInfo: "Servono prova dell’impresa, autorizzazione commerciale e prova di rappresentanza. Il team ti contatterà tramite un canale sicuro. Non inviare documenti via email ordinaria.", digital: "Verifica digitale – in preparazione", privacy: "I dati sono usati per la verifica aziendale. Registro, IVA, indirizzo e identità non sono verificati automaticamente.", submit: "Invia per verifica", waiting: "Verifica in sospeso", failed: "Stato della verifica non disponibile.", incomplete: "Completa prima i dati nelle impostazioni legali.", retry: "Ricarica", country: "Paese", address: "Indirizzo commerciale", status: "Stato", none: "Non inviato", submitting: "Invio …" },
  es: { title: "Verificación del negocio", intro: "Prepara los datos de la empresa y envíalos para revisión manual. No empieza ninguna prueba ni pago.", data: "Datos de la empresa", edit: "Editar datos", register: "Tipo de registro", method: "Método de verificación", manual: "Revisión manual", manualInfo: "Se requieren prueba de empresa, autorización comercial y representación. El equipo te contactará por un canal seguro. No envíes documentos por correo ordinario.", digital: "Revisión digital – en preparación", privacy: "Los datos se usan para revisar el negocio. No hay comprobación automática del registro, IVA, dirección ni identidad.", submit: "Enviar para revisión", waiting: "Verificación pendiente", failed: "Estado de verificación no disponible.", incomplete: "Completa primero los datos en los ajustes legales.", retry: "Recargar", country: "País", address: "Dirección comercial", status: "Estado", none: "Sin enviar", submitting: "Enviando …" },
  zh: { title: "商户验证", intro: "填写企业资料并提交人工审核。此操作不会启动试用或付款。", data: "企业资料", edit: "编辑企业资料", register: "登记类型", method: "验证方式", manual: "人工审核", manualInfo: "需要企业证明、经营许可及代表权证明。审核团队会通过安全渠道联系你。请勿通过普通电子邮件发送文件。", digital: "数字验证——筹备中", privacy: "资料仅用于商户审核。目前不会自动核查登记、税号、地址或身份。", submit: "提交审核", waiting: "商户验证待处理", failed: "暂时无法获取验证状态。", incomplete: "请先在法律设置中补全企业资料。", retry: "重新加载", country: "国家", address: "营业地址", status: "状态", none: "尚未提交", submitting: "提交中……" },
  ko: { title: "사업체 인증", intro: "사업체 정보를 준비하여 수동 검토를 요청하세요. 체험이나 결제는 시작되지 않습니다.", data: "사업체 정보", edit: "사업체 정보 수정", register: "등록 유형", method: "인증 방법", manual: "수동 검토", manualInfo: "사업체 증명, 영업 자격 및 대표 권한 증명이 필요합니다. 담당팀이 안전한 경로로 연락합니다. 일반 이메일로 문서를 보내지 마세요.", digital: "디지털 검토 – 준비 중", privacy: "정보는 사업체 검토에 사용됩니다. 등록·세금번호·주소·신원은 자동으로 확인되지 않습니다.", submit: "검토 요청", waiting: "사업체 인증 대기 중", failed: "인증 상태를 확인할 수 없습니다.", incomplete: "먼저 법적 설정에서 사업체 정보를 완성하세요.", retry: "다시 불러오기", country: "국가", address: "사업장 주소", status: "상태", none: "미제출", submitting: "제출 중…" },
} as const;

const documentCopy = {
  de: { heading: "Nachweise sicher hochladen", intro: "Deine Nachweise werden privat gespeichert und ausschließlich deinem Betrieb sowie berechtigten Prüfern angezeigt. Ein Upload ist noch keine Freigabe.", type: "Dokumenttyp", file: "Datei", upload: "Sicher hochladen", replace: "Neue Fassung hochladen", uploading: "Wird hochgeladen …", submittedFirst: "Reiche zuerst deine Betriebsverifizierung ein. Danach kannst du Nachweise hochladen.", empty: "Noch keine Nachweise hochgeladen.", version: "Fassung", download: "Dokument herunterladen", downloading: "Wird geladen …", uploaded: "Hochgeladen", reserved: "Upload noch nicht abgeschlossen", superseded: "Durch neuere Fassung ersetzt", deletion: "Löschung vorgemerkt", deleted: "Gelöscht", typeError: "Erlaubt sind PDF-, JPG- und PNG-Dateien.", sizeError: "Die Datei muss zwischen 1 Byte und 10 MB groß sein.", permissionError: "Du bist für diesen Betrieb nicht zum Hochladen berechtigt.", uploadError: "Der Upload konnte nicht abgeschlossen werden. Bitte versuche es erneut.", success: "Der Nachweis wurde sicher gespeichert.", gisa: "GISA-Auszug", company: "Firmenbuchauszug", trade: "Gewerbeberechtigung", tax: "Steuerregistrierung", identity: "Identitätsnachweis der vertretungsbefugten Person", power: "Vollmacht" },
  en: { heading: "Upload evidence securely", intro: "Your evidence is stored privately and is visible only to your business and authorized reviewers. An upload is not an approval.", type: "Document type", file: "File", upload: "Upload securely", replace: "Upload new version", uploading: "Uploading …", submittedFirst: "Submit your business verification first. You can then upload evidence.", empty: "No evidence uploaded yet.", version: "Version", download: "Download document", downloading: "Loading …", uploaded: "Uploaded", reserved: "Upload not completed", superseded: "Replaced by a newer version", deletion: "Deletion requested", deleted: "Deleted", typeError: "PDF, JPG and PNG files are allowed.", sizeError: "The file must be between 1 byte and 10 MB.", permissionError: "You are not authorized to upload for this business.", uploadError: "The upload could not be completed. Please try again.", success: "The evidence was stored securely.", gisa: "GISA extract", company: "Company register extract", trade: "Trade licence", tax: "Tax registration", identity: "Authorized representative identity document", power: "Power of attorney" },
  fr: { heading: "Téléverser les justificatifs en sécurité", intro: "Vos justificatifs sont stockés de manière privée et visibles uniquement par votre établissement et les vérificateurs autorisés. Un téléversement ne vaut pas approbation.", type: "Type de document", file: "Fichier", upload: "Téléverser en sécurité", replace: "Téléverser une nouvelle version", uploading: "Téléversement…", submittedFirst: "Soumettez d’abord la vérification de l’établissement. Vous pourrez ensuite téléverser les justificatifs.", empty: "Aucun justificatif téléversé.", version: "Version", download: "Télécharger le document", downloading: "Chargement…", uploaded: "Téléversé", reserved: "Téléversement non terminé", superseded: "Remplacé par une version plus récente", deletion: "Suppression demandée", deleted: "Supprimé", typeError: "Les fichiers PDF, JPG et PNG sont autorisés.", sizeError: "Le fichier doit mesurer entre 1 octet et 10 Mo.", permissionError: "Vous n’êtes pas autorisé à téléverser pour cet établissement.", uploadError: "Le téléversement n’a pas pu être terminé. Réessayez.", success: "Le justificatif a été stocké en sécurité.", gisa: "Extrait GISA", company: "Extrait du registre des sociétés", trade: "Autorisation commerciale", tax: "Enregistrement fiscal", identity: "Pièce d’identité du représentant autorisé", power: "Procuration" },
  it: { heading: "Carica i documenti in modo sicuro", intro: "I documenti sono archiviati privatamente e visibili solo alla tua attività e ai revisori autorizzati. Il caricamento non equivale all’approvazione.", type: "Tipo di documento", file: "File", upload: "Carica in modo sicuro", replace: "Carica una nuova versione", uploading: "Caricamento…", submittedFirst: "Invia prima la verifica dell’attività. In seguito potrai caricare i documenti.", empty: "Nessun documento caricato.", version: "Versione", download: "Scarica documento", downloading: "Caricamento…", uploaded: "Caricato", reserved: "Caricamento non completato", superseded: "Sostituito da una versione più recente", deletion: "Eliminazione richiesta", deleted: "Eliminato", typeError: "Sono consentiti file PDF, JPG e PNG.", sizeError: "Il file deve avere una dimensione compresa tra 1 byte e 10 MB.", permissionError: "Non sei autorizzato a caricare documenti per questa attività.", uploadError: "Impossibile completare il caricamento. Riprova.", success: "Il documento è stato archiviato in modo sicuro.", gisa: "Estratto GISA", company: "Estratto del registro delle imprese", trade: "Licenza commerciale", tax: "Registrazione fiscale", identity: "Documento d’identità del rappresentante autorizzato", power: "Procura" },
  es: { heading: "Subir documentos de forma segura", intro: "Los documentos se guardan de forma privada y solo son visibles para tu negocio y los revisores autorizados. Subirlos no supone su aprobación.", type: "Tipo de documento", file: "Archivo", upload: "Subir de forma segura", replace: "Subir nueva versión", uploading: "Subiendo…", submittedFirst: "Envía primero la verificación del negocio. Después podrás subir los documentos.", empty: "Todavía no hay documentos.", version: "Versión", download: "Descargar documento", downloading: "Cargando…", uploaded: "Subido", reserved: "Carga no completada", superseded: "Sustituido por una versión más reciente", deletion: "Eliminación solicitada", deleted: "Eliminado", typeError: "Se permiten archivos PDF, JPG y PNG.", sizeError: "El archivo debe tener entre 1 byte y 10 MB.", permissionError: "No tienes permiso para subir documentos de este negocio.", uploadError: "No se pudo completar la carga. Inténtalo de nuevo.", success: "El documento se guardó de forma segura.", gisa: "Extracto GISA", company: "Extracto del registro mercantil", trade: "Licencia comercial", tax: "Registro fiscal", identity: "Documento de identidad del representante autorizado", power: "Poder de representación" },
  zh: { heading: "安全上传证明文件", intro: "证明文件将以私密方式保存，仅向你的商户及获授权的审核人员显示。上传文件并不代表审核通过。", type: "文件类型", file: "文件", upload: "安全上传", replace: "上传新版本", uploading: "正在上传……", submittedFirst: "请先提交商户验证，之后即可上传证明文件。", empty: "尚未上传证明文件。", version: "版本", download: "下载文件", downloading: "正在加载……", uploaded: "已上传", reserved: "上传尚未完成", superseded: "已由新版本替代", deletion: "已申请删除", deleted: "已删除", typeError: "允许上传 PDF、JPG 和 PNG 文件。", sizeError: "文件大小必须介于 1 字节和 10 MB 之间。", permissionError: "你无权为此商户上传文件。", uploadError: "无法完成上传，请重试。", success: "证明文件已安全保存。", gisa: "GISA 摘录", company: "公司登记册摘录", trade: "营业许可", tax: "税务登记", identity: "授权代表身份证明", power: "授权委托书" },
  ko: { heading: "증빙 서류 안전하게 업로드", intro: "증빙 서류는 비공개로 저장되며 해당 사업체와 권한이 있는 검토자만 볼 수 있습니다. 업로드만으로 승인이 완료되지는 않습니다.", type: "서류 유형", file: "파일", upload: "안전하게 업로드", replace: "새 버전 업로드", uploading: "업로드 중…", submittedFirst: "먼저 사업체 인증을 제출하세요. 이후 증빙 서류를 업로드할 수 있습니다.", empty: "업로드된 증빙 서류가 없습니다.", version: "버전", download: "서류 다운로드", downloading: "불러오는 중…", uploaded: "업로드됨", reserved: "업로드 미완료", superseded: "새 버전으로 대체됨", deletion: "삭제 요청됨", deleted: "삭제됨", typeError: "PDF, JPG, PNG 파일만 허용됩니다.", sizeError: "파일 크기는 1바이트 이상 10MB 이하여야 합니다.", permissionError: "이 사업체의 서류를 업로드할 권한이 없습니다.", uploadError: "업로드를 완료하지 못했습니다. 다시 시도하세요.", success: "증빙 서류가 안전하게 저장되었습니다.", gisa: "GISA 등록부 발췌본", company: "회사 등기부 발췌본", trade: "영업 허가증", tax: "세무 등록", identity: "권한 있는 대표자의 신분증", power: "위임장" },
} as const;

const documentLabels = {
  GISA_EXTRACT: "gisa",
  COMPANY_REGISTER_EXTRACT: "company",
  TRADE_LICENSE: "trade",
  TAX_REGISTRATION: "tax",
  REPRESENTATIVE_ID: "identity",
  POWER_OF_ATTORNEY: "power",
} as const;

export function OwnerBusinessVerificationPage() {
  const { language } = useI18n();
  const t = copy[language as keyof typeof copy] ?? copy.de;
  const documentsText = documentCopy[language as keyof typeof documentCopy] ?? documentCopy.de;
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id;
  const [profile, setProfile] = useState<VerificationProfile | null>(null);
  const [ownerStatus, setOwnerStatus] = useState<VerificationOwnerStatus | null>(null);
  const [registerType, setRegisterType] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<KybDocument[]>([]);
  const [documentType, setDocumentType] = useState<KybDocumentType>("GISA_EXTRACT");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentMessage, setDocumentMessage] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
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
      const [data, ownerDocuments] = await Promise.all([
        readOwnerVerification(restaurantId),
        listOwnerKybDocuments(restaurantId),
      ]);
      setProfile(data.profile);
      setOwnerStatus(data.ownerStatus);
      setDocuments(ownerDocuments);
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

  function messageForDocumentError(value: unknown) {
    if (!(value instanceof KybDocumentError)) return documentsText.uploadError;
    if (value.code === "FILE_TYPE") return documentsText.typeError;
    if (value.code === "FILE_SIZE") return documentsText.sizeError;
    if (value.code === "PERMISSION") return documentsText.permissionError;
    return documentsText.uploadError;
  }

  async function uploadDocument() {
    if (!restaurantId || !documentFile || documentBusy || !ownerStatus?.submitted_at) return;
    setDocumentBusy(true);
    setDocumentError("");
    setDocumentMessage("");
    try {
      await uploadOwnerKybDocument({ restaurantId, documentType, file: documentFile });
      setDocumentFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setDocuments(await listOwnerKybDocuments(restaurantId));
      setDocumentMessage(documentsText.success);
    } catch (uploadError) {
      setDocumentError(messageForDocumentError(uploadError));
    } finally {
      setDocumentBusy(false);
    }
  }

  async function downloadDocument(document: KybDocument) {
    if (downloadingId) return;
    setDownloadingId(document.document_id);
    setDocumentError("");
    try {
      const blob = await downloadOwnerKybDocument(document);
      const extension = document.mime_type === "application/pdf" ? "pdf" : document.mime_type === "image/png" ? "png" : "jpg";
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${document.document_type.toLowerCase()}-v${document.version}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setDocumentError(messageForDocumentError(downloadError));
    } finally {
      setDownloadingId(null);
    }
  }

  const selectedTypeHasUploadedVersion = documents.some((document) =>
    document.document_type === documentType && document.status === "UPLOADED");
  const displayedVerificationStatus = ownerStatus?.submitted_at
    ? statusNames[ownerStatus.status]?.[language] ?? ownerStatus.status
    : t.none;
  const statusLabel = (status: KybDocument["status"]) => ({
    PENDING_UPLOAD: documentsText.reserved,
    UPLOADED: documentsText.uploaded,
    SUPERSEDED: documentsText.superseded,
    DELETION_REQUESTED: documentsText.deletion,
    DELETED: documentsText.deleted,
  })[status];

  return <main className="page-container" data-testid="owner-business-verification">
    <header className="page-header"><div><h1>{t.title}</h1><p>{t.intro}</p></div></header>
    <section className="card" aria-labelledby="business-verification-data">
      <h2 id="business-verification-data">{t.data}</h2>
      <p>{t.country}: {profile?.business_country ?? activeRestaurant?.country ?? "—"}</p>
      <p>{profile?.legal_name ?? activeRestaurant?.name ?? "—"} · {profile?.legal_form ?? "—"}</p>
      <p>{t.address}: {profile?.business_street ?? activeRestaurant?.address ?? "—"}, {profile?.business_postal_code ?? activeRestaurant?.postal_code ?? ""} {profile?.business_city ?? activeRestaurant?.city ?? ""}</p>
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
      <p role="status">{t.status}: {displayedVerificationStatus}</p>
      {ownerStatus?.rejection_reason ? <p role="alert">{ownerStatus.rejection_reason}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="button" disabled={busy || registerType.trim().length < 2 || !ownerStatus?.pending_tenant || !ownerStatus.submission_allowed} onClick={() => void submit()} type="button">
        {busy ? t.submitting : t.submit}
      </button>
      <button className="button secondary" onClick={() => void reload()} type="button">{t.retry}</button>
    </section>
    <section className="card kyb-document-section" aria-labelledby="business-verification-documents">
      <h2 id="business-verification-documents">{documentsText.heading}</h2>
      <p>{documentsText.intro}</p>
      {!ownerStatus?.submitted_at ? <p className="kyb-document-notice" role="status">{documentsText.submittedFirst}</p> : <>
        <div className="kyb-document-upload">
          <label htmlFor="kyb-document-type">{documentsText.type}</label>
          <select id="kyb-document-type" value={documentType} onChange={(event) => {
            setDocumentType(event.target.value as KybDocumentType);
            setDocumentError("");
            setDocumentMessage("");
          }}>
            {KYB_DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{documentsText[documentLabels[type]]}</option>)}
          </select>
          <label htmlFor="kyb-document-file">{documentsText.file}</label>
          <input ref={fileInput} id="kyb-document-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => {
            setDocumentFile(event.target.files?.[0] ?? null);
            setDocumentError("");
            setDocumentMessage("");
          }} />
          <button className="button" disabled={!documentFile || documentBusy} onClick={() => void uploadDocument()} type="button">
            {documentBusy ? documentsText.uploading : selectedTypeHasUploadedVersion ? documentsText.replace : documentsText.upload}
          </button>
        </div>
      </>}
      {documentMessage ? <p role="status">{documentMessage}</p> : null}
      {documentError ? <p role="alert">{documentError}</p> : null}
      {documents.length === 0 ? <p>{documentsText.empty}</p> : <ul className="kyb-document-list">
        {documents.map((document) => <li key={document.document_id} data-document-status={document.status}>
          <div><strong>{documentsText[documentLabels[document.document_type]]}</strong>
            <span>{documentsText.version} {document.version} · {statusLabel(document.status)}</span>
            {document.uploaded_at ? <time dateTime={document.uploaded_at}>{new Intl.DateTimeFormat(language).format(new Date(document.uploaded_at))}</time> : null}
          </div>
          {document.status !== "PENDING_UPLOAD" && document.status !== "DELETED" ? <button className="button secondary" disabled={Boolean(downloadingId)} onClick={() => void downloadDocument(document)} type="button">
            {downloadingId === document.document_id ? documentsText.downloading : documentsText.download}
          </button> : null}
        </li>)}
      </ul>}
    </section>
  </main>;
}
