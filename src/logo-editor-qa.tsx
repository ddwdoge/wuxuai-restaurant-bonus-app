import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrandingLogoEditor } from "./modules/admin/pages/SettingsPage";
import { defaultLogoPresentation, type LogoPresentation } from "./shared/logoPresentation.mjs";
import "./styles.css";

const qaLogoUrl = "https://bwhvfjuwixgwduoeqaya.supabase.co/storage/v1/object/public/restaurant-media/1dbd4d83-cd4f-441e-9d3f-71a34febfed2/branding/logo-1787855027560.png";

function LogoEditorQa() {
  const [open, setOpen] = useState(true);
  const [presentation, setPresentation] = useState<LogoPresentation>({
    ...defaultLogoPresentation,
    fitMode: "manual",
    scale: 1.25,
  });

  return (
    <main style={{ minHeight: "100dvh", padding: 32 }}>
      <button className="button" onClick={() => setOpen(true)} type="button">Logo-Editor öffnen</button>
      <BrandingLogoEditor
        adjustment={null}
        logoUrl={qaLogoUrl}
        name="Kaffee Konditorei bäckerei"
        onChange={setPresentation}
        onClose={() => setOpen(false)}
        onSave={() => undefined}
        open={open}
        presentation={presentation}
        primaryColor="#002040"
        saving={false}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LogoEditorQa />);
