export type PlatformAdminSection = "overview" | "businesses" | "plans" | "countries" | "health" | "audit" | "system";

type NavigationMessages = Record<PlatformAdminSection | "adminMenu" | "navigation" | "close" | "refresh" | "signOut", string> & {
  descriptions: Record<PlatformAdminSection, string>;
};

const messages: Record<string, NavigationMessages> = {
  de: {
    overview: "Übersicht", businesses: "Betriebe", plans: "Pläne & Funktionen", countries: "Länder", health: "Operations & Health", audit: "Audit & Aktivitäten", system: "System", adminMenu: "Admin-Menü", navigation: "Platform-Admin-Bereiche", close: "Admin-Menü schließen", refresh: "Aktualisieren", signOut: "Abmelden",
    descriptions: { overview: "Zentrale Kennzahlen, Systemzustand und direkte Wege zu den Verwaltungsbereichen.", businesses: "Organisationen, Restaurants, Standorte und bestehende Betriebsdetails.", plans: "Wirksame Pakete, Limits, Laufzeiten und bestätigte Freischaltungen.", countries: "Länderstatus, Readiness und bestehende Aktivierungsverträge.", health: "Automatische Findings, Filter und Datenaktualität.", audit: "Kritische Abläufe sicher prüfen, ohne sensible Zugangsdaten anzuzeigen.", system: "Technische Verwaltung, Support und sichere Diagnosefunktionen." },
  },
  en: {
    overview: "Overview", businesses: "Businesses", plans: "Plans & features", countries: "Countries", health: "Operations & health", audit: "Audit & activity", system: "System", adminMenu: "Admin menu", navigation: "Platform admin sections", close: "Close admin menu", refresh: "Refresh", signOut: "Sign out",
    descriptions: { overview: "Key metrics, system status and direct paths to administrative areas.", businesses: "Organizations, restaurants, locations and existing business details.", plans: "Effective plans, limits, terms and confirmed activations.", countries: "Country status, readiness and existing activation contracts.", health: "Automated findings, filters and data freshness.", audit: "Review critical operations safely without displaying sensitive credentials.", system: "Technical administration, support and secure diagnostics." },
  },
  fr: {
    overview: "Vue d’ensemble", businesses: "Établissements", plans: "Forfaits et fonctions", countries: "Pays", health: "Opérations et santé", audit: "Audit et activités", system: "Système", adminMenu: "Menu admin", navigation: "Sections d’administration", close: "Fermer le menu admin", refresh: "Actualiser", signOut: "Se déconnecter",
    descriptions: { overview: "Indicateurs clés, état du système et accès directs aux espaces d’administration.", businesses: "Organisations, restaurants, établissements et informations existantes.", plans: "Forfaits effectifs, limites, durées et activations confirmées.", countries: "Statut des pays, préparation et contrats d’activation existants.", health: "Constats automatiques, filtres et fraîcheur des données.", audit: "Examiner les opérations critiques sans afficher d’identifiants sensibles.", system: "Administration technique, assistance et diagnostics sécurisés." },
  },
  it: {
    overview: "Panoramica", businesses: "Attività", plans: "Piani e funzioni", countries: "Paesi", health: "Operazioni e stato", audit: "Audit e attività", system: "Sistema", adminMenu: "Menu admin", navigation: "Sezioni di amministrazione", close: "Chiudi il menu admin", refresh: "Aggiorna", signOut: "Esci",
    descriptions: { overview: "Indicatori principali, stato del sistema e accessi diretti alle aree amministrative.", businesses: "Organizzazioni, ristoranti, sedi e dettagli aziendali esistenti.", plans: "Piani effettivi, limiti, durate e attivazioni confermate.", countries: "Stato dei paesi, preparazione e contratti di attivazione esistenti.", health: "Rilevamenti automatici, filtri e aggiornamento dei dati.", audit: "Controlla le operazioni critiche senza mostrare credenziali sensibili.", system: "Amministrazione tecnica, supporto e diagnostica sicura." },
  },
  es: {
    overview: "Resumen", businesses: "Negocios", plans: "Planes y funciones", countries: "Países", health: "Operaciones y estado", audit: "Auditoría y actividad", system: "Sistema", adminMenu: "Menú admin", navigation: "Secciones de administración", close: "Cerrar el menú admin", refresh: "Actualizar", signOut: "Cerrar sesión",
    descriptions: { overview: "Métricas clave, estado del sistema y accesos directos a las áreas administrativas.", businesses: "Organizaciones, restaurantes, ubicaciones y detalles existentes.", plans: "Planes efectivos, límites, vigencias y activaciones confirmadas.", countries: "Estado de los países, preparación y contratos de activación existentes.", health: "Hallazgos automáticos, filtros y actualidad de los datos.", audit: "Revisa operaciones críticas sin mostrar credenciales sensibles.", system: "Administración técnica, soporte y diagnósticos seguros." },
  },
  zh: {
    overview: "概览", businesses: "商户", plans: "套餐与功能", countries: "国家/地区", health: "运营与健康", audit: "审计与活动", system: "系统", adminMenu: "管理菜单", navigation: "平台管理区域", close: "关闭管理菜单", refresh: "刷新", signOut: "退出登录",
    descriptions: { overview: "查看核心指标、系统状态，并快速进入各管理区域。", businesses: "查看组织、餐厅、门店及现有商户详情。", plans: "查看生效套餐、限制、期限和已确认的启用项。", countries: "查看国家/地区状态、准备情况和现有启用规则。", health: "查看自动检测结果、筛选条件和数据更新时间。", audit: "在不显示敏感凭据的情况下安全检查关键操作。", system: "技术管理、支持和安全诊断功能。" },
  },
  ko: {
    overview: "개요", businesses: "매장", plans: "요금제 및 기능", countries: "국가", health: "운영 및 상태", audit: "감사 및 활동", system: "시스템", adminMenu: "관리자 메뉴", navigation: "플랫폼 관리 영역", close: "관리자 메뉴 닫기", refresh: "새로고침", signOut: "로그아웃",
    descriptions: { overview: "핵심 지표와 시스템 상태를 확인하고 관리 영역으로 바로 이동합니다.", businesses: "조직, 레스토랑, 지점 및 기존 사업장 정보를 확인합니다.", plans: "적용 중인 요금제, 한도, 기간 및 확인된 활성화를 확인합니다.", countries: "국가 상태, 준비 여부 및 기존 활성화 계약을 확인합니다.", health: "자동 점검 결과, 필터 및 데이터 최신 상태를 확인합니다.", audit: "민감한 자격 증명을 표시하지 않고 중요 작업을 안전하게 검토합니다.", system: "기술 관리, 지원 및 안전한 진단 기능입니다." },
  },
};

export function platformAdminNavigationMessages(language: string): NavigationMessages {
  return messages[language] ?? messages.de;
}
