import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Edit3, Gift, ImagePlus, Power, Save, Trash2 } from "lucide-react";
import {
  loadRewardOffers,
  saveRewardOffer,
  setRewardOfferActive,
  type RewardOffer,
} from "../../rewards/rewardService";
import { supabase } from "../../../shared/lib/supabase";
import { useTenant } from "../../tenant/TenantProvider";

type WelcomeGiftMode = "value_limit" | "fixed_product";

type GiftForm = {
  id: string;
  title: string;
  category: string;
  productPrice: string;
  mode: WelcomeGiftMode;
  fixedProductName: string;
  imageUrl: string | null;
  active: boolean;
};

const giftIcons: Record<string, string> = {
  Getränk: "🥤",
  Kaffee: "☕",
  Dessert: "🍰",
  Vorspeise: "🥗",
  Hauptspeise: "🍽️",
  Sushi: "🍣",
  Menü: "🍱",
  Belohnung: "🎁",
  "Eigene Überraschung": "🎁",
};

const giftAssets: Record<string, string> = {
  Getränk: "drink",
  Kaffee: "coffee",
  Dessert: "dessert",
  Vorspeise: "appetizer",
  Hauptspeise: "main",
  Sushi: "sushi",
  Menü: "menu",
  Belohnung: "custom",
  "Eigene Überraschung": "custom",
};

const giftCategoryOptions = [
  "Kaffee",
  "Getränk",
  "Dessert",
  "Vorspeise",
  "Menü",
  "Hauptspeise",
  "Sushi",
  "Eigene Überraschung",
];

function formatEuro(value: number | null | undefined) {
  if (!value) return "Noch nicht gesetzt";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function parseEuro(value: string) {
  const parsed = Number(value.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function priceInput(value: number | null) {
  return value ? String(value).replace(".", ",") : "";
}

function defaultGiftValue(category: string | null) {
  if (category === "Getränk" || category === "Kaffee") return 4;
  if (category === "Dessert" || category === "Vorspeise") return 6;
  if (category === "Hauptspeise") return 20;
  if (category === "Sushi") return 20;
  if (category === "Menü") return 16;
  return 15;
}

function starterRewardKeyForCategory(category: string) {
  if (category === "Kaffee") return "kaffee";
  if (category === "Getränk") return "getränk";
  if (category === "Dessert") return "dessert";
  if (category === "Vorspeise") return "vorspeise";
  if (category === "Hauptspeise") return "hauptspeise";
  if (category === "Sushi") return "sushi";
  if (category === "Menü") return "menü";
  return "eigene-belohnung";
}

function fileExtension(file: File) {
  const fromName = file.name.toLowerCase().split(".").pop();
  if (fromName && ["png", "jpg", "jpeg", "svg"].includes(fromName)) return fromName;
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function formFromGift(gift: RewardOffer): GiftForm {
  const category = gift.category === "Belohnung" || gift.category === "Eigene Belohnung"
    ? "Eigene Überraschung"
    : gift.category ?? "Eigene Überraschung";
  return {
    id: gift.id,
    title: gift.title,
    category,
    productPrice: priceInput(gift.product_price ?? defaultGiftValue(gift.category)),
    mode: gift.welcome_gift_mode,
    fixedProductName: gift.fixed_product_name ?? gift.available_products[0] ?? "",
    imageUrl: gift.image_url,
    active: gift.active,
  };
}

function standardGiftAsset(category: string | null | undefined, title: string) {
  const safeCategory = category || "Eigene Überraschung";
  return (
    <span className={`standard-asset reward-card-asset ${giftAssets[safeCategory] ?? "custom"}`} aria-label={`Standardbild ${title}`}>
      {giftIcons[safeCategory] ?? "🎁"}
    </span>
  );
}

export function WelcomeGiftsPage() {
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const editorRef = useRef<HTMLElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [gifts, setGifts] = useState<RewardOffer[]>([]);
  const [editing, setEditing] = useState<GiftForm | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorHighlighted, setEditorHighlighted] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;

    loadRewardOffers(restaurantId)
      .then((offers) => {
        if (!cancelled) {
          setGifts(offers.filter((offer) => offer.source === "reward" && offer.is_starter_reward));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Willkommensgeschenke konnten nicht geladen werden.", error);
          setStatus("Daten konnten gerade nicht geladen werden.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  function startEdit(gift: RewardOffer) {
    setEditing(formFromGift(gift));
    setPhotoFile(null);
    setStatus(null);
    setEditorHighlighted(true);
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus({ preventScroll: true });
    }, 0);
    window.setTimeout(() => setEditorHighlighted(false), 1200);
  }

  async function uploadPhoto(file: File) {
    if (!supabase || !restaurantId) return null;
    const path = `${restaurantId}/starter-rewards/reward-${Date.now()}.${fileExtension(file)}`;
    const { error } = await supabase.storage.from("restaurant-media").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("restaurant-media").getPublicUrl(path);
    return data.publicUrl;
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editing) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setStatus("Bitte wähle PNG, JPG, JPEG oder SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("Das Bild darf maximal 5 MB groß sein.");
      return;
    }

    if (editing.imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(editing.imageUrl);
    }
    setEditing({ ...editing, imageUrl: URL.createObjectURL(file) });
    setPhotoFile(file);
  }

  function removePhoto() {
    if (!editing) return;
    if (editing.imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(editing.imageUrl);
    }
    setEditing({ ...editing, imageUrl: null });
    setPhotoFile(null);
    setStatus("Das Standardbild wird nach dem Speichern verwendet.");
  }

  async function saveGift(event: FormEvent) {
    event.preventDefault();
    if (!editing || !restaurantId) return;

    const original = gifts.find((gift) => gift.id === editing.id);
    if (!original) return;

    setSaving(true);
    setStatus(null);

    try {
      const uploadedUrl = photoFile ? await uploadPhoto(photoFile) : null;
      const fixedProductName = editing.mode === "fixed_product" ? editing.fixedProductName.trim() : null;
      const valueLimit = Math.max(0, parseEuro(editing.productPrice));
      const category = editing.category.trim() || original.category || "Eigene Überraschung";
      const saved = await saveRewardOffer({
        ...original,
        title: editing.title.trim() || original.title,
        description: "Willkommensgeschenk für neue Gäste. Unabhängig von Punkteeinlösungen.",
        required_points: 0,
        required_stamps: 0,
        category,
        product_price: valueLimit || null,
        welcome_gift_mode: editing.mode,
        fixed_product_name: fixedProductName,
        image_url: uploadedUrl ?? (editing.imageUrl?.startsWith("blob:") ? original.image_url : editing.imageUrl),
        available_products: fixedProductName ? [fixedProductName] : [category],
        is_starter_reward: true,
        starter_reward_key: starterRewardKeyForCategory(category),
        starter_reward_order: original.starter_reward_order,
        active: editing.active,
      });

      setGifts((current) => current.map((gift) => (gift.id === saved.id ? saved : gift)));
      setEditing(null);
      setPhotoFile(null);
      setStatus("Willkommensgeschenk gespeichert.");
    } catch (error) {
      console.error("Willkommensgeschenk konnte nicht gespeichert werden.", error);
      setStatus("Willkommensgeschenk konnte gerade nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleGift(gift: RewardOffer) {
    try {
      const updated = await setRewardOfferActive(gift, !gift.active);
      setGifts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus(updated.active ? "Willkommensgeschenk aktiviert." : "Willkommensgeschenk deaktiviert.");
    } catch (error) {
      console.error("Willkommensgeschenk-Status konnte nicht geändert werden.", error);
      setStatus("Status konnte gerade nicht geändert werden.");
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Willkommensgeschenke</h1>
          <p className="muted">Diese Geschenke erhalten neue Gäste einmalig nach der Anmeldung.</p>
        </div>
      </header>

      <section className="card welcome-gift-info">
        <p>Willkommensgeschenke sind ein Dankeschön für neue Gäste.</p>
        <p>Sie werden nur einmalig vergeben.</p>
        <p>Sie sind unabhängig von Punkteeinlösungen.</p>
      </section>

      {editing ? (
        <section className={`card welcome-gift-editor${editorHighlighted ? " highlighted" : ""}`} ref={editorRef}>
          <h2>Willkommensgeschenk bearbeiten</h2>
          <form className="form" onSubmit={saveGift}>
            <div className="grid two">
              <label className="field" htmlFor="gift-title">
                <span>Name</span>
                <input
                  ref={titleInputRef}
                  className="input"
                  id="gift-title"
                  value={editing.title}
                  onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                />
              </label>
              <label className="field" htmlFor="gift-category">
                <span>Kategorie</span>
                <select
                  className="input"
                  id="gift-category"
                  value={editing.category}
                  onChange={(event) => {
                    const category = event.target.value;
                    setEditing({
                      ...editing,
                      category,
                      productPrice: editing.productPrice || priceInput(defaultGiftValue(category)),
                    });
                  }}
                >
                  {giftCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="gift-value">
                <span>Preisgrenze / Wert bis €</span>
                <input
                  className="input"
                  id="gift-value"
                  inputMode="decimal"
                  value={editing.productPrice}
                  onChange={(event) => setEditing({ ...editing, productPrice: event.target.value })}
                />
              </label>
            </div>

            <div className="gift-mode-grid">
              <button
                className={`gift-mode-card${editing.mode === "value_limit" ? " selected" : ""}`}
                onClick={() => setEditing({ ...editing, mode: "value_limit" })}
                type="button"
              >
                <strong>Wertgrenze</strong>
                <span>Gast wählt im Restaurant bis zur Grenze.</span>
              </button>
              <button
                className={`gift-mode-card${editing.mode === "fixed_product" ? " selected" : ""}`}
                onClick={() => setEditing({ ...editing, mode: "fixed_product" })}
                type="button"
              >
                <strong>Festes Produkt</strong>
                <span>Gast sieht genau dieses Produkt.</span>
              </button>
            </div>

            {editing.mode === "fixed_product" ? (
              <label className="field" htmlFor="fixed-product">
                <span>Produktname</span>
                <input
                  className="input"
                  id="fixed-product"
                  value={editing.fixedProductName}
                  onChange={(event) => setEditing({ ...editing, fixedProductName: event.target.value })}
                />
              </label>
            ) : null}

            <div className="reward-photo-row">
              <div className="reward-standard-image">
                {editing.imageUrl ? <img alt={editing.title} src={editing.imageUrl} /> : standardGiftAsset(editing.category, editing.title)}
              </div>
              <div>
                <input
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  className="visually-hidden"
                  id="welcome-gift-photo"
                  onChange={handlePhoto}
                  type="file"
                />
                <button
                  className="button secondary"
                  onClick={() => document.getElementById("welcome-gift-photo")?.click()}
                  type="button"
                >
                  <ImagePlus size={18} />
                  Echtes Foto hochladen
                </button>
                {editing.imageUrl ? (
                  <button className="button secondary" onClick={removePhoto} type="button">
                    <Trash2 size={18} />
                    Bild entfernen
                  </button>
                ) : null}
                <p className="muted">Du kannst das Standardbild behalten.</p>
              </div>
            </div>

            <label className="inline-check">
              <input
                checked={editing.active}
                onChange={(event) => setEditing({ ...editing, active: event.target.checked })}
                type="checkbox"
              />
              Aktiv
            </label>

            <div className="row-actions">
              <button className="button secondary" onClick={() => setEditing(null)} type="button">
                Zurück
              </button>
              <button className="button" disabled={saving} type="submit">
                <Save size={18} />
                Änderungen speichern
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="welcome-gift-grid">
        {gifts.map((gift) => (
          <article className={`card welcome-gift-card${gift.active ? "" : " inactive"}`} key={gift.id}>
            <div className="welcome-gift-image">
              {gift.image_url ? <img alt={gift.title} src={gift.image_url} /> : standardGiftAsset(gift.category, gift.title)}
            </div>
            <div>
              <strong>{gift.title}</strong>
              <p className="muted">Kategorie: {gift.category ?? "Eigene Überraschung"}</p>
              <p>{gift.welcome_gift_mode === "fixed_product" && gift.fixed_product_name
                ? gift.fixed_product_name
                : `bis ${formatEuro(gift.product_price ?? defaultGiftValue(gift.category))}`}</p>
              <p>{gift.active ? "🟢 Aktiv" : "⚪ Inaktiv"}</p>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => startEdit(gift)} type="button">
                <Edit3 size={16} />
                Bearbeiten
              </button>
              <button className="button secondary" onClick={() => toggleGift(gift)} type="button">
                <Power size={16} />
                {gift.active ? "Deaktivieren" : "Aktivieren"}
              </button>
            </div>
          </article>
        ))}
        {gifts.length === 0 ? (
          <article className="card empty-state-card">
            <Gift size={34} />
            <h2>Noch keine Willkommensgeschenke eingerichtet.</h2>
            <p className="muted">
              Willkommensgeschenke erhalten neue Gäste einmalig nach der Anmeldung. Du kannst sie hier später bearbeiten.
            </p>
          </article>
        ) : null}
      </section>

      {status ? <p className="status-message">{status}</p> : null}
    </>
  );
}
