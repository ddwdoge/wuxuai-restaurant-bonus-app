import { useEffect, useState } from "react";
import { countryNameForCode } from "../../shared/countries.mjs";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { loadRegistrationCountries, type LaunchCountry } from "./countryLaunchService";

export function LaunchCountrySelect({ id, value, onChange, disabled = false }: {
  id: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const { language, translateKey } = useI18n();
  const t = (key: string) => translateKey(`platform.country.${key}`);
  const [countries, setCountries] = useState<LaunchCountry[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void loadRegistrationCountries().then((data) => { if (active) setCountries(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <>
    <select className="input" id={id} required value={value} disabled={disabled || !countries.length}
      onChange={(event) => onChange(event.target.value)}>
      <option value="">{t("select")}</option>
      {countries.map((country) => <option key={country.code} value={country.code} disabled={!country.enabled}>
        {countryNameForCode(country.code, language)}{country.enabled ? "" : ` · ${t("blocked")}`}
      </option>)}
    </select>
    {failed ? <p role="alert">{t("unavailable")}</p> : null}
  </>;
}
