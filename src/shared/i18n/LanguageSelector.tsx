import { Languages } from "lucide-react";
import { useI18n } from "./I18nProvider";
import type { UiLanguage } from "./language.mjs";

const options: Array<{ value: UiLanguage; label: string }> = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "es", label: "Español" },
  { value: "zh", label: "简体中文" },
  { value: "ko", label: "한국어" },
];

const selectorLabels: Record<UiLanguage, string> = {
  de: "Sprache",
  en: "Language",
  fr: "Langue",
  it: "Lingua",
  es: "Idioma",
  zh: "语言",
  ko: "언어",
};

export function LanguageSelector() {
  const { language, setLanguage } = useI18n();
  return (
    <label className="wux-language-selector" data-i18n-skip="true">
      <Languages aria-hidden="true" size={18} />
      <span className="sr-only">{selectorLabels[language]}</span>
      <select aria-label={selectorLabels[language]} onChange={(event) => setLanguage(event.target.value as UiLanguage)} value={language}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
