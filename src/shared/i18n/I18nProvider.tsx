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
    const key = GENERATED_SOURCE_TO_KEY[normalizedSource] as string | undefined;
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
