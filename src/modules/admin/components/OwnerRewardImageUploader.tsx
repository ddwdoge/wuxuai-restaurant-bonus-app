import { useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { validateOwnerRewardImage } from "../services/ownerRewardImageService";

type OwnerRewardImageUploaderProps = {
  imageUrl?: string | null;
  previewUrl?: string | null;
  categoryIcon?: ReactNode;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onFileSelected: (file: File) => void;
  onRemove?: () => void;
};

export function OwnerRewardImageUploader({
  imageUrl,
  previewUrl,
  categoryIcon,
  label = "Belohnung",
  disabled = false,
  loading = false,
  error,
  onFileSelected,
  onRemove,
}: OwnerRewardImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const displayUrl = previewUrl ?? imageUrl ?? null;
  const interactionDisabled = disabled || loading;
  const actionLabel = displayUrl ? `Foto für ${label} ändern` : `Foto für ${label} hinzufügen`;

  function openFilePicker() {
    if (!interactionDisabled) fileInputRef.current?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const nextError = validateOwnerRewardImage(file);
    setValidationError(nextError);
    if (!nextError) onFileSelected(file);
  }

  const visibleError = validationError ?? error;

  return (
    <div className="owner-reward-image-uploader">
      <input
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <div
        aria-disabled={interactionDisabled}
        aria-label={actionLabel}
        className={`owner-reward-image-trigger${interactionDisabled ? " disabled" : ""}`}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={interactionDisabled ? -1 : 0}
      >
        {displayUrl ? (
          <img alt={`Foto ${label}`} src={displayUrl} />
        ) : (
          <span className="owner-reward-image-placeholder">
            {categoryIcon}
            <Camera aria-hidden="true" size={22} />
          </span>
        )}
        <span className="owner-reward-image-overlay">
          {loading ? <LoaderCircle aria-hidden="true" className="owner-reward-image-spinner" size={21} /> : <Camera aria-hidden="true" size={20} />}
          {loading ? "Foto wird hochgeladen" : displayUrl ? "Foto ändern" : "Foto hinzufügen"}
        </span>
      </div>
      {displayUrl && onRemove && !loading ? (
        <button aria-label={`Foto für ${label} entfernen`} className="owner-reward-image-remove" onClick={onRemove} title="Foto entfernen" type="button">
          <Trash2 aria-hidden="true" size={17} />
        </button>
      ) : null}
      <p aria-live="polite" className={`owner-reward-image-message${visibleError ? " error" : ""}`}>
        {visibleError ?? (displayUrl ? "Klicke auf das Foto, um es zu ändern." : "JPG, PNG oder WebP, maximal 5 MB.")}
      </p>
    </div>
  );
}
