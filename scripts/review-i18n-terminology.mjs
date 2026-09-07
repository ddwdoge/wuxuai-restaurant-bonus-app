import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const classification = JSON.parse(readFileSync(resolve(process.cwd(), "docs/reports/2026-09-06_I18N_TRANSLATION_DATA_CLASSIFICATION.json"), "utf8"));
const translationPath = "/private/tmp/wuxuai-translated-static-ui-copy.json";
const translations = JSON.parse(readFileSync(translationPath, "utf8"));
const bySource = new Map(classification.approved.map((entry) => [entry.source, entry.key]));
const languages = ["en", "fr", "it", "es", "zh", "ko"];

const exact = {
  "Basic": ["BASIC", "BASIC", "BASIC", "BASIC", "BASIC", "BASIC"],
  "Pro": ["PRO", "PRO", "PRO", "PRO", "PRO", "PRO"],
  "Premium": ["PREMIUM", "PREMIUM", "PREMIUM", "PREMIUM", "PREMIUM", "PREMIUM"],
  "Premium · technisch vorbereitet": ["PREMIUM · technically prepared", "PREMIUM · préparé techniquement", "PREMIUM · preparato tecnicamente", "PREMIUM · preparado técnicamente", "PREMIUM · 技术准备就绪", "PREMIUM · 기술 준비 완료"],
  "Platform Admin": ["Platform Admin", "Platform Admin", "Platform Admin", "Platform Admin", "Platform Admin", "Platform Admin"],
  "Tages-PIN": ["Daily PIN", "Code PIN quotidien", "PIN giornaliero", "PIN diario", "每日 PIN", "일일 PIN"],
  "Mitarbeiter": ["Staff", "Personnel", "Personale", "Personal", "员工", "직원"],
  "Punkte": ["Points", "Points", "Punti", "Puntos", "积分", "포인트"],
  "Punkte buchen": ["Credit points", "Créditer des points", "Accreditare punti", "Acreditar puntos", "记入积分", "포인트 적립"],
  "Punkte gutschreiben": ["Credit points", "Créditer des points", "Accreditare punti", "Acreditar puntos", "记入积分", "포인트 적립"],
  "Belohnung": ["Reward", "Récompense", "Premio", "Recompensa", "奖励", "리워드"],
  "Einlösen": ["Redeem", "Utiliser", "Riscatta", "Canjear", "兑换", "사용"],
  "Angebot": ["Offer", "Offre", "Offerta", "Oferta", "优惠", "혜택"],
  "Testphase": ["Trial period", "Période d’essai", "Periodo di prova", "Periodo de prueba", "试用期", "체험 기간"],
  "Deaktivieren": ["Deactivate", "Désactiver", "Disattiva", "Desactivar", "停用", "비활성화"],
  "Suspendieren": ["Suspend", "Suspendre", "Sospendi", "Suspender", "暂停", "정지"],
  "Zahlung": ["Payment", "Paiement", "Pagamento", "Pago", "付款", "결제"],
  "Billing": ["Billing", "Facturation", "Fatturazione", "Facturación", "账单", "결제 관리"],
};

const dailyPinExact = {
  "Tages-PIN eingeben": ["Enter daily PIN", "Saisir le code PIN quotidien", "Inserisci il PIN giornaliero", "Introducir el PIN diario", "输入每日 PIN", "일일 PIN 입력"],
  "Bitte den Mitarbeiter um die heutige vierstellige Tages-PIN.": ["Ask staff for today's four-digit daily PIN.", "Demandez au personnel le code PIN quotidien à quatre chiffres.", "Chiedi al personale il PIN giornaliero di quattro cifre.", "Pide al personal el PIN diario de cuatro dígitos.", "请向员工询问今天的四位每日 PIN。", "직원에게 오늘의 네 자리 일일 PIN을 요청하세요."],
  "Weiter zur Tages-PIN": ["Continue to daily PIN", "Continuer vers le code PIN quotidien", "Continua al PIN giornaliero", "Continuar al PIN diario", "继续输入每日 PIN", "일일 PIN으로 계속"],
  "Vierstellige Tages-PIN": ["Four-digit daily PIN", "Code PIN quotidien à quatre chiffres", "PIN giornaliero di quattro cifre", "PIN diario de cuatro dígitos", "四位每日 PIN", "네 자리 일일 PIN"],
  "Mitarbeiter & Tages-PIN": ["Staff & daily PIN", "Personnel et code PIN quotidien", "Personale e PIN giornaliero", "Personal y PIN diario", "员工与每日 PIN", "직원 및 일일 PIN"],
  "Öffne den Mitarbeiterbereich und sieh die heutige Tages-PIN.": ["Open the staff area to view today's daily PIN.", "Ouvrez l’espace personnel pour voir le code PIN quotidien.", "Apri l’area del personale per vedere il PIN giornaliero.", "Abre el área de personal para ver el PIN diario.", "打开员工区查看今天的每日 PIN。", "직원 영역을 열어 오늘의 일일 PIN을 확인하세요."],
  "Bestandsgäste scannen und fragen nach der Tages-PIN.": ["Existing guests scan and ask for the daily PIN.", "Les clients existants scannent le code et demandent le code PIN quotidien.", "I clienti esistenti scansionano e chiedono il PIN giornaliero.", "Los clientes existentes escanean y solicitan el PIN diario.", "现有顾客扫描后询问每日 PIN。", "기존 고객은 스캔한 후 일일 PIN을 요청합니다."],
  "Tages-PIN verfügbar:": ["Daily PIN available:", "Code PIN quotidien disponible :", "PIN giornaliero disponibile:", "PIN diario disponible:", "每日 PIN 可用：", "일일 PIN 사용 가능:"],
  "Mit Tages-PIN bestätigen": ["Confirm with daily PIN", "Confirmer avec le code PIN quotidien", "Conferma con il PIN giornaliero", "Confirmar con el PIN diario", "使用每日 PIN 确认", "일일 PIN으로 확인"],
  "Tages-PIN": ["Daily PIN", "Code PIN quotidien", "PIN giornaliero", "PIN diario", "每日 PIN", "일일 PIN"],
  "Tages-PIN nicht verfügbar": ["Daily PIN unavailable", "Code PIN quotidien indisponible", "PIN giornaliero non disponibile", "PIN diario no disponible", "每日 PIN 不可用", "일일 PIN을 사용할 수 없음"],
  "Tages-PIN nötig": ["Daily PIN required", "Code PIN quotidien requis", "PIN giornaliero richiesto", "PIN diario obligatorio", "需要每日 PIN", "일일 PIN 필요"],
  "Details zur heutigen Tages-PIN öffnen": ["Open today's daily PIN details", "Ouvrir les détails du code PIN quotidien", "Apri i dettagli del PIN giornaliero", "Abrir los detalles del PIN diario", "打开今天的每日 PIN 详情", "오늘의 일일 PIN 세부정보 열기"],
  "Tages-PIN wird geladen …": ["Loading daily PIN…", "Chargement du code PIN quotidien…", "Caricamento del PIN giornaliero…", "Cargando el PIN diario…", "正在加载每日 PIN…", "일일 PIN 불러오는 중…"],
  "Heutige Tages-PIN": ["Today's daily PIN", "Code PIN quotidien du jour", "PIN giornaliero di oggi", "PIN diario de hoy", "今天的每日 PIN", "오늘의 일일 PIN"],
  "Tages-PIN erforderlich": ["Daily PIN required", "Code PIN quotidien requis", "PIN giornaliero richiesto", "PIN diario obligatorio", "需要每日 PIN", "일일 PIN 필요"],
};

Object.assign(exact, dailyPinExact);

for (const [source, values] of Object.entries(exact)) {
  const key = bySource.get(source);
  if (!key) continue;
  languages.forEach((language, index) => {
    if (translations[language]?.[key] !== undefined) translations[language][key] = values[index];
  });
}

const dailyPinPatterns = {
  en: /\b(?:(?:day|daily|today'?s?)[- ]?PIN|dailyPIN)\b/gi,
  fr: /\b(?:(?:jour|quotidien|journalier|aujourd'hui|day)[- ]?PIN|PIN quotidien)\b/gi,
  it: /\b(?:(?:giorno|giornaliero|oggi)[- ]?PIN|PIN giornaliero)\b/gi,
  es: /\b(?:(?:día|diaria|diario|hoy)[- ]?PIN|PIN diario)\b/gi,
};
const dailyPinTerms = { en: "daily PIN", fr: "code PIN quotidien", it: "PIN giornaliero", es: "PIN diario" };
for (const entry of classification.approved.filter(({ source }) => source.includes("Tages-PIN"))) {
  for (const language of Object.keys(dailyPinPatterns)) {
    const current = translations[language]?.[entry.key];
    if (current) translations[language][entry.key] = current.replace(dailyPinPatterns[language], dailyPinTerms[language]);
  }
}

writeFileSync(translationPath, `${JSON.stringify(translations, null, 2)}\n`);

const issues = [];
for (const entry of classification.approved) {
  for (const language of languages) {
    const value = translations[language]?.[entry.key];
    if (!value) continue;
    if (/\b(?:WUXUAI®|WUXUAI® Bonus|BASIC|PRO|PREMIUM)\b/.test(entry.source)) {
      for (const protectedTerm of entry.source.match(/WUXUAI® Bonus|WUXUAI®|BASIC|PRO|PREMIUM/g) ?? []) {
        if (!value.includes(protectedTerm)) issues.push({ kind: "BRAND_OR_PLAN_CHANGED", language, key: entry.key, source: entry.source, value });
      }
    }
    if (entry.source.includes("Angebot") && language === "en" && /\b(?:reward|gift)\b/i.test(value)) issues.push({ kind: "OFFER_AS_REWARD", language, key: entry.key, source: entry.source, value });
    if (entry.source.includes("Tages-PIN") && ["en", "fr", "it", "es"].includes(language) && !value.includes(dailyPinTerms[language])) issues.push({ kind: "DAILY_PIN_INCONSISTENT", language, key: entry.key, source: entry.source, value });
  }
}
writeFileSync(resolve(process.cwd(), "docs/reports/2026-09-06_I18N_TERMINOLOGY_QA.json"), `${JSON.stringify({ issue_count: issues.length, issues }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ reviewed: classification.approved.length, issueCount: issues.length })}\n`);
