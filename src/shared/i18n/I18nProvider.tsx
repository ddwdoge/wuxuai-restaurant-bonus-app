import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { GENERATED_DYNAMIC_SOURCES, GENERATED_MESSAGES, GENERATED_SOURCE_TO_KEY } from "./messages.generated.mjs";
import { translateStructural } from "./catalog.mjs";
import {
  browserUiLanguage,
  readExplicitUiLanguage,
  writeExplicitUiLanguage,
  type UiLanguage,
} from "./language.mjs";
import { localeTag } from "./formatters.mjs";

type I18nContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  translateKey: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const originalText = new WeakMap<Text, string>();
const translatedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributeValues = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["aria-label", "aria-description", "alt", "description", "label", "placeholder", "title"];

const translationSourceAliases: Record<string, string> = {
  "Dein Gästekonto ist bestätigt. Jetzt fehlen nur noch die restaurantbezogenen Pflichtbestätigungen.": "Dein Kundenkonto ist bestätigt. Jetzt fehlen nur noch die restaurantbezogenen Pflichtbestätigungen.",
  "Dein Gästekonto wird geprüft.": "Dein Kundenkonto wird geprüft.",
  "Dein Gästeportal": "Dein Kundenbereich",
  "Dein Gästeportal ist gerade nicht verfügbar.": "Dein Kundenbereich ist gerade nicht verfügbar.",
  "Dein Gästeportal konnte gerade nicht geladen werden.": "Dein Kundenbereich konnte gerade nicht geladen werden.",
  "Dein Gästeportal wird geladen.": "Dein Kundenbereich wird geladen.",
  "Deine Anmeldung bleibt bestehen. Ergänze nur die Angaben für dein persönliches Gästekonto.": "Deine Anmeldung bleibt bestehen. Ergänze nur die Angaben für deinen persönlichen Kundenbereich.",
  "Deine Punkte und Belohnungen gelten ausschließlich für dieses Restaurant. Es wird kein zweites Gästekonto erstellt.": "Deine Punkte und Belohnungen gelten ausschließlich für dieses Restaurant. Es wird kein zweites Kundenkonto erstellt.",
  "Du hast bereits ein Gästekonto?": "Du hast bereits ein Kundenkonto?",
  "Gästekonto aktivieren": "Kundenbereich aktivieren",
  "Gästekonto erstellen": "Kundenkonto erstellen",
  "Gästekonto öffnen": "Kundenkonto öffnen",
  "Gästeportal": "Kundenbereich",
  "Inhaberbereich": "Restaurant-Portal",
  "Inhaberbereich öffnen": "Restaurant-Portal öffnen",
  "Inhaberbereich wird geöffnet …": "Restaurant Portal wird geöffnet …",
  "Inhaberbereich wird geladen...": "Restaurant Portal wird geladen...",
  "Melde dich mit deinem WUXUAI-Gästekonto an. Der gescannte Restaurantkontext bleibt dabei erhalten.": "Melde dich mit deinem WUXUAI-Kundenkonto an. Der gescannte Restaurantkontext bleibt dabei erhalten.",
  "Mitarbeiter öffnen den Mitarbeiterbereich und können Kunden-QRs scannen.": "Mitarbeiter öffnen den Staff-Bereich und können Kunden-QRs scannen.",
  "Mit bestehendem Gästekonto anmelden": "Mit bestehendem Kundenkonto anmelden",
  "Navigation im Inhaberbereich": "Navigation im Restaurant Portal",
  "Neues Gästekonto erstellen": "Neues Kundenkonto erstellen",
  "Noch kein Gästekonto?": "Noch kein Kundenkonto?",
  "Nur Inhaber und ausdrücklich berechtigte Restaurant-Administratoren dürfen Identitätsdaten korrigieren.": "Nur Owner und ausdrücklich berechtigte Restaurant-Administratoren dürfen Identitätsdaten korrigieren.",
  "Nur Inhaber und berechtigte Restaurant-Administratoren dürfen Teamzugänge verwalten.": "Nur Owner und berechtigte Restaurant-Administratoren dürfen Teamzugänge verwalten.",
  "Nur für Inhaber": "Nur für Owner",
  "Nur Inhaber und Administratoren dürfen Einlösungsberichte öffnen.": "Nur Restaurant-Owner und Administratoren dürfen Einlösungsberichte öffnen.",
  "Registrierung konnte nicht abgeschlossen werden. Prüfe, ob du bereits ein Gästekonto hast, oder fordere eine neue Bestätigungs-E-Mail an.": "Registrierung konnte nicht abgeschlossen werden. Prüfe, ob du bereits ein Kundenkonto hast, oder fordere eine neue Bestätigungs-E-Mail an.",
  "Restaurant-Dashboard": "Restaurant Portal",
  "Restaurant-Dashboard · Anmeldung erforderlich": "Restaurant Portal · Anmeldung erforderlich",
  "Dieses Konto besitzt keinen Zugang zum Gästeportal.": "Dieses Konto besitzt keinen Zugang zum Kundenbereich.",
  "Veröffentlichung, Vorlage, Dokument-Hash, Inhaber, Restaurant, Zeitpunkt und Request-ID werden protokolliert.": "Veröffentlichung, Vorlage, Dokument-Hash, Owner, Restaurant, Zeitpunkt und Request-ID werden protokolliert.",
  "Vom Inhaber geprüft": "Vom Owner geprüft",
};

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function preserveSpacing(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const dynamicSources = GENERATED_DYNAMIC_SOURCES.map(({ source, key, placeholders }) => {
  let pattern = escapeRegularExpression(source);
  for (const placeholder of placeholders) pattern = pattern.replace(escapeRegularExpression(placeholder), "(.+?)");
  return { key, placeholders, pattern: new RegExp(`^${pattern}$`, "u") };
});

function translateDocument(root: ParentNode, language: UiLanguage) {
  const messages = GENERATED_MESSAGES[language] as Record<string, string>;
  const translateSource = (source: string) => {
    const normalizedSource = normalized(source);
    const directKey = GENERATED_SOURCE_TO_KEY[normalizedSource] as string | undefined;
    const aliasedSource = language === "de" ? undefined : translationSourceAliases[normalizedSource];
    const key = directKey ?? (aliasedSource ? GENERATED_SOURCE_TO_KEY[aliasedSource] as string | undefined : undefined);
    if (key) return messages[key] ?? source;
    for (const dynamic of dynamicSources) {
      const match = normalizedSource.match(dynamic.pattern);
      if (!match) continue;
      let translated = messages[dynamic.key] ?? source;
      dynamic.placeholders.forEach((placeholder, index) => {
        translated = translated.replace(placeholder, match[index + 1] ?? "");
      });
      return translated;
    }
    return source;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (!node.parentElement?.closest("[data-i18n-skip='true']")) {
      const previousTranslation = translatedText.get(node);
      const source = !originalText.has(node) || (previousTranslation !== undefined && node.data !== previousTranslation)
        ? node.data
        : originalText.get(node)!;
      originalText.set(node, source);
      const next = preserveSpacing(source, translateSource(source));
      if (node.data !== next) node.data = next;
      translatedText.set(node, next);
    }
    node = walker.nextNode() as Text | null;
  }
  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    if (element.closest("[data-i18n-skip='true']")) continue;
    const originals = originalAttributes.get(element) ?? new Map<string, string>();
    const previousTranslations = translatedAttributeValues.get(element) ?? new Map<string, string>();
    for (const attribute of translatedAttributes) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      if (!originals.has(attribute) || (previousTranslations.has(attribute) && current !== previousTranslations.get(attribute))) originals.set(attribute, current);
      const next = translateSource(originals.get(attribute)!);
      element.setAttribute(attribute, next);
      previousTranslations.set(attribute, next);
    }
    originalAttributes.set(element, originals);
    translatedAttributeValues.set(element, previousTranslations);
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => browserUiLanguage(navigator, readExplicitUiLanguage()).language);

  useLayoutEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.uiLanguage = language;
    document.documentElement.dataset.uiLocale = localeTag(language);
    document.documentElement.classList.toggle("cjk", language === "zh" || language === "ko");
    const root = document.getElementById("root");
    if (!root) return undefined;
    translateDocument(root, language);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target.parentNode) translateDocument(record.target.parentNode, language);
        for (const added of record.addedNodes) if (added instanceof Element || added instanceof Text) translateDocument(added.parentNode ?? root, language);
      }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage(next) {
      writeExplicitUiLanguage(next);
      setLanguageState(next);
    },
    translateKey(key) {
      return (GENERATED_MESSAGES[language] as Record<string, string>)[key]
        ?? translateStructural(key, language);
    },
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("I18N_PROVIDER_MISSING");
  return context;
}
