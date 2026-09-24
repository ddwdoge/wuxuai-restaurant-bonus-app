import { useI18n } from "../../shared/i18n/I18nProvider";
import type { Restaurant } from "../../shared/types/domain";

export function isPendingActivation(restaurant: Pick<Restaurant, "activation_status"> | null | undefined) {
  return restaurant?.activation_status === "pending_activation";
}

export const pendingActivationMessages = {
  de: { title: "Verifizierung ausstehend", body: "Du kannst deinen Betrieb und Entwürfe vorbereiten. Live-Funktionen bleiben bis zur Verifizierung, Länderfreigabe und bestätigten Billing-Aktivierung gesperrt.", plan: "BASIC ist nur vorgemerkt. Kein aktiver Tarif, keine verfügbare Kapazität und keine gestartete Testphase.", save: "Einrichtung als Entwurf speichern", saved: "Einrichtung als Entwurf gespeichert.", preview: "Nur Vorschau – keine gültigen Kunden-QRs, PINs oder Downloads.", draft: "Nur als Entwurf speichern", verification: "Betriebsverifizierung prüfen" },
  en: { title: "Verification pending", body: "You can prepare your business and drafts. Live features remain locked until verification, country release and confirmed billing activation.", plan: "BASIC is only preselected. No active plan, available capacity or trial has started.", save: "Save setup as a draft", saved: "Setup saved as a draft.", preview: "Preview only – no valid customer QR codes, PINs or downloads.", draft: "Save as draft only", verification: "Review business verification" },
  fr: { title: "Vérification en attente", body: "Vous pouvez préparer votre établissement et vos brouillons. Les fonctions actives restent bloquées jusqu’à la vérification, l’autorisation du pays et l’activation confirmée de la facturation.", plan: "BASIC est uniquement présélectionné. Aucun forfait actif, aucune capacité disponible ni période d’essai commencée.", save: "Enregistrer la configuration en brouillon", saved: "Configuration enregistrée en brouillon.", preview: "Aperçu uniquement – aucun QR client valide, code PIN ou téléchargement.", draft: "Enregistrer uniquement en brouillon", verification: "Voir la vérification" },
  it: { title: "Verifica in attesa", body: "Puoi preparare il locale e le bozze. Le funzioni operative restano bloccate fino alla verifica, all’abilitazione del paese e all’attivazione confermata della fatturazione.", plan: "BASIC è solo preselezionato. Nessun piano attivo, capacità disponibile o periodo di prova avviato.", save: "Salva la configurazione come bozza", saved: "Configurazione salvata come bozza.", preview: "Solo anteprima – nessun QR cliente valido, PIN o download.", draft: "Salva solo come bozza", verification: "Verifica attività" },
  es: { title: "Verificación pendiente", body: "Puedes preparar tu negocio y borradores. Las funciones operativas siguen bloqueadas hasta la verificación, la autorización del país y la activación confirmada de la facturación.", plan: "BASIC solo está preseleccionado. No hay plan activo, capacidad disponible ni periodo de prueba iniciado.", save: "Guardar configuración como borrador", saved: "Configuración guardada como borrador.", preview: "Solo vista previa: sin QR de cliente válidos, PIN ni descargas.", draft: "Guardar solo como borrador", verification: "Revisar verificación" },
  zh: { title: "等待验证", body: "你可以准备商家资料和草稿。正式功能在验证完成、国家开放及账单激活确认前保持锁定。", plan: "BASIC 仅为预选方案。尚无生效套餐、可用容量或已开始的试用期。", save: "将设置保存为草稿", saved: "设置已保存为草稿。", preview: "仅供预览——不提供有效的顾客二维码、PIN 或下载。", draft: "仅保存为草稿", verification: "查看商户验证" },
  ko: { title: "인증 대기 중", body: "매장 정보와 초안을 준비할 수 있습니다. 운영 기능은 인증, 국가 승인 및 결제 활성화 확인 전까지 잠겨 있습니다.", plan: "BASIC은 사전 선택일 뿐입니다. 활성 요금제, 사용 가능한 용량 또는 시작된 체험 기간이 없습니다.", save: "설정을 초안으로 저장", saved: "설정이 초안으로 저장되었습니다.", preview: "미리보기 전용 – 유효한 고객 QR 코드, PIN 또는 다운로드가 없습니다.", draft: "초안으로만 저장", verification: "사업체 인증 확인" },
};

export function usePendingActivationMessages() {
  const { language } = useI18n();
  return pendingActivationMessages[language];
}
