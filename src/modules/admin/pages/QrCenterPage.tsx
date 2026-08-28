import { useEffect, useState, type CSSProperties } from "react";
import { Download, FileText, QrCode } from "lucide-react";
import { OperationalQrCode } from "../../../shared/components/OperationalQrCode";
import { RestaurantBrandIdentity } from "../../../shared/components/RestaurantBrandIdentity";
import { OPERATIONAL_QR_EXPORT } from "../../../shared/lib/operationalQr.mjs";
import { getPublicAppBaseUrl } from "../../../shared/lib/publicBaseUrl";
import { buildStarterKitFilename } from "../../../shared/lib/starterKitFilename.mjs";
import {
  getStarterKitPageDefinitions,
  getStarterKitPageLayout,
  starterKitSingleLineFontSize,
  STARTER_KIT_FOOTER,
  STARTER_KIT_LAYOUT,
  STARTER_KIT_REFERRAL,
  type StarterKitPageDefinition,
  type StarterKitQrKind,
} from "../../../shared/lib/starterKitPages.mjs";
import { logoCanvasPlacement, type LogoPresentation } from "../../../shared/logoPresentation.mjs";
import type { PointsCollectionMode } from "../../../shared/types/domain";
import { loadPublicPointsCollectionMode } from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";
import { getQrCenterPurposes } from "../qrCenterFlow.mjs";
import { buildStaffLoginPath } from "../../auth/staffLoginFlow.mjs";

type QrPrintPage = StarterKitPageDefinition & {
  qrCanvas: HTMLCanvasElement;
};

type PdfPage = {
  imageBytes: Uint8Array;
  imageHeight: number;
  imageWidth: number;
  pageHeight: number;
  pageWidth: number;
};

const a6PageWidthPt = 297.64;
const a6PageHeightPt = 419.53;

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
  maxLines = Number.POSITIVE_INFINITY,
) {
  const lines: string[] = [];
  let nextY = y;

  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(" ");
    let line = "";

    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (context.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
        return;
      }
      line = testLine;
    });

    if (line) {
      lines.push(line);
    }
  });

  lines.slice(0, maxLines).forEach((line, index) => {
    const isTruncated = index === maxLines - 1 && lines.length > maxLines;
    context.fillText(isTruncated ? `${line.replace(/[.,;:!?]?$/, "")}…` : line, x, nextY);
    nextY += lineHeight;
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
    presentation?: Partial<LogoPresentation> | null;
    restaurantName: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
) {
  const { height, logoImage, presentation, primaryColor, restaurantName, width, x, y } = options;
  context.save();
  if (logoImage) {
    const placement = logoCanvasPlacement(
      logoImage.naturalWidth || logoImage.width,
      logoImage.naturalHeight || logoImage.height,
      { height, width, x: 0, y: 0 },
      presentation ?? {},
    );
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.drawImage(logoImage, x + placement.x, y + placement.y, placement.width, placement.height);
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
    presentation?: Partial<LogoPresentation> | null;
    width: number;
    x: number;
    y: number;
  },
) {
  const { accentColor, primaryColor, width, x, y } = options;

  context.save();
  const cellGap = 32;
  const cellInset = 32;
  const cellWidth = (width - cellInset * 2 - cellGap) / 2;
  const cellY = y + 72;

  roundedRect(context, x, y, width, 260, 28);
  context.fillStyle = colorWithAlpha(accentColor, 0.12);
  context.fill();
  context.strokeStyle = colorWithAlpha(accentColor, 0.42);
  context.lineWidth = 3;
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = primaryColor;
  context.font = "700 33px Inter, Arial, sans-serif";
  context.fillText(STARTER_KIT_REFERRAL.title, x + width / 2, y + 22);

  STARTER_KIT_REFERRAL.benefits.forEach((benefit, index) => {
    const cellX = x + cellInset + index * (cellWidth + cellGap);
    roundedRect(context, cellX, cellY, cellWidth, 126, 20);
    context.fillStyle = "rgba(255, 255, 255, 0.78)";
    context.fill();
    context.strokeStyle = colorWithAlpha(accentColor, 0.32);
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#17202a";
    context.font = "400 34px Apple Color Emoji, Segoe UI Emoji, sans-serif";
    context.fillText(benefit.icon, cellX + cellWidth / 2, cellY + 8);
    context.font = "600 24px Inter, Arial, sans-serif";
    context.fillText(benefit.label, cellX + cellWidth / 2, cellY + 52);
    context.fillStyle = primaryColor;
    context.font = "800 34px Inter, Arial, sans-serif";
    context.fillText(benefit.value, cellX + cellWidth / 2, cellY + 84);
  });

  context.fillStyle = "#465463";
  context.font = "400 23px Inter, Arial, sans-serif";
  context.fillText(
    STARTER_KIT_REFERRAL.note,
    x + width / 2,
    y + 222,
  );
  context.restore();
}

function drawQrPrintPage(
  page: QrPrintPage,
  branding: {
    accentColor: string;
    logoImage: HTMLImageElement | null;
    primaryColor: string;
    presentation?: Partial<LogoPresentation> | null;
    restaurantName: string;
  },
) {
  const canvas = document.createElement("canvas");
  canvas.width = STARTER_KIT_LAYOUT.canvas.width;
  canvas.height = STARTER_KIT_LAYOUT.canvas.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Druckvorlage konnte nicht gezeichnet werden.");
  }

  const margin = STARTER_KIT_LAYOUT.contentMargin;
  const contentWidth = canvas.width - margin * 2;
  const pageLayout = getStarterKitPageLayout(page);
  const { size: qrSize, x: qrX, y: qrY } = pageLayout.qr;
  const restaurantNameFontSize = starterKitSingleLineFontSize(branding.restaurantName, {
    fontSize: STARTER_KIT_LAYOUT.restaurantName.fontSize,
    maxWidth: contentWidth - 40,
    minFontSize: STARTER_KIT_LAYOUT.restaurantName.minFontSize,
  });
  const headlineFontSize = starterKitSingleLineFontSize(page.headline, {
    fontSize: pageLayout.headline.fontSize,
    maxWidth: contentWidth,
    minFontSize: pageLayout.headline.minFontSize,
  });
  const descriptionFontSize = starterKitSingleLineFontSize(page.subheadline, {
    fontSize: pageLayout.description.fontSize,
    maxWidth: (contentWidth - 90) * pageLayout.description.maxLines,
    minFontSize: pageLayout.description.minFontSize,
  });

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawLogo(context, {
    height: STARTER_KIT_LAYOUT.logo.height,
    logoImage: branding.logoImage,
    primaryColor: branding.primaryColor,
    presentation: branding.presentation,
    restaurantName: branding.restaurantName,
    width: STARTER_KIT_LAYOUT.logo.width,
    x: STARTER_KIT_LAYOUT.logo.x,
    y: STARTER_KIT_LAYOUT.logo.y,
  });

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "#17202a";
  context.font = `600 ${restaurantNameFontSize}px Inter, Arial, sans-serif`;
  drawWrappedText(context, branding.restaurantName || "Dein Restaurant", canvas.width / 2, STARTER_KIT_LAYOUT.restaurantName.y, contentWidth - 40, STARTER_KIT_LAYOUT.restaurantName.lineHeight);

  if (page.audienceLabel) {
    context.fillStyle = branding.primaryColor;
    context.font = `600 ${STARTER_KIT_LAYOUT.audience.fontSize}px Inter, Arial, sans-serif`;
    context.fillText(page.audienceLabel, canvas.width / 2, STARTER_KIT_LAYOUT.audience.y);
  }

  context.fillStyle = "#17202a";
  context.font = `800 ${headlineFontSize}px Inter, Arial, sans-serif`;
  drawWrappedText(context, page.headline, canvas.width / 2, pageLayout.headline.y, contentWidth, pageLayout.headline.lineHeight, pageLayout.headline.maxLines);

  context.fillStyle = "#465463";
  context.font = `400 ${descriptionFontSize}px Inter, Arial, sans-serif`;
  drawWrappedText(context, page.subheadline, canvas.width / 2, pageLayout.description.y, contentWidth - 90, pageLayout.description.lineHeight, pageLayout.description.maxLines);

  roundedRect(context, qrX - pageLayout.qr.frameInset, qrY - pageLayout.qr.frameInset, qrSize + pageLayout.qr.frameInset * 2, qrSize + pageLayout.qr.frameInset * 2, pageLayout.qr.frameRadius);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = colorWithAlpha(branding.accentColor, 0.46);
  context.lineWidth = 3;
  context.stroke();
  context.imageSmoothingEnabled = false;
  context.drawImage(page.qrCanvas, qrX, qrY, qrSize, qrSize);

  if (page.secondaryNote) {
    context.fillStyle = "#344251";
    context.font = `400 ${STARTER_KIT_LAYOUT.secondaryNote.fontSize}px Inter, Arial, sans-serif`;
    drawWrappedText(context, page.secondaryNote, canvas.width / 2, STARTER_KIT_LAYOUT.secondaryNote.y, contentWidth - 80, STARTER_KIT_LAYOUT.secondaryNote.lineHeight);
  }

  if (page.referralHint) {
    drawBonusBoostHint(context, {
      accentColor: branding.accentColor,
      primaryColor: branding.primaryColor,
      width: contentWidth,
      x: margin,
      y: STARTER_KIT_LAYOUT.referral.y,
    });
  }

  context.fillStyle = "#8a96a3";
  context.font = `400 ${STARTER_KIT_LAYOUT.footer.fontSize}px Inter, Arial, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillText(STARTER_KIT_FOOTER, canvas.width / 2, STARTER_KIT_LAYOUT.footer.y);

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
  logoPresentation?: Partial<LogoPresentation> | null;
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
    presentation: input.logoPresentation,
    restaurantName: input.restaurantName || "Dein Restaurant",
  };
  const qrCanvases: Partial<Record<StarterKitQrKind, HTMLCanvasElement>> = {
    bonus: bonusQr ?? undefined,
    restaurant: restaurantQr,
    staff: staffQr,
  };
  const pageSpecs: QrPrintPage[] = getStarterKitPageDefinitions(input.includeCustomerCollectCompatibility)
    .map((page) => ({ ...page, qrCanvas: qrCanvases[page.qrKind] }))
    .filter((page): page is QrPrintPage => Boolean(page.qrCanvas));

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

function previewBoxStyle(box: { height: number; width: number; x: number; y: number }): CSSProperties {
  return {
    height: `${box.height / STARTER_KIT_LAYOUT.canvas.height * 100}%`,
    left: `${box.x / STARTER_KIT_LAYOUT.canvas.width * 100}%`,
    top: `${box.y / STARTER_KIT_LAYOUT.canvas.height * 100}%`,
    width: `${box.width / STARTER_KIT_LAYOUT.canvas.width * 100}%`,
  };
}

function previewTextStyle(y: number, fontSize: number): CSSProperties {
  return {
    fontSize: `${fontSize / STARTER_KIT_LAYOUT.canvas.width * 100}cqw`,
    top: `${y / STARTER_KIT_LAYOUT.canvas.height * 100}%`,
  };
}

function StarterKitPagePreview({
  accentColor,
  branding,
  page,
  primaryColor,
  qrValue,
  restaurantName,
}: {
  accentColor: string;
  branding: ReturnType<typeof useTenant>["branding"];
  page: StarterKitPageDefinition;
  primaryColor: string;
  qrValue: string;
  restaurantName: string;
}) {
  const contentWidth = STARTER_KIT_LAYOUT.canvas.width - STARTER_KIT_LAYOUT.contentMargin * 2;
  const pageLayout = getStarterKitPageLayout(page);
  const headlineFontSize = starterKitSingleLineFontSize(page.headline, {
    fontSize: pageLayout.headline.fontSize,
    maxWidth: contentWidth,
    minFontSize: pageLayout.headline.minFontSize,
  });
  const descriptionFontSize = starterKitSingleLineFontSize(page.subheadline, {
    fontSize: pageLayout.description.fontSize,
    maxWidth: (contentWidth - 90) * pageLayout.description.maxLines,
    minFontSize: pageLayout.description.minFontSize,
  });
  const qrFrame = {
    height: pageLayout.qr.size + pageLayout.qr.frameInset * 2,
    width: pageLayout.qr.size + pageLayout.qr.frameInset * 2,
    x: pageLayout.qr.x - pageLayout.qr.frameInset,
    y: pageLayout.qr.y - pageLayout.qr.frameInset,
  };

  return (
    <article className="starter-kit-preview-item">
      <div className="starter-kit-a6-sheet" aria-label={`A6-Vorschau: ${page.headline}`}>
        <RestaurantBrandIdentity logoUrl={branding?.logo_url} name={restaurantName} presentation={branding} primaryColor={primaryColor} variant="a6" />
        {page.audienceLabel ? <div className="starter-kit-a6-audience" style={{ ...previewTextStyle(STARTER_KIT_LAYOUT.audience.y, STARTER_KIT_LAYOUT.audience.fontSize), color: primaryColor }}>{page.audienceLabel}</div> : null}
        <div className="starter-kit-a6-headline" style={{ ...previewTextStyle(pageLayout.headline.y, headlineFontSize), WebkitLineClamp: pageLayout.headline.maxLines }}>{page.headline}</div>
        <div className="starter-kit-a6-description" style={{ ...previewTextStyle(pageLayout.description.y, descriptionFontSize), WebkitLineClamp: pageLayout.description.maxLines }}>{page.subheadline}</div>
        <div className="starter-kit-a6-qr-frame" style={{ ...previewBoxStyle(qrFrame), borderColor: colorWithAlpha(accentColor, 0.46) }}>
          <OperationalQrCode id={`starter-kit-preview-${page.id}`} title={`QR-Code: ${page.headline}`} value={qrValue} />
        </div>
        {page.secondaryNote ? <div className="starter-kit-a6-note" style={previewTextStyle(STARTER_KIT_LAYOUT.secondaryNote.y, STARTER_KIT_LAYOUT.secondaryNote.fontSize)}>{page.secondaryNote}</div> : null}
        {page.referralHint ? (
          <div
            className="starter-kit-a6-referral"
            style={{
              backgroundColor: colorWithAlpha(accentColor, 0.12),
              borderColor: colorWithAlpha(accentColor, 0.42),
              height: `${STARTER_KIT_LAYOUT.referral.height / STARTER_KIT_LAYOUT.canvas.height * 100}%`,
              left: `${STARTER_KIT_LAYOUT.contentMargin / STARTER_KIT_LAYOUT.canvas.width * 100}%`,
              top: `${STARTER_KIT_LAYOUT.referral.y / STARTER_KIT_LAYOUT.canvas.height * 100}%`,
              width: `${(STARTER_KIT_LAYOUT.canvas.width - STARTER_KIT_LAYOUT.contentMargin * 2) / STARTER_KIT_LAYOUT.canvas.width * 100}%`,
            }}
          >
            <strong style={{ color: primaryColor }}>{STARTER_KIT_REFERRAL.title}</strong>
            <div className="starter-kit-a6-benefits">
              {STARTER_KIT_REFERRAL.benefits.map((benefit) => <span key={benefit.label}><b>{benefit.icon}</b><small>{benefit.label}</small><em style={{ color: primaryColor }}>{benefit.value}</em></span>)}
            </div>
            <small>{STARTER_KIT_REFERRAL.note}</small>
          </div>
        ) : null}
        <div className="starter-kit-a6-footer" style={previewTextStyle(STARTER_KIT_LAYOUT.footer.y, STARTER_KIT_LAYOUT.footer.fontSize)}>{STARTER_KIT_FOOTER}</div>
      </div>
      <strong className="starter-kit-preview-label">{page.headline}</strong>
    </article>
  );
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
  const starterKitPages = getStarterKitPageDefinitions(showCustomerCollectCompatibility);
  const starterKitQrValues: Record<StarterKitQrKind, string> = {
    bonus: bonusQrUrl,
    restaurant: restaurantQrUrl,
    staff: staffTabletUrl,
  };

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
        logoPresentation: branding ? {
          fitMode: branding.logo_fit_mode,
          positionX: branding.logo_position_x,
          positionY: branding.logo_position_y,
          scale: branding.logo_scale,
        } : null,
        primaryColor,
        restaurantName,
        restaurantQrId: "qr-restaurant",
        secondaryColor,
        staffQrId: "qr-staff",
      });
      const filename = buildStarterKitFilename(restaurantName);
      triggerDownload(new File([pdf], filename, { type: "application/pdf" }), filename);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Restaurant Starter Kit konnte nicht erstellt werden.");
    } finally {
      setStarterKitLoading(false);
    }
  }

  const renderQrBrandBlock = (contextLabel: string) => (
    <RestaurantBrandIdentity contextLabel={contextLabel} logoUrl={branding?.logo_url} name={restaurantName} presentation={branding} primaryColor={branding?.primary_color} variant="qr-card" />
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
              ? "Starter Kit herunterladen"
              : "QR-Daten werden geladen..."}
        </button>
        {downloadError ? <p className="form-error">{downloadError}</p> : null}
      </section>

      <section className="starter-kit-preview-section" aria-labelledby="starter-kit-preview-title">
        <div>
          <h2 id="starter-kit-preview-title">Druckvorschau</h2>
          <p className="muted">So sehen die vollständigen A6-Seiten im Starter Kit aus.</p>
        </div>
        <div className="starter-kit-preview-strip">
          {starterKitPages.map((page) => (
            <StarterKitPagePreview
              accentColor={secondaryColor}
              branding={branding}
              key={page.id}
              page={page}
              primaryColor={primaryColor}
              qrValue={starterKitQrValues[page.qrKind]}
              restaurantName={restaurantName}
            />
          ))}
        </div>
      </section>

      <section className="qr-individual-section" aria-labelledby="qr-individual-title">
        <div>
          <h2 id="qr-individual-title">Einzelne QR-Codes</h2>
          <p className="muted">Nur der jeweilige QR-Code als PNG, ohne A6-Druckseite.</p>
        </div>
        <section className="grid two qr-center-grid">
          <article className="card qr-box-large">
            {renderQrBrandBlock("Bonus für Gäste")}
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
                QR-Code als PNG herunterladen
              </button>
            </div>
          </article>

          <article className="card qr-box-large">
            {renderQrBrandBlock("Mitarbeiter")}
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
                QR-Code als PNG herunterladen
              </button>
            </div>
          </article>
        </section>
      </section>

      {showCustomerCollectCompatibility ? (
        <section className="qr-compatibility-section" aria-labelledby="qr-compatibility-title">
          <div>
            <h2 id="qr-compatibility-title">Bestehender Sammelweg</h2>
            <p className="muted">Nur sichtbar, weil dein Restaurant den kundeninitiierten Sammelweg verwendet.</p>
          </div>
          <article className="card qr-box-large">
            {renderQrBrandBlock("Bonus für Gäste")}
            <h3>Kassa QR</h3>
            <p className="muted">Für Bonuspunkte nach dem Bezahlen.</p>
            <OperationalQrCode id="qr-bonus" title="QR-Code für den bestehenden Sammelweg" value={bonusQrUrl} />
            <p className="muted">Bestandsgäste scannen und fragen nach der Tages-PIN.</p>
            <button className="button secondary" onClick={() => downloadQrPng("qr-bonus", "kassa-qr.png")} type="button">
              <Download size={18} />
              Kassa-QR als PNG herunterladen
            </button>
          </article>
        </section>
      ) : null}
    </>
  );
}
