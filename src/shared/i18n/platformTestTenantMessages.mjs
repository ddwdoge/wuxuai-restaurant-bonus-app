const en = {
  title: "Isolated test tenant", description: "Only the server-side TEST_ONLY contract may fully clean up test data.",
  preflightPassed: "Preflight passed. The tenant is eligible for controlled cleanup.", preflightBlocked: "Preflight blocked",
  reason: "Reason", reasonPlaceholder: "Internal reason for test marking and later cleanup", strongConfirmation: "Strong confirmation", required: "Required", recentAuthRequired: "This action requires a platform sign-in within the last 10 minutes.",
  mark: "Mark as TEST_ONLY", cleanup: "Fully clean up test tenant", authorizedOnly: "Only authorized Platform Admins may mark or clean up test tenants.", cleaned: "The isolated test tenant was fully cleaned up.",
  foreignTitle: "Foreign test association", foreignDescription: "Removes only this customer’s accidental association with the marked test tenant.",
  narrowPreflightPassed: "Scoped preflight passed.", narrowPreflightBlocked: "Scoped preflight blocked",
  tenant: "Test tenant", customer: "Customer", authId: "Auth ID", accountId: "Account ID", localMembershipId: "Local membership ID",
  localPointTransactions: "Local points transactions", localPointBalance: "Local points balance", localVisits: "Local visits/events", localRewards: "Local rewards/gifts", localRedemptions: "Local redemptions", localNotifications: "Local notifications",
  foreignMemberships: "Foreign memberships", foreignPointTransactions: "Foreign points transactions", foreignDataChanged: "Foreign data will be changed",
  relationConfirmation: "The reason and confirmation from test-tenant cleanup also apply to this narrowly scoped action.", removeForeign: "Remove only foreign test association", authorizedRemoveOnly: "Only authorized Platform Admins may remove this test association.", preflightUnavailable: "Scoped preflight unavailable",
  markCustomer: "Mark as test customer", markRejected: "The TEST_ONLY marking was safely rejected.", cleanupRejected: "The test tenant was not deleted. Check preflight and confirmation.", relationRejected: "The foreign test association was not removed. Check target, preflight and confirmation.",
};

const de = {
  title: "Isolierter Test-Mandant", description: "Nur der serverseitige TEST_ONLY-Vertrag darf Testdaten vollständig bereinigen.",
  preflightPassed: "Vorprüfung bestanden. Der Mandant ist für die kontrollierte Bereinigung geeignet.", preflightBlocked: "Vorprüfung blockiert",
  reason: "Begründung", reasonPlaceholder: "Interner Grund für Testmarkierung und spätere Bereinigung", strongConfirmation: "Starke Bestätigung", required: "Erforderlich", recentAuthRequired: "Diese Aktion erfordert eine Plattform-Anmeldung innerhalb der letzten 10 Minuten.",
  mark: "Als TEST_ONLY markieren", cleanup: "Test-Mandant vollständig bereinigen", authorizedOnly: "Nur berechtigte Platform Admins dürfen Test-Mandanten markieren oder bereinigen.", cleaned: "Der isolierte Test-Mandant wurde vollständig bereinigt.",
  foreignTitle: "Fremde Test-Zuordnung", foreignDescription: "Entfernt ausschließlich die versehentliche Beziehung dieses Kunden zum markierten Test-Mandanten.",
  narrowPreflightPassed: "Enge Vorprüfung bestanden.", narrowPreflightBlocked: "Enge Vorprüfung blockiert",
  tenant: "Test-Mandant", customer: "Kunde", authId: "Auth-ID", accountId: "Konto-ID", localMembershipId: "Lokale Mitgliedschafts-ID",
  localPointTransactions: "Lokale Punktebuchungen", localPointBalance: "Lokaler Punktestand", localVisits: "Lokale Besuche/Ereignisse", localRewards: "Lokale Prämien/Geschenke", localRedemptions: "Lokale Einlösungen", localNotifications: "Lokale Benachrichtigungen",
  foreignMemberships: "Fremde Mitgliedschaften", foreignPointTransactions: "Fremde Punktebuchungen", foreignDataChanged: "Fremddaten werden geändert",
  relationConfirmation: "Begründung und Bestätigung aus der Test-Mandanten-Bereinigung gelten auch für diese eng begrenzte Aktion.", removeForeign: "Nur fremde Test-Zuordnung entfernen", authorizedRemoveOnly: "Nur berechtigte Platform Admins dürfen diese Test-Zuordnung entfernen.", preflightUnavailable: "Enge Vorprüfung nicht verfügbar",
  markCustomer: "Als Testgast markieren", markRejected: "Die TEST_ONLY-Markierung wurde sicher abgelehnt.", cleanupRejected: "Der Test-Mandant wurde nicht gelöscht. Vorprüfung und Bestätigung prüfen.", relationRejected: "Die fremde Test-Zuordnung wurde nicht entfernt. Ziel, Vorprüfung und Bestätigung prüfen.",
};

const fr = {
  title: "Tenant de test isolé", description: "Seul le contrat TEST_ONLY côté serveur peut supprimer entièrement les données de test.",
  preflightPassed: "Précontrôle réussi. Le tenant peut faire l’objet d’un nettoyage contrôlé.", preflightBlocked: "Précontrôle bloqué",
  reason: "Motif", reasonPlaceholder: "Motif interne du marquage de test et du nettoyage ultérieur", strongConfirmation: "Confirmation renforcée", required: "Requis", recentAuthRequired: "Cette action nécessite une connexion à la plateforme au cours des 10 dernières minutes.",
  mark: "Marquer comme TEST_ONLY", cleanup: "Nettoyer entièrement le tenant de test", authorizedOnly: "Seuls les Platform Admins autorisés peuvent marquer ou nettoyer les tenants de test.", cleaned: "Le tenant de test isolé a été entièrement nettoyé.",
  foreignTitle: "Association de test externe", foreignDescription: "Supprime uniquement l’association accidentelle de ce client avec le tenant de test marqué.",
  narrowPreflightPassed: "Précontrôle ciblé réussi.", narrowPreflightBlocked: "Précontrôle ciblé bloqué",
  tenant: "Tenant de test", customer: "Client", authId: "ID d’authentification", accountId: "ID du compte", localMembershipId: "ID d’adhésion locale",
  localPointTransactions: "Transactions de points locales", localPointBalance: "Solde de points local", localVisits: "Visites/événements locaux", localRewards: "Récompenses/cadeaux locaux", localRedemptions: "Utilisations locales", localNotifications: "Notifications locales",
  foreignMemberships: "Adhésions externes", foreignPointTransactions: "Transactions de points externes", foreignDataChanged: "Des données externes seront modifiées",
  relationConfirmation: "Le motif et la confirmation du nettoyage du tenant de test s’appliquent aussi à cette action ciblée.", removeForeign: "Supprimer uniquement l’association de test externe", authorizedRemoveOnly: "Seuls les Platform Admins autorisés peuvent supprimer cette association de test.", preflightUnavailable: "Précontrôle ciblé indisponible",
  markCustomer: "Marquer comme client test", markRejected: "Le marquage TEST_ONLY a été refusé en toute sécurité.", cleanupRejected: "Le tenant de test n’a pas été supprimé. Vérifiez le précontrôle et la confirmation.", relationRejected: "L’association de test externe n’a pas été supprimée. Vérifiez la cible, le précontrôle et la confirmation.",
};

const it = {
  title: "Tenant di test isolato", description: "Solo il contratto TEST_ONLY lato server può eliminare completamente i dati di test.",
  preflightPassed: "Verifica preliminare superata. Il tenant è idoneo alla pulizia controllata.", preflightBlocked: "Verifica preliminare bloccata",
  reason: "Motivo", reasonPlaceholder: "Motivo interno per il contrassegno di test e la successiva pulizia", strongConfirmation: "Conferma forte", required: "Obbligatorio", recentAuthRequired: "Questa azione richiede un accesso alla piattaforma negli ultimi 10 minuti.",
  mark: "Contrassegna come TEST_ONLY", cleanup: "Pulisci completamente il tenant di test", authorizedOnly: "Solo i Platform Admin autorizzati possono contrassegnare o pulire tenant di test.", cleaned: "Il tenant di test isolato è stato pulito completamente.",
  foreignTitle: "Associazione di test esterna", foreignDescription: "Rimuove esclusivamente l’associazione accidentale di questo cliente con il tenant di test contrassegnato.",
  narrowPreflightPassed: "Verifica mirata superata.", narrowPreflightBlocked: "Verifica mirata bloccata",
  tenant: "Tenant di test", customer: "Cliente", authId: "ID autenticazione", accountId: "ID account", localMembershipId: "ID adesione locale",
  localPointTransactions: "Transazioni punti locali", localPointBalance: "Saldo punti locale", localVisits: "Visite/eventi locali", localRewards: "Premi/regali locali", localRedemptions: "Riscatti locali", localNotifications: "Notifiche locali",
  foreignMemberships: "Adesioni esterne", foreignPointTransactions: "Transazioni punti esterne", foreignDataChanged: "I dati esterni verranno modificati",
  relationConfirmation: "Il motivo e la conferma della pulizia del tenant di test valgono anche per questa azione mirata.", removeForeign: "Rimuovi solo l’associazione di test esterna", authorizedRemoveOnly: "Solo i Platform Admin autorizzati possono rimuovere questa associazione di test.", preflightUnavailable: "Verifica mirata non disponibile",
  markCustomer: "Contrassegna come cliente di test", markRejected: "Il contrassegno TEST_ONLY è stato rifiutato in sicurezza.", cleanupRejected: "Il tenant di test non è stato eliminato. Controlla la verifica preliminare e la conferma.", relationRejected: "L’associazione di test esterna non è stata rimossa. Controlla destinazione, verifica preliminare e conferma.",
};

const es = {
  title: "Tenant de prueba aislado", description: "Solo el contrato TEST_ONLY del servidor puede eliminar por completo los datos de prueba.",
  preflightPassed: "Comprobación previa superada. El tenant es apto para la limpieza controlada.", preflightBlocked: "Comprobación previa bloqueada",
  reason: "Motivo", reasonPlaceholder: "Motivo interno del marcado de prueba y la limpieza posterior", strongConfirmation: "Confirmación reforzada", required: "Obligatorio", recentAuthRequired: "Esta acción requiere un inicio de sesión en la plataforma durante los últimos 10 minutos.",
  mark: "Marcar como TEST_ONLY", cleanup: "Limpiar por completo el tenant de prueba", authorizedOnly: "Solo los Platform Admins autorizados pueden marcar o limpiar tenants de prueba.", cleaned: "El tenant de prueba aislado se ha limpiado por completo.",
  foreignTitle: "Asociación de prueba externa", foreignDescription: "Elimina únicamente la asociación accidental de este cliente con el tenant de prueba marcado.",
  narrowPreflightPassed: "Comprobación específica superada.", narrowPreflightBlocked: "Comprobación específica bloqueada",
  tenant: "Tenant de prueba", customer: "Cliente", authId: "ID de autenticación", accountId: "ID de cuenta", localMembershipId: "ID de membresía local",
  localPointTransactions: "Transacciones de puntos locales", localPointBalance: "Saldo de puntos local", localVisits: "Visitas/eventos locales", localRewards: "Recompensas/regalos locales", localRedemptions: "Canjes locales", localNotifications: "Notificaciones locales",
  foreignMemberships: "Membresías externas", foreignPointTransactions: "Transacciones de puntos externas", foreignDataChanged: "Se modificarán datos externos",
  relationConfirmation: "El motivo y la confirmación de la limpieza del tenant de prueba también se aplican a esta acción específica.", removeForeign: "Eliminar solo la asociación de prueba externa", authorizedRemoveOnly: "Solo los Platform Admins autorizados pueden eliminar esta asociación de prueba.", preflightUnavailable: "Comprobación específica no disponible",
  markCustomer: "Marcar como cliente de prueba", markRejected: "El marcado TEST_ONLY se rechazó de forma segura.", cleanupRejected: "El tenant de prueba no se eliminó. Comprueba la revisión previa y la confirmación.", relationRejected: "La asociación de prueba externa no se eliminó. Comprueba el destino, la revisión previa y la confirmación.",
};

const zh = {
  title: "隔离测试租户", description: "只有服务器端 TEST_ONLY 合约可以完整清理测试数据。",
  preflightPassed: "预检查通过。该租户适合受控清理。", preflightBlocked: "预检查已阻止",
  reason: "原因", reasonPlaceholder: "测试标记及后续清理的内部原因", strongConfirmation: "强化确认", required: "必填", recentAuthRequired: "此操作要求在最近 10 分钟内登录平台。",
  mark: "标记为 TEST_ONLY", cleanup: "完整清理测试租户", authorizedOnly: "只有获授权的 Platform Admin 才能标记或清理测试租户。", cleaned: "隔离测试租户已完整清理。",
  foreignTitle: "外部测试关联", foreignDescription: "仅移除此顾客与已标记测试租户之间的误关联。",
  narrowPreflightPassed: "范围预检查通过。", narrowPreflightBlocked: "范围预检查已阻止",
  tenant: "测试租户", customer: "顾客", authId: "身份验证 ID", accountId: "账户 ID", localMembershipId: "本地会员关系 ID",
  localPointTransactions: "本地积分交易", localPointBalance: "本地积分余额", localVisits: "本地访问/事件", localRewards: "本地奖励/礼物", localRedemptions: "本地兑换", localNotifications: "本地通知",
  foreignMemberships: "外部会员关系", foreignPointTransactions: "外部积分交易", foreignDataChanged: "将修改外部数据",
  relationConfirmation: "测试租户清理的原因和确认也适用于此范围受限的操作。", removeForeign: "仅移除外部测试关联", authorizedRemoveOnly: "只有获授权的 Platform Admin 才能移除此测试关联。", preflightUnavailable: "范围预检查不可用",
  markCustomer: "标记为测试顾客", markRejected: "TEST_ONLY 标记已被安全拒绝。", cleanupRejected: "测试租户未删除。请检查预检查和确认。", relationRejected: "外部测试关联未移除。请检查目标、预检查和确认。",
};

const ko = {
  title: "격리된 테스트 테넌트", description: "서버의 TEST_ONLY 계약만 테스트 데이터를 완전히 정리할 수 있습니다.",
  preflightPassed: "사전 점검을 통과했습니다. 이 테넌트는 통제된 정리 대상입니다.", preflightBlocked: "사전 점검 차단됨",
  reason: "사유", reasonPlaceholder: "테스트 표시 및 이후 정리를 위한 내부 사유", strongConfirmation: "강력 확인", required: "필수", recentAuthRequired: "이 작업을 수행하려면 최근 10분 이내에 플랫폼에 로그인해야 합니다.",
  mark: "TEST_ONLY로 표시", cleanup: "테스트 테넌트 완전 정리", authorizedOnly: "권한이 있는 Platform Admin만 테스트 테넌트를 표시하거나 정리할 수 있습니다.", cleaned: "격리된 테스트 테넌트가 완전히 정리되었습니다.",
  foreignTitle: "외부 테스트 연결", foreignDescription: "이 고객과 표시된 테스트 테넌트 사이의 잘못된 연결만 제거합니다.",
  narrowPreflightPassed: "범위 사전 점검을 통과했습니다.", narrowPreflightBlocked: "범위 사전 점검 차단됨",
  tenant: "테스트 테넌트", customer: "고객", authId: "인증 ID", accountId: "계정 ID", localMembershipId: "로컬 멤버십 ID",
  localPointTransactions: "로컬 포인트 거래", localPointBalance: "로컬 포인트 잔액", localVisits: "로컬 방문/이벤트", localRewards: "로컬 리워드/선물", localRedemptions: "로컬 사용", localNotifications: "로컬 알림",
  foreignMemberships: "외부 멤버십", foreignPointTransactions: "외부 포인트 거래", foreignDataChanged: "외부 데이터가 변경됨",
  relationConfirmation: "테스트 테넌트 정리의 사유와 확인은 이 제한된 작업에도 적용됩니다.", removeForeign: "외부 테스트 연결만 제거", authorizedRemoveOnly: "권한이 있는 Platform Admin만 이 테스트 연결을 제거할 수 있습니다.", preflightUnavailable: "범위 사전 점검을 사용할 수 없음",
  markCustomer: "테스트 고객으로 표시", markRejected: "TEST_ONLY 표시가 안전하게 거부되었습니다.", cleanupRejected: "테스트 테넌트가 삭제되지 않았습니다. 사전 점검과 확인을 확인하세요.", relationRejected: "외부 테스트 연결이 제거되지 않았습니다. 대상, 사전 점검 및 확인을 확인하세요.",
};

export const PLATFORM_TEST_TENANT_MESSAGES = Object.freeze(Object.fromEntries(
  Object.entries({ en, de, fr, it, es, zh, ko }).map(([language, values]) => [
    language,
    Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => [`platform.testTenant.${key}`, value]))),
  ]),
));
