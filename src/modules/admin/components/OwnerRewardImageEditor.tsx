import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import { SmartMediaEditor } from "../../../shared/components/SmartMediaEditor";
import type { RewardImageCrop } from "../../../shared/rewardImageCrop";
import { validateOwnerRewardImage } from "../services/ownerRewardImageService";

type OwnerRewardImageEditorProps = {
  crop: RewardImageCrop;
  disabled?: boolean;
  imageUrl: string;
  label: string;
  onCropChange: (crop: RewardImageCrop) => void;
  onFileSelected: (file: File) => void;
};

export function OwnerRewardImageEditor({ crop, disabled = false, imageUrl, label, onCropChange, onFileSelected }: OwnerRewardImageEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateOwnerRewardImage(file);
    setError(validationError);
    if (!validationError) onFileSelected(file);
  }

  return (
    <section className="owner-reward-image-editor" aria-label={`Bildausschnitt für ${label}`}>
      <SmartMediaEditor disabled={disabled} imageUrl={imageUrl} label={label} onPresentationChange={onCropChange} presentation={crop} />
      <div className="owner-reward-image-editor-actions">
        <input accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileChange} ref={inputRef} type="file" />
        <button className="button secondary" disabled={disabled} onClick={() => inputRef.current?.click()} type="button"><ImagePlus size={18} />Anderes Foto wählen</button>
      </div>
      {error ? <p aria-live="polite" className="owner-reward-image-editor-error">{error}</p> : null}
    </section>
  );
}
