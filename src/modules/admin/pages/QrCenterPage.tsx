import { useEffect, useState } from "react";
import { Download, FileText, QrCode } from "lucide-react";
import { OperationalQrCode } from "../../../shared/components/OperationalQrCode";
import { OPERATIONAL_QR_EXPORT } from "../../../shared/lib/operationalQr.mjs";
import { getPublicAppBaseUrl } from "../../../shared/lib/publicBaseUrl";
import type { PointsCollectionMode } from "../../../shared/types/domain";
import { loadPublicPointsCollectionMode } from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";
import { getQrCenterPurposes } from "../qrCenterFlow.mjs";
import { buildStaffLoginPath } from "../../auth/staffLoginFlow.mjs";

type QrPrintPage = {
  boostHint?: boolean;
  headline: string;
  note?: string;
  qrCanvas: HTMLCanvasElement;
  subheadline: string;
  usage: string;
};

type PdfPage = {
  imageBytes: Uint8Array;
  imageHeight: number;
  imageWidth: number;
  pageHeight: number;
  pageWidth: number;
};

const footerText = "Powered by WUXUAI Bonus";
const a6PageWidthPt = 297.64;
const a6PageHeightPt = 419.53;
const activePdfUrls = new Set<string>();
let pdfCleanupRegistered = false;

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function openPdfBlob(blob: Blob, fallbackFilename: string) {
  const url = URL.createObjectURL(blob);
  activePdfUrls.add(url);

  if (!pdfCleanupRegistered) {
    pdfCleanupRegistered = true;
    window.addEventListener("pagehide", () => {
      activePdfUrls.forEach((activeUrl) => URL.revokeObjectURL(activeUrl));
      activePdfUrls.clear();
      pdfCleanupRegistered = false;
    }, { once: true });
  }

  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!openedWindow) {
    triggerDownload(blob, fallbackFilename);
    URL.revokeObjectURL(url);
    activePdfUrls.delete(url);
    return;
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function colorWithAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(15, 118, 110, ${alpha})`;
  }
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function safeColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let nextY = y;

  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(" ");
    let line = "";

    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (context.measureText(testLine).width > maxWidth && line) {
        context.fillText(line, x, nextY);
        line = word;
        nextY += lineHeight;
        return;
      }
      line = testLine;
    });

    if (line) {
      context.fillText(line, x, nextY);
      nextY += lineHeight;
    }
  });
}

function buildPdf(pages: PdfPage[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  function write(value: string | Uint8Array) {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    byteLength += bytes.length;
  }

  function startObject(id: number) {
    offsets[id] = byteLength;
    write(`${id} 0 obj\n`);
  }

  const pageObjectIds = pages.map((_, index) => 3 + index * 3);
  const imageObjectIds = pages.map((_, index) => 4 + index * 3);
  const contentObjectIds = pages.map((_, index) => 5 + index * 3);
  const objectCount = 2 + pages.length * 3;

  write("%PDF-1.4\n");
  startObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2);
  write(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageObjectId = pageObjectIds[index];
    const imageObjectId = imageObjectIds[index];
    const contentObjectId = contentObjectIds[index];
    const imageName = `P${index + 1}`;
    const content = `q\n${page.pageWidth} 0 0 ${page.pageHeight} 0 0 cm\n/${imageName} Do\nQ`;

    startObject(pageObjectId);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /${imageName} ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`,
    );

    startObject(imageObjectId);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.length} >>\nstream\n`,
    );
    write(page.imageBytes);
    write("\nendstream\nendobj\n");

    startObject(contentObjectId);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefOffset = byteLength;
  write(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

async function qrSvgToCanvas(svgId: string, size = OPERATIONAL_QR_EXPORT.qrSize) {
  const svg = document.getElementById(svgId);
  if (!svg) {
    throw new Error("QR-Code konnte nicht gefunden werden.");
  }

  const markup = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR-Code konnte nicht als Bild vorbereitet werden."));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("QR-Code konnte nicht gezeichnet werden.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, size, size);
  URL.revokeObjectURL(url);
  return canvas;
}

async function loadCanvasImage(source: string | null) {
  if (!source) return null;

  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Logo konnte nicht geladen werden."));
    image.src = source;
  });

  return image;
}

function drawLogo(
  context: CanvasRenderingContext2D,
  options: {
    logoImage: HTMLImageElement | null;
    primaryColor: string;
    restaurantName: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
) {
  const { height, logoImage, primaryColor, restaurantName, width, x, y } = options;
  context.save();
  if (logoImage) {
    const ratio = Math.min(width / logoImage.width, height / logoImage.height);
    const imageWidth = logoImage.width * ratio;
    const imageHeight = logoImage.height * ratio;
    context.drawImage(logoImage, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
  } else {
    roundedRect(context, x + width * 0.18, y, width * 0.64, height, 30);
    context.fillStyle = primaryColor;
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "900 44px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText((restaurantName.trim().charAt(0) || "W").toUpperCase(), x + width / 2, y + height / 2);
  }
  context.restore();
}

function canvasToJpegBytes(canvas: HTMLCanvasElement) {
  return base64ToBytes(canvas.toDataURL("image/jpeg", 0.96).split(",")[1] ?? "");
}

function drawBonusBoostHint(
  context: CanvasRenderingContext2D,
  options: {
    accentColor: string;
    primaryColor: string;
    width: number;
    x: number;
    y: number;
  },
) {
  const { accentColor, primaryColor, width, x, y } = options;
  const cards = [
    { icon: "🔥", label: "Du bekommst", value: "2× Punkte" },
    { icon: "👥", label: "Dein Freund bekommt", value: "2× Punkte" },
    { icon: "📅", label: "30 Tage", value: "Bonus Boost" },
  ];
  const gap = 12;
  const cardWidth = (width - gap * 2) / 3;

  context.save();
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = primaryColor;
  context.font = "900 32px Inter, Arial, sans-serif";
  context.fillText("Freunde einladen lohnt sich", x + width / 2, y);

  cards.forEach((card, index) => {
    const cardX = x + index * (cardWidth + gap);
    const cardY = y + 50;
    roundedRect(context, cardX, cardY, cardWidth, 118, 22);
    context.fillStyle = colorWithAlpha(index === 2 ? accentColor : primaryColor, 0.08);
    context.fill();
    context.strokeStyle = colorWithAlpha(index === 2 ? accentColor : primaryColor, 0.25);
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = "#17202a";
    context.font = "900 27px Inter, Arial, sans-serif";
    context.fillText(card.icon, cardX + cardWidth / 2, cardY + 12);
    context.fillStyle = "#465463";
    context.font = "800 15px Inter, Arial, sans-serif";
    drawWrappedText(context, card.label, cardX + cardWidth / 2, cardY + 48, cardWidth - 18, 19);
    context.fillStyle = primaryColor;
    context.font = "900 18px Inter, Arial, sans-serif";
    drawWrappedText(context, card.value, cardX + cardWidth / 2, cardY + 84, cardWidth - 18, 20);
  });

  context.fillStyle = "#66717d";
  context.font = "800 20px Inter, Arial, sans-serif";
  context.fillText("Aktiv nach dem ersten Besuch deines Freundes.", x + width / 2, y + 186);
  context.restore();
}

function drawQrPrintPage(
  page: QrPrintPage,
  branding: {
    accentColor: string;
    logoImage: HTMLImageElement | null;
    primaryColor: string;
    restaurantName: string;
  },
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1748;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Druckvorlage konnte nicht gezeichnet werden.");
  }

  const margin = 72;
  const contentWidth = canvas.width - margin * 2;
  const qrSize = 630;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 612;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = branding.primaryColor;
  context.fillRect(0, 0, canvas.width, 22);

  drawLogo(context, {
    height: 150,
    logoImage: branding.logoImage,
    primaryColor: branding.primaryColor,
    restaurantName: branding.restaurantName,
    width: 420,
    x: (canvas.width - 420) / 2,
    y: 66,
  });

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "#17202a";
  context.font = "900 42px Inter, Arial, sans-serif";
  drawWrappedText(context, branding.restaurantName || "Dein Restaurant", canvas.width / 2, 230, contentWidth, 48);

  context.fillStyle = branding.primaryColor;
  context.font = "900 24px Inter, Arial, sans-serif";
  context.fillText("Bonus für Gäste", canvas.width / 2, 284);

  context.fillStyle = "#17202a";
  context.font = "900 72px Inter, Arial, sans-serif";
  drawWrappedText(context, page.headline, canvas.width / 2, 345, contentWidth, 80);

  context.fillStyle = "#465463";
  context.font = "800 31px Inter, Arial, sans-serif";
  drawWrappedText(context, page.subheadline, canvas.width / 2, 448, contentWidth - 70, 38);

  roundedRect(context, qrX - 28, qrY - 28, qrSize + 56, qrSize + 56, 34);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = branding.accentColor;
  context.lineWidth = 6;
  context.stroke();
  context.imageSmoothingEnabled = false;
  context.drawImage(page.qrCanvas, qrX, qrY, qrSize, qrSize);

  context.fillStyle = branding.primaryColor;
  context.font = "900 34px Inter, Arial, sans-serif";
  context.fillText(page.usage, canvas.width / 2, 1262);

  if (page.note) {
    context.fillStyle = "#344251";
    context.font = "800 25px Inter, Arial, sans-serif";
    drawWrappedText(context, page.note, canvas.width / 2, 1310, contentWidth - 80, 33);
  }

  if (page.boostHint) {
    drawBonusBoostHint(context, {
      accentColor: branding.accentColor,
      primaryColor: branding.primaryColor,
      width: contentWidth,
      x: margin,
      y: 1400,
    });
  }

  context.fillStyle = "#8a96a3";
  context.font = "700 17px Inter, Arial, sans-serif";
  context.textBaseline = "alphabetic";
  context.fillText(footerText, canvas.width / 2, canvas.height - 28);

  return {
    imageBytes: canvasToJpegBytes(canvas),
    imageHeight: canvas.height,
    imageWidth: canvas.width,
    pageHeight: a6PageHeightPt,
    pageWidth: a6PageWidthPt,
  };
}

async function buildQrCenterStarterKitPdf(input: {
  bonusQrId?: string;
  includeCustomerCollectCompatibility: boolean;
  logoUrl: string | null;
  primaryColor: string;
  restaurantName: string;
  restaurantQrId: string;
  secondaryColor: string;
  staffQrId: string;
}) {
  const [restaurantQr, bonusQr, staffQr, loadedLogoImage] = await Promise.all([
    qrSvgToCanvas(input.restaurantQrId),
    input.includeCustomerCollectCompatibility && input.bonusQrId
      ? qrSvgToCanvas(input.bonusQrId)
      : Promise.resolve(null),
    qrSvgToCanvas(input.staffQrId),
    loadCanvasImage(input.logoUrl).catch(() => null),
  ]);
  const branding = {
    accentColor: safeColor(input.secondaryColor, "#f4a261"),
    logoImage: loadedLogoImage,
    primaryColor: safeColor(input.primaryColor, "#0f766e"),
    restaurantName: input.restaurantName || "Dein Restaurant",
  };
  const pageSpecs: QrPrintPage[] = [
    {
      boostHint: true,
      headline: "Neu hier?",
      qrCanvas: restaurantQr,
      subheadline: "Scanne den QR-Code und sichere dir dein Willkommensgeschenk.",
      usage: "Für den Eingang",
    },
    {
      boostHint: true,
      headline: "Bonusprogramm entdecken",
      qrCanvas: restaurantQr,
      subheadline: "Scanne den QR-Code und werde Gast in unserem Bonusprogramm.",
      usage: "Für Tisch oder Flyer",
    },
    {
      headline: "Mitarbeiterbereich",
      note: "Nicht für Gäste bestimmt.",
      qrCanvas: staffQr,
      subheadline: "Für Tages-PIN, Gästeprüfung und Restaurant-Service.",
      usage: "Für dein Team",
    },
  ];

  if (input.includeCustomerCollectCompatibility && bonusQr) {
    pageSpecs.splice(2, 0, {
      boostHint: true,
      headline: "Punkte sammeln",
      note: "Bitte Mitarbeiter um die Tages-PIN.",
      qrCanvas: bonusQr,
      subheadline: "Nach dem Bezahlen scannen und Bonuspunkte sichern.",
      usage: "Für bestehende Sammelwege",
    });
  }

  try {
    return buildPdf(pageSpecs.map((page) => drawQrPrintPage(page, branding)));
  } catch (error) {
    if (!branding.logoImage) {
      throw error;
    }
    return buildPdf(pageSpecs.map((page) => drawQrPrintPage(page, { ...branding, logoImage: null })));
  }
}

function downloadQrPng(svgId: string, filename: string) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  const serializedSvg = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = OPERATIONAL_QR_EXPORT.canvasSize;
    canvas.height = OPERATIONAL_QR_EXPORT.canvasSize;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      OPERATIONAL_QR_EXPORT.inset,
      OPERATIONAL_QR_EXPORT.inset,
      OPERATIONAL_QR_EXPORT.qrSize,
      OPERATIONAL_QR_EXPORT.qrSize,
    );
    URL.revokeObjectURL(url);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
  };

  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}

export function QrCenterPage() {
  const { activeRestaurant, branding } = useTenant();
  const [downloadError, setDownloadError] = useState("");
  const [starterKitLoading, setStarterKitLoading] = useState(false);
  const [pointsCollectionMode, setPointsCollectionMode] = useState<PointsCollectionMode | null>(null);
  const restaurantSlug = activeRestaurant?.slug ?? "";
  const restaurantName = activeRestaurant?.name ?? "Restaurant";
  const publicBaseUrl = getPublicAppBaseUrl();
  const restaurantQrUrl = restaurantSlug ? `${publicBaseUrl}/customer/${restaurantSlug}` : publicBaseUrl;
  const bonusQrUrl = restaurantSlug ? `${publicBaseUrl}/w/${restaurantSlug}` : publicBaseUrl;
  const staffTabletUrl = restaurantSlug ? `${publicBaseUrl}${buildStaffLoginPath(restaurantSlug)}` : publicBaseUrl;
  const primaryColor = safeColor(branding?.primary_color, "#0f766e");
  const secondaryColor = safeColor(branding?.secondary_color, "#f4a261");
  const qrPurposes = pointsCollectionMode ? getQrCenterPurposes(pointsCollectionMode) : [];
  const showCustomerCollectCompatibility = qrPurposes.includes("customer_collect_compatibility");

  useEffect(() => {
    let cancelled = false;
    setPointsCollectionMode(null);
    if (!restaurantSlug) return () => {
      cancelled = true;
    };

    loadPublicPointsCollectionMode(restaurantSlug)
      .then((mode) => {
        if (!cancelled) setPointsCollectionMode(mode);
      })
      .catch(() => {
        if (!cancelled) setPointsCollectionMode("customer_initiated_only");
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug]);

  async function downloadStarterKit() {
    setDownloadError("");
    setStarterKitLoading(true);
    try {
      const pdf = await buildQrCenterStarterKitPdf({
        bonusQrId: showCustomerCollectCompatibility ? "qr-bonus" : undefined,
        includeCustomerCollectCompatibility: showCustomerCollectCompatibility,
        logoUrl: branding?.logo_url ?? null,
        primaryColor,
        restaurantName,
        restaurantQrId: "qr-restaurant",
        secondaryColor,
        staffQrId: "qr-staff",
      });
      openPdfBlob(pdf, "restaurant-starter-kit-a6.pdf");
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Restaurant Starter Kit konnte nicht erstellt werden.");
    } finally {
      setStarterKitLoading(false);
    }
  }

  const renderQrBrandBlock = () => (
    <div className="restaurant-brand-header qr-preview-brand">
      <span className="restaurant-logo-frame">
        {branding?.logo_url ? (
          <img alt={`${restaurantName} Logo`} className="restaurant-logo-image" src={branding.logo_url} />
        ) : (
          <span className="restaurant-logo-placeholder">{(restaurantName.trim().charAt(0) || "R").toUpperCase()}</span>
        )}
      </span>
      <div className="restaurant-brand-copy">
        <span className="restaurant-brand-title">{restaurantName}</span>
        <span className="restaurant-brand-subtitle">Bonus für Gäste</span>
      </div>
    </div>
  );

  return (
    <>
      <header className="page-header">
        <div>
          <h1>QR Center</h1>
          <p className="muted">Druckmaterial für neue Gäste und den geschützten Mitarbeiterbereich.</p>
        </div>
      </header>

      <section className="card qr-starter-card qr-center-starter-card">
        <div>
          <h2>Restaurant Starter Kit</h2>
          <p className="muted">
            {showCustomerCollectCompatibility
              ? "Vier A6-Druckseiten: zwei Gästeformate, bestehender Sammelweg und Mitarbeiterbereich."
              : "Drei A6-Druckseiten: zwei Gästeformate und Mitarbeiterbereich."}
          </p>
        </div>
        <button className="button" disabled={starterKitLoading || !pointsCollectionMode} onClick={downloadStarterKit} type="button">
          <FileText size={18} />
          {starterKitLoading
            ? "Starter Kit wird erstellt..."
            : pointsCollectionMode
              ? "Starter Kit als PDF öffnen"
              : "QR-Daten werden geladen..."}
        </button>
        {downloadError ? <p className="form-error">{downloadError}</p> : null}
      </section>

      <section className="grid two qr-center-grid">
        <article className="card qr-box-large">
          {renderQrBrandBlock()}
          <h2>Neue Gäste QR</h2>
          <p className="muted">Für Eingang, Tischaufsteller, Kassa, Rechnung, Flyer oder Werbung.</p>
          <OperationalQrCode id="qr-restaurant" title="QR-Code für neue Gäste" value={restaurantQrUrl} />
          <p className="muted">Neue Gäste werden Mitglied und erhalten ihr Willkommensgeschenk.</p>
          <div className="qr-card-actions">
            <a className="button secondary" href={restaurantQrUrl}>
              <QrCode size={18} />
              Neue Gäste QR öffnen
            </a>
            <button className="button ghost" onClick={() => downloadQrPng("qr-restaurant", "neue-gaeste-qr.png")} type="button">
              <Download size={18} />
              QR herunterladen
            </button>
          </div>
        </article>

        <article className="card qr-box-large">
          {renderQrBrandBlock()}
          <h2>Mitarbeiter QR</h2>
          <p className="muted">Nur für dein Team.</p>
          <OperationalQrCode id="qr-staff" title="QR-Code für den Mitarbeiterbereich" value={staffTabletUrl} />
          <p className="muted">Mitarbeiter öffnen den Staff-Bereich und können Kunden-QRs scannen.</p>
          <div className="qr-card-actions">
            <a className="button secondary" href={staffTabletUrl}>
              <QrCode size={18} />
              Mitarbeiter QR öffnen
            </a>
            <button className="button ghost" onClick={() => downloadQrPng("qr-staff", "mitarbeiter-qr.png")} type="button">
              <Download size={18} />
              QR herunterladen
            </button>
          </div>
        </article>
      </section>

      {showCustomerCollectCompatibility ? (
        <section className="qr-compatibility-section" aria-labelledby="qr-compatibility-title">
          <div>
            <h2 id="qr-compatibility-title">Bestehender Sammelweg</h2>
            <p className="muted">Nur sichtbar, weil dein Restaurant den kundeninitiierten Sammelweg verwendet.</p>
          </div>
          <article className="card qr-box-large">
            {renderQrBrandBlock()}
            <h3>Kassa QR</h3>
            <p className="muted">Für Bonuspunkte nach dem Bezahlen.</p>
            <OperationalQrCode id="qr-bonus" title="QR-Code für den bestehenden Sammelweg" value={bonusQrUrl} />
            <p className="muted">Bestandsgäste scannen und fragen nach der Tages-PIN.</p>
            <button className="button secondary" onClick={() => downloadQrPng("qr-bonus", "kassa-qr.png")} type="button">
              <Download size={18} />
              Kassa QR herunterladen
            </button>
          </article>
        </section>
      ) : null}
    </>
  );
}
