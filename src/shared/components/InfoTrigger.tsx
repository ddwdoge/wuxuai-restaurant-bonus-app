import { Info } from "lucide-react";

type InfoTriggerProps = {
  className?: string;
  label: string;
  onClick: () => void;
};

export function InfoTrigger({ className = "", label, onClick }: InfoTriggerProps) {
  return (
    <button
      aria-label={label}
      className={`wux-info-trigger ${className}`.trim()}
      onClick={onClick}
      type="button"
    >
      <Info aria-hidden="true" size={20} />
    </button>
  );
}
