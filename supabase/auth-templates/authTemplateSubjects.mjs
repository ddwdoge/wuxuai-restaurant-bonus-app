const SUBJECTS = Object.freeze({
  confirmation: Object.freeze({
    de: "E-Mail-Adresse bestätigen | WUXUAI® Bonus",
    en: "Confirm your email address | WUXUAI® Bonus",
    fr: "Confirmez votre adresse e-mail | WUXUAI® Bonus",
    it: "Conferma il tuo indirizzo e-mail | WUXUAI® Bonus",
    es: "Confirma tu correo electrónico | WUXUAI® Bonus",
    zh: "确认您的电子邮箱 | WUXUAI® Bonus",
    ko: "이메일 주소 확인 | WUXUAI® Bonus",
  }),
  recovery: Object.freeze({
    de: "Passwort zurücksetzen | WUXUAI® Bonus",
    en: "Reset your password | WUXUAI® Bonus",
    fr: "Réinitialisez votre mot de passe | WUXUAI® Bonus",
    it: "Reimposta la password | WUXUAI® Bonus",
    es: "Restablece tu contraseña | WUXUAI® Bonus",
    zh: "重置密码 | WUXUAI® Bonus",
    ko: "비밀번호 재설정 | WUXUAI® Bonus",
  }),
  invite: Object.freeze({
    de: "Einladung zum Mitarbeiterbereich | WUXUAI® Bonus",
    en: "Staff portal invitation | WUXUAI® Bonus",
    fr: "Invitation à l’espace équipe | WUXUAI® Bonus",
    it: "Invito all’area staff | WUXUAI® Bonus",
    es: "Invitación al área de personal | WUXUAI® Bonus",
    zh: "员工专区邀请 | WUXUAI® Bonus",
    ko: "직원 포털 초대 | WUXUAI® Bonus",
  }),
  magic_link: Object.freeze({
    de: "Mitarbeiterzugang fortsetzen | WUXUAI® Bonus",
    en: "Continue staff access | WUXUAI® Bonus",
    fr: "Continuer l’accès équipe | WUXUAI® Bonus",
    it: "Continua l’accesso staff | WUXUAI® Bonus",
    es: "Continuar el acceso de personal | WUXUAI® Bonus",
    zh: "继续员工访问 | WUXUAI® Bonus",
    ko: "직원 액세스 계속하기 | WUXUAI® Bonus",
  }),
});

export const supportedAuthEmailTemplates = Object.freeze(Object.keys(SUBJECTS));

export function authEmailSubject(template, language) {
  const messages = SUBJECTS[template];
  if (!messages) throw new Error("AUTH_EMAIL_TEMPLATE_NOT_SUPPORTED");
  const normalized = typeof language === "string" ? language.toLowerCase().split(/[-_]/)[0] : "";
  return messages[normalized] ?? messages.en;
}
