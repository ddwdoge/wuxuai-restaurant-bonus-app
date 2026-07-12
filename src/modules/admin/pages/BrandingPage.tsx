import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { supabase } from "../../../shared/lib/supabase";
import { useTenant } from "../../tenant/TenantProvider";

export function BrandingPage() {
  const { activeRestaurant, branding } = useTenant();
  const [form, setForm] = useState({
    logoUrl: branding?.logo_url ?? "",
    primaryColor: branding?.primary_color ?? "#0f766e",
    buttonColor: branding?.button_color ?? "#0f766e",
  });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      logoUrl: branding?.logo_url ?? "",
      primaryColor: branding?.primary_color ?? "#0f766e",
      buttonColor: branding?.button_color ?? "#0f766e",
    });
  }, [branding?.button_color, branding?.logo_url, branding?.primary_color]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!activeRestaurant?.id) return;

    setStatus(null);

    if (!supabase) {
      setStatus("Aussehen gespeichert.");
      return;
    }

    const { error } = await supabase.from("restaurant_branding").upsert(
      {
        restaurant_id: activeRestaurant.id,
        logo_url: form.logoUrl || null,
        primary_color: form.primaryColor,
        button_color: form.buttonColor,
        secondary_color: branding?.secondary_color ?? "#f4a261",
        font_family: branding?.font_family ?? "Inter",
      },
      { onConflict: "restaurant_id" },
    );

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Aussehen gespeichert.");
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Aussehen</h1>
          <p className="muted">Logo, Farben und Name für die Gäste-App.</p>
        </div>
      </header>
      <section className="card">
        <form className="form" onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="portal-name">Name in der Gäste-App</label>
            <input className="input" id="portal-name" defaultValue={`${activeRestaurant?.name} Club`} />
          </div>
          <div className="grid two">
            <div className="field">
              <label htmlFor="primary-color">Primärfarbe</label>
              <input
                className="input"
                id="primary-color"
                type="color"
                value={form.primaryColor}
                onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="button-color">Buttonfarbe</label>
              <input
                className="input"
                id="button-color"
                type="color"
                value={form.buttonColor}
                onChange={(event) => setForm((current) => ({ ...current, buttonColor: event.target.value }))}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="logo-url">Logo-Adresse</label>
            <input
              className="input"
              id="logo-url"
              value={form.logoUrl}
              onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
            />
          </div>
          <button className="button" type="submit">
            <Save size={18} />
            Aussehen speichern
          </button>
          {status ? <p className="status-message">{status}</p> : null}
        </form>
      </section>
    </>
  );
}
