import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { getPublicAppBaseUrl } from "../../../shared/lib/publicBaseUrl";
import { restaurantTargetFromQrValue } from "../customerRestaurantQr.mjs";

type CustomerRestaurantScannerProps = {
  onCancel: () => void;
  onRestaurantDetected: (restaurantSlug: string, targetPath: string) => void;
  open: boolean;
};

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Der Kamerazugriff wurde nicht erlaubt. Du kannst die Berechtigung in Safari freigeben und erneut scannen.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Auf diesem Gerät wurde keine passende Kamera gefunden.";
  }
  return "Die Kamera konnte gerade nicht geöffnet werden. Bitte versuche es erneut.";
}

export function CustomerRestaurantScanner({ onCancel, onRestaurantDetected, open }: CustomerRestaurantScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handlingResultRef = useRef(false);
  const onRestaurantDetectedRef = useRef(onRestaurantDetected);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowedOrigins = useMemo(() => {
    const origins = new Set<string>([window.location.origin]);
    try {
      origins.add(new URL(getPublicAppBaseUrl()).origin);
    } catch {
      // The current origin remains the safe fallback.
    }
    return Array.from(origins);
  }, []);

  useEffect(() => {
    onRestaurantDetectedRef.current = onRestaurantDetected;
  }, [onRestaurantDetected]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    handlingResultRef.current = false;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startScanner = useCallback(async () => {
    stopScanner();
    setStarting(true);
    setError(null);
    setStatus("Kamera wird geöffnet …");

    if (!navigator.mediaDevices?.getUserMedia) {
      setStarting(false);
      setStatus(null);
      setError("Dieser Browser unterstützt keinen Kamera-Zugriff. Bitte öffne den Restaurant-QR mit der Kamera-App.");
      return;
    }

    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (!videoRef.current) return;
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _decodeError, scannerControls) => {
          if (!result || handlingResultRef.current) return;
          handlingResultRef.current = true;
          scannerControls.stop();
          controlsRef.current = null;

          const target = restaurantTargetFromQrValue(result.getText(), allowedOrigins);
          if (!target) {
            setStarting(false);
            setStatus(null);
            setError("Dieser QR-Code konnte keinem Restaurant zugeordnet werden.");
            return;
          }

          setStatus("Restaurant erkannt. Bonusprogramm wird geöffnet …");
          onRestaurantDetectedRef.current(target.restaurantSlug, target.targetPath);
        },
      );
      if (handlingResultRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setStarting(false);
      setStatus("Restaurant-QR vor die Kamera halten.");
    } catch (scannerError) {
      stopScanner();
      setStarting(false);
      setStatus(null);
      setError(cameraErrorMessage(scannerError));
    }
  }, [allowedOrigins, stopScanner]);

  useEffect(() => {
    if (!open) return undefined;
    void startScanner();
    return stopScanner;
  }, [open, startScanner, stopScanner]);

  return (
    <AppDrawer
      description="Scanne den QR-Code des Restaurants, in dem du gerade bist."
      dismissOnOverlay={false}
      footer={(
        <button className="button secondary customer-restaurant-scanner-cancel" onClick={onCancel} type="button">
          Abbrechen
        </button>
      )}
      onClose={onCancel}
      open={open}
      size="large"
      title="Restaurant wechseln"
    >
      <section className="customer-restaurant-scanner" aria-live="polite">
        <div className="customer-restaurant-scanner-frame">
          <video aria-label="Kamera-Vorschau für Restaurant-QR" autoPlay muted playsInline ref={videoRef} />
          <span aria-hidden="true" className="customer-restaurant-scanner-reticle"><ScanLine size={46} /></span>
          {starting ? <span className="customer-restaurant-scanner-loading"><Camera aria-hidden="true" size={20} />Kamera wird geöffnet …</span> : null}
        </div>
        {status ? <p className="customer-restaurant-scanner-status" role="status">{status}</p> : null}
        {error ? (
          <div className="customer-restaurant-scanner-error" role="alert">
            <p>{error}</p>
            <button aria-label="Anderes Restaurant erneut scannen" onClick={() => void startScanner()} type="button">
              <RefreshCw aria-hidden="true" size={18} />
              Erneut scannen
            </button>
          </div>
        ) : null}
        <p className="customer-restaurant-scanner-security"><ShieldCheck aria-hidden="true" size={17} />Nur der neu gescannte Restaurant-QR wird verwendet.</p>
      </section>
    </AppDrawer>
  );
}
