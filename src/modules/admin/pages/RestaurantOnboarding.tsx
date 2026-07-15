import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Coffee,
  CupSoda,
  Gift,
  IceCreamBowl,
  ImagePlus,
  Info,
  Printer,
  Soup,
  Utensils,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import {
  completePilotOnboarding,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "../../onboarding/pilotOnboardingService";
import { useTenant } from "../../tenant/TenantProvider";
import { getPublicAppBaseUrl } from "../../../shared/lib/publicBaseUrl";
import { supabase } from "../../../shared/lib/supabase";

type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Generosity = "Sparsam" | "Normal" | "Großzügig" | "Premium";

type OpeningDay = {
  enabled: boolean;
  open: string;
  close: string;
};

type BonusCalculation = {
  pointsPerEuro: number;
  amountPerPoint: number;
  firstRewardPoints: number;
  rewardValueEuro: number;
  expectedConsumptionEuro: number;
  returnRate: number;
  returnRatePercent: string;
  amountTierPoints: {
    visit: number;
    menu: number;
    family: number;
  };
  recommendedRewardThresholds: number[];
};

type LogoColors = {
  primary: string;
  secondary: string;
};

type StarterRewardDraft = {
  key: string;
  title: string;
  category: string;
  availableProducts: string;
  active: boolean;
};

type StarterRewardTemplate = {
  key: string;
  title: string;
  description: string;
  category: string;
  availableProducts: string;
  asset: "drink" | "coffee" | "dessert" | "appetizer" | "main" | "menu" | "custom";
};

type OnboardingForm = {
  restaurantName: string;
  restaurantType: string;
  language: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  starterRewardConfirmed: boolean;
  openingHours: Record<Weekday, OpeningDay>;
  specialDays: string;
  holidays: string;
  smartOpenEnabled: boolean;
  averageBill: number;
  firstRewardVisits: number;
  firstRewardType: string;
  generosity: Generosity;
  starterRewards: StarterRewardDraft[];
  staffName: string;
  staffPin: string;
};

const steps = [
  "Restaurant",
  "Aussehen",
  "Geöffnet",
  "Punkteeinlösung",
  "Willkommensgeschenke",
  "Restaurant Starter Kit",
  "Startklar",
];

const stepTitles = [
  "Erzähl uns etwas über dein Restaurant.",
  "Wie soll dein Restaurant aussehen?",
  "Wann hast du geöffnet?",
  "Wie sollen Gäste Punkte einlösen?",
  "Welche Willkommensgeschenke möchtest du anbieten?",
  "Restaurant Starter Kit",
  "Herzlichen Glückwunsch! Dein Restaurant ist startklar.",
];

const checklistLabels = {
  restaurantDataCompleted: "Restaurantdaten fertig",
  brandingCompleted: "Aussehen fertig",
  openingHoursCompleted: "Öffnungszeiten fertig",
  bonusProgramCompleted: "Bonusprogramm fertig",
  firstRewardCreated: "Willkommensgeschenke fertig",
  guestTestReady: "Restaurant Starter Kit bereit",
  qrReady: "QR-Codes bereit",
};

const weekdays: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Mo" },
  { key: "tue", label: "Di" },
  { key: "wed", label: "Mi" },
  { key: "thu", label: "Do" },
  { key: "fri", label: "Fr" },
  { key: "sat", label: "Sa" },
  { key: "sun", label: "So" },
];

const defaultOpeningHours: Record<Weekday, OpeningDay> = {
  mon: { enabled: true, open: "11:00", close: "22:00" },
  tue: { enabled: true, open: "11:00", close: "22:00" },
  wed: { enabled: true, open: "11:00", close: "22:00" },
  thu: { enabled: true, open: "11:00", close: "22:00" },
  fri: { enabled: true, open: "11:00", close: "23:00" },
  sat: { enabled: true, open: "12:00", close: "23:00" },
  sun: { enabled: false, open: "12:00", close: "21:00" },
};

const generosityReturnRates: Record<Generosity, number> = {
  Sparsam: 0.03,
  Normal: 0.05,
  Großzügig: 0.08,
  Premium: 0.1,
};

const generosityHelpText: Record<Generosity, string> = {
  Sparsam: "Vorsichtig kalkuliert.",
  Normal: "Ausgewogen für die meisten Restaurants.",
  Großzügig: "Stärkerer Anreiz für Gäste.",
  Premium: "Sehr attraktiver Stammgäste-Anreiz.",
};

const starterRewardTemplates: StarterRewardTemplate[] = [
  {
    key: "gratis-getraenk",
    title: "Gratis Getränk",
    description: "Erfrischung für den ersten Besuch.",
    category: "Getränk",
    availableProducts: "Hauslimonade\nEistee\nSoftdrink",
    asset: "drink",
  },
  {
    key: "gratis-kaffee",
    title: "Gratis Kaffee",
    description: "Ein kleiner Kaffee-Moment.",
    category: "Kaffee",
    availableProducts: "Espresso\nCappuccino\nAmericano",
    asset: "coffee",
  },
  {
    key: "gratis-dessert",
    title: "Gratis Dessert",
    description: "Süßer Abschluss als Überraschung.",
    category: "Dessert",
    availableProducts: "Tiramisu\nKuchen\nMousse",
    asset: "dessert",
  },
  {
    key: "gratis-vorspeise",
    title: "Gratis Vorspeise",
    description: "Ein guter Start ins Essen.",
    category: "Vorspeise",
    availableProducts: "Edamame\nBruschetta\nSuppe",
    asset: "appetizer",
  },
  {
    key: "gratis-hauptspeise",
    title: "Gratis Hauptspeise",
    description: "Große Freude für treue Gäste.",
    category: "Hauptspeise",
    availableProducts: "Tagesgericht\nBowl\nPasta",
    asset: "main",
  },
  {
    key: "gratis-menue",
    title: "Gratis Menü",
    description: "Ein komplettes Dankeschön.",
    category: "Menü",
    availableProducts: "Mittagsmenü\nAbendmenü\nFamilienmenü",
    asset: "menu",
  },
  {
    key: "eigene-belohnung",
    title: "Eigene Überraschung",
    description: "Deine eigene Willkommens-Idee.",
    category: "Eigene Überraschung",
    availableProducts: "",
    asset: "custom",
  },
];

function createDefaultForm(): OnboardingForm {
  return {
    restaurantName: "",
    restaurantType: "Restaurant",
    language: "Deutsch",
    logoUrl: "",
    primaryColor: "#0f766e",
    secondaryColor: "#f4a261",
    starterRewardConfirmed: false,
    openingHours: {
      mon: { ...defaultOpeningHours.mon },
      tue: { ...defaultOpeningHours.tue },
      wed: { ...defaultOpeningHours.wed },
      thu: { ...defaultOpeningHours.thu },
      fri: { ...defaultOpeningHours.fri },
      sat: { ...defaultOpeningHours.sat },
      sun: { ...defaultOpeningHours.sun },
    },
    specialDays: "",
    holidays: "",
    smartOpenEnabled: true,
    averageBill: 18,
    firstRewardVisits: 5,
    firstRewardType: "Gratis Produkt",
    generosity: "Normal",
    starterRewards: [],
    staffName: "Team",
    staffPin: "1234",
  };
}

function restoreForm(draftData: Partial<OnboardingForm> | null): OnboardingForm {
  const defaults = createDefaultForm();
  const draftOpeningHours = (draftData?.openingHours ?? {}) as Partial<Record<Weekday, Partial<OpeningDay>>>;
  const legacyDraft = (draftData ?? {}) as Partial<OnboardingForm> & {
    rewardImageUrl?: string;
    rewardTitle?: string;
    rewardCategory?: string;
    availableProducts?: string;
  };
  const starterRewards = Array.isArray(draftData?.starterRewards) && draftData.starterRewards.length > 0
    ? draftData.starterRewards
    : legacyDraft.rewardTitle
      ? [
          {
            key: "legacy-welcome-reward",
            title: legacyDraft.rewardTitle,
            category: legacyDraft.rewardCategory ?? "Eigene Überraschung",
            availableProducts: legacyDraft.availableProducts ?? "",
            active: true,
          },
        ]
      : defaults.starterRewards;

  return {
    ...defaults,
    ...draftData,
    starterRewards: starterRewards.filter((reward) => reward.active !== false).map((reward, index) => ({
      key: reward.key || `starter-reward-${index + 1}`,
      title: reward.title || "Eigene Überraschung",
      category: reward.category || "Eigene Überraschung",
      availableProducts: reward.availableProducts || "",
      active: true,
    })),
    openingHours: {
      mon: { ...defaults.openingHours.mon, ...draftOpeningHours.mon },
      tue: { ...defaults.openingHours.tue, ...draftOpeningHours.tue },
      wed: { ...defaults.openingHours.wed, ...draftOpeningHours.wed },
      thu: { ...defaults.openingHours.thu, ...draftOpeningHours.thu },
      fri: { ...defaults.openingHours.fri, ...draftOpeningHours.fri },
      sat: { ...defaults.openingHours.sat, ...draftOpeningHours.sat },
      sun: { ...defaults.openingHours.sun, ...draftOpeningHours.sun },
    },
  };
}

function calculateBonus(averageBill: number, firstRewardVisits: number, generosity: Generosity): BonusCalculation {
  const cleanAverageBill = Math.max(1, averageBill || 1);
  const cleanVisits = Math.max(1, firstRewardVisits || 1);
  const returnRate = generosityReturnRates[generosity];
  const expectedConsumptionEuro = Number((cleanAverageBill * cleanVisits).toFixed(2));
  const pointsPerEuro = 1;
  const amountPerPoint = Number((1 / pointsPerEuro).toFixed(4));
  const firstRewardPoints = Math.max(10, Math.round(cleanAverageBill * cleanVisits * pointsPerEuro));
  const rewardValueEuro = Number((expectedConsumptionEuro * returnRate).toFixed(2));

  return {
    pointsPerEuro,
    amountPerPoint,
    firstRewardPoints,
    rewardValueEuro,
    expectedConsumptionEuro,
    returnRate,
    returnRatePercent: `${Math.round(returnRate * 100)} %`,
    amountTierPoints: {
      visit: Math.round(cleanAverageBill * pointsPerEuro),
      menu: Math.round(cleanAverageBill * 1.5 * pointsPerEuro),
      family: Math.round(cleanAverageBill * 3 * pointsPerEuro),
    },
    recommendedRewardThresholds: [
      firstRewardPoints,
      Math.round(firstRewardPoints * 1.8),
      Math.round(firstRewardPoints * 3),
    ],
  };
}

function formatEuro(value: number, fixedCents = false) {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fixedCents || hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function slugifyRestaurant(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "restaurant";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function qrSvgToCanvas(svgId: string, size = 960) {
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
  context.drawImage(image, 0, 0, size, size);
  URL.revokeObjectURL(url);
  return canvas;
}

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

type StarterKitPdfPage = {
  imageBytes: Uint8Array;
  imageHeight: number;
  imageWidth: number;
  pageHeight: number;
  pageWidth: number;
};

type StarterKitPageSpec = {
  headline: string;
  qrCanvas: HTMLCanvasElement;
  shortNote: string;
};

const starterKitFooterText = "Powered by WUXUAI Bonus • www.wuxuaisbi.com";

function buildStarterKitPdf(pages: StarterKitPdfPage[]) {
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
    write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /${imageName} ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`);

    startObject(imageObjectId);
    write(`<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.length} >>\nstream\n`);
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

function drawRestaurantBrand(
  context: CanvasRenderingContext2D,
  options: {
    accentColor: string;
    height: number;
    logoImage: HTMLImageElement | null;
    name: string;
    primaryColor: string;
    width: number;
    x: number;
    y: number;
  },
) {
  const { accentColor, height, logoImage, name, primaryColor, width, x, y } = options;
  context.save();
  roundedRect(context, x, y, width, height, Math.min(width, height) * 0.14);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = accentColor;
  context.lineWidth = Math.max(3, Math.min(width, height) * 0.035);
  context.stroke();

  if (logoImage) {
    const padding = Math.min(width, height) * 0.12;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2;
    const ratio = Math.min(availableWidth / logoImage.width, availableHeight / logoImage.height);
    const imageWidth = logoImage.width * ratio;
    const imageHeight = logoImage.height * ratio;
    context.drawImage(logoImage, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
  } else {
    context.fillStyle = primaryColor;
    roundedRect(context, x + width * 0.08, y + height * 0.16, width * 0.84, height * 0.68, Math.min(width, height) * 0.11);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `900 ${Math.round(height * 0.25)}px Inter, Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("WUXUAI", x + width / 2, y + height * 0.42);
    context.font = `800 ${Math.round(height * 0.18)}px Inter, Arial, sans-serif`;
    context.fillText("Bonus", x + width / 2, y + height * 0.64);
  }

  context.restore();
}

function canvasToJpegBytes(canvas: HTMLCanvasElement) {
  return base64ToBytes(canvas.toDataURL("image/jpeg", 0.95).split(",")[1] ?? "");
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

function drawBonusBoostKpiBox(
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
  const gap = 34;
  const cardWidth = (width - gap * 2) / 3;
  const cardHeight = 300;
  const titleY = y;
  const cardsY = y + 110;
  const cards = [
    { icon: "🔥", label: "Du", value: "2× Punkte" },
    { icon: "👥", label: "Freund", value: "2× Punkte" },
    { icon: "📅", label: "+30 Tage", value: "Bonus Boost" },
  ];

  context.save();
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = primaryColor;
  context.font = "900 64px Inter, Arial, sans-serif";
  context.fillText("💡 Freunde einladen", x + width / 2, titleY);

  cards.forEach((card, index) => {
    const cardX = x + index * (cardWidth + gap);
    roundedRect(context, cardX, cardsY, cardWidth, cardHeight, 42);
    context.fillStyle = colorWithAlpha(index === 2 ? accentColor : primaryColor, 0.08);
    context.fill();
    context.strokeStyle = index === 2 ? accentColor : primaryColor;
    context.lineWidth = 5;
    context.stroke();

    context.fillStyle = "#17202a";
    context.font = "900 70px Inter, Arial, sans-serif";
    context.fillText(card.icon, cardX + cardWidth / 2, cardsY + 34);

    context.fillStyle = "#344251";
    context.font = "900 46px Inter, Arial, sans-serif";
    context.fillText(card.label, cardX + cardWidth / 2, cardsY + 140);

    context.fillStyle = primaryColor;
    context.font = "900 48px Inter, Arial, sans-serif";
    context.fillText(card.value, cardX + cardWidth / 2, cardsY + 208);
  });
  context.restore();
}

function drawStarterKitPage(
  spec: StarterKitPageSpec,
  branding: { logoImage: HTMLImageElement | null; name: string; primaryColor: string; secondaryColor: string },
): StarterKitPdfPage {
  const canvas = document.createElement("canvas");
  canvas.width = 2480;
  canvas.height = 3508;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Starter Kit konnte nicht gezeichnet werden.");
  }

  const margin = 188;
  const logoWidth = 984;
  const logoHeight = 276;
  const qrSize = 820;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 1010;
  const cardPadding = 104;
  const cardTop = 130;
  const cardBottom = 185;
  const cardHeight = canvas.height - cardTop - cardBottom;
  const logoY = cardTop + 120;
  const nameY = logoY + logoHeight + 40;
  const headlineY = nameY + 108;
  const noteY = qrY + qrSize + 98;
  const kpiBoxWidth = 1760;
  const kpiBoxY = noteY + 260;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = branding.secondaryColor;
  context.fillRect(0, 0, canvas.width, 46);

  roundedRect(context, margin, cardTop, canvas.width - margin * 2, cardHeight, 66);
  context.fillStyle = "#ffffff";
  context.fill();
  context.shadowColor = "rgba(23, 32, 42, 0.14)";
  context.shadowBlur = 42;
  context.shadowOffsetY = 18;
  context.strokeStyle = "#dde3ea";
  context.lineWidth = 6;
  context.stroke();
  context.shadowColor = "transparent";

  drawRestaurantBrand(context, {
    accentColor: branding.secondaryColor,
    height: logoHeight,
    logoImage: branding.logoImage,
    name: branding.name,
    primaryColor: branding.primaryColor,
    width: logoWidth,
    x: (canvas.width - logoWidth) / 2,
    y: logoY,
  });

  context.fillStyle = "#17202a";
  context.font = "800 66px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  drawWrappedText(
    context,
    branding.name || "Dein Restaurant",
    canvas.width / 2,
    nameY,
    canvas.width - margin * 2 - cardPadding,
    76,
  );

  context.fillStyle = branding.primaryColor;
  context.font = "900 116px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  drawWrappedText(context, spec.headline, canvas.width / 2, headlineY, canvas.width - margin * 2 - cardPadding, 132);

  roundedRect(context, qrX - 36, qrY - 36, qrSize + 72, qrSize + 72, 42);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = branding.secondaryColor;
  context.lineWidth = 8;
  context.stroke();
  context.drawImage(spec.qrCanvas, qrX, qrY, qrSize, qrSize);

  context.fillStyle = "#344251";
  context.font = "800 54px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  drawWrappedText(context, spec.shortNote, canvas.width / 2, noteY, canvas.width - margin * 2 - cardPadding, 68);

  drawBonusBoostKpiBox(context, {
    accentColor: branding.secondaryColor,
    primaryColor: branding.primaryColor,
    width: kpiBoxWidth,
    x: (canvas.width - kpiBoxWidth) / 2,
    y: kpiBoxY,
  });

  context.fillStyle = "#8a96a3";
  context.font = "600 30px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(starterKitFooterText, canvas.width / 2, canvas.height - 54);

  return {
    imageBytes: canvasToJpegBytes(canvas),
    imageHeight: canvas.height,
    imageWidth: canvas.width,
    pageHeight: 842,
    pageWidth: 595,
  };
}

function drawStarterKitInfoPage(
  branding: { logoImage: HTMLImageElement | null; name: string; primaryColor: string; secondaryColor: string },
): StarterKitPdfPage {
  const canvas = document.createElement("canvas");
  canvas.width = 2480;
  canvas.height = 3508;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Starter Kit konnte nicht gezeichnet werden.");
  }

  const margin = 188;
  const cardTop = 130;
  const cardBottom = 185;
  const cardHeight = canvas.height - cardTop - cardBottom;
  const logoWidth = 984;
  const logoHeight = 276;
  const logoY = cardTop + 150;
  const nameY = logoY + logoHeight + 40;
  const titleY = nameY + 150;
  const subtitleY = titleY + 150;
  const listX = margin + 360;
  const listY = subtitleY + 260;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = branding.secondaryColor;
  context.fillRect(0, 0, canvas.width, 46);

  roundedRect(context, margin, cardTop, canvas.width - margin * 2, cardHeight, 66);
  context.fillStyle = "#ffffff";
  context.fill();
  context.shadowColor = "rgba(23, 32, 42, 0.14)";
  context.shadowBlur = 42;
  context.shadowOffsetY = 18;
  context.strokeStyle = "#dde3ea";
  context.lineWidth = 6;
  context.stroke();
  context.shadowColor = "transparent";

  drawRestaurantBrand(context, {
    accentColor: branding.secondaryColor,
    height: logoHeight,
    logoImage: branding.logoImage,
    name: branding.name,
    primaryColor: branding.primaryColor,
    width: logoWidth,
    x: (canvas.width - logoWidth) / 2,
    y: logoY,
  });

  context.fillStyle = "#17202a";
  context.font = "800 66px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  drawWrappedText(context, branding.name || "Dein Restaurant", canvas.width / 2, nameY, canvas.width - margin * 2 - 104, 76);

  context.fillStyle = branding.primaryColor;
  context.font = "900 122px Inter, Arial, sans-serif";
  drawWrappedText(context, "Restaurant Starter Kit", canvas.width / 2, titleY, canvas.width - margin * 2 - 104, 140);

  context.fillStyle = "#344251";
  context.font = "800 58px Inter, Arial, sans-serif";
  drawWrappedText(context, "So startest du dein Bonusprogramm.", canvas.width / 2, subtitleY, canvas.width - margin * 2 - 180, 72);

  const items = [
    "Drucke alle Seiten aus.",
    "Für längere Haltbarkeit empfehlen wir Laminieren.",
    'Seite "Mitglied werden" am Eingang aufstellen.',
    'Seite "Bonuspunkte sammeln" an der Kassa aufstellen.',
    "Teste beide QR Codes einmal.",
    "Danach ist dein Bonusprogramm einsatzbereit.",
  ];

  context.textAlign = "left";
  context.textBaseline = "top";
  items.forEach((item, index) => {
    const y = listY + index * 170;
    context.fillStyle = branding.primaryColor;
    context.font = "900 58px Inter, Arial, sans-serif";
    context.fillText("✓", listX, y);
    context.fillStyle = "#17202a";
    context.font = "800 52px Inter, Arial, sans-serif";
    drawWrappedText(context, item, listX + 90, y + 4, canvas.width - listX - margin - 180, 66);
  });

  context.fillStyle = "#8a96a3";
  context.font = "600 30px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(starterKitFooterText, canvas.width / 2, canvas.height - 54);

  return {
    imageBytes: canvasToJpegBytes(canvas),
    imageHeight: canvas.height,
    imageWidth: canvas.width,
    pageHeight: 842,
    pageWidth: 595,
  };
}

async function downloadRestaurantStarterKit(input: {
  bonusQrId: string;
  logoUrl: string;
  primaryColor: string;
  restaurantName: string;
  restaurantQrId: string;
  secondaryColor: string;
}) {
  const [restaurantQr, bonusQr, logoImage] = await Promise.all([
    qrSvgToCanvas(input.restaurantQrId),
    qrSvgToCanvas(input.bonusQrId),
    loadCanvasImage(input.logoUrl).catch(() => null),
  ]);
  const branding = {
    logoImage,
    name: input.restaurantName || "Dein Restaurant",
    primaryColor: input.primaryColor,
    secondaryColor: input.secondaryColor,
  };
  const pageSpecs: StarterKitPageSpec[] = [
    {
      headline: "Mitglied werden",
      shortNote: "Mitglied werden\nBonuspunkte sammeln\nPunkteeinlösung nutzen",
      qrCanvas: restaurantQr,
    },
    {
      headline: "Bonuspunkte sammeln",
      shortNote: "Nach dem Bezahlen\nQR scannen\nBonuspunkte sammeln.",
      qrCanvas: bonusQr,
    },
    {
      headline: "Bonuspunkte sammeln",
      shortNote: "Für die Kassa",
      qrCanvas: bonusQr,
    },
    {
      headline: "Mitglied werden",
      shortNote: "Neue Gäste\nstarten hier ihr Bonusprogramm.",
      qrCanvas: restaurantQr,
    },
  ];

  const pdf = buildStarterKitPdf([
    drawStarterKitInfoPage(branding),
    ...pageSpecs.map((page) => drawStarterKitPage(page, branding)),
  ]);
  triggerDownload(pdf, "restaurant-starter-kit.pdf");
}

function linesToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
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

function colorDistance(first: number[], second: number[]) {
  return Math.sqrt(
    (first[0] - second[0]) ** 2 +
      (first[1] - second[1]) ** 2 +
      (first[2] - second[2]) ** 2,
  );
}

function lightenColor(hex: string, amount = 0.72) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return rgbToHex(
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  );
}

async function extractSvgColors(file: File): Promise<LogoColors | null> {
  const text = await file.text();
  const matches = text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  const uniqueColors = Array.from(new Set(matches.map((color) => color.toLowerCase())))
    .filter((color) => !["#ffffff", "#000000"].includes(color));

  if (!uniqueColors.length) {
    return null;
  }

  return {
    primary: uniqueColors[0],
    secondary: uniqueColors[1] ?? lightenColor(uniqueColors[0], 0.55),
  };
}

async function extractRasterColors(imageUrl: string): Promise<LogoColors> {
  const image = new Image();
  image.src = imageUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Logo konnte nicht gelesen werden."));
  });

  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Farben konnten nicht erkannt werden.");
  }

  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { rgb: number[]; count: number }>();

  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 160) continue;

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const brightness = (r + g + b) / 3;

    if (brightness > 242 || brightness < 18) continue;

    const bucketRgb = [Math.round(r / 32) * 32, Math.round(g / 32) * 32, Math.round(b / 32) * 32];
    const key = bucketRgb.join("-");
    const current = buckets.get(key);
    buckets.set(key, { rgb: bucketRgb, count: (current?.count ?? 0) + 1 });
  }

  const rankedColors = Array.from(buckets.values()).sort((first, second) => second.count - first.count);
  const primaryRgb = rankedColors[0]?.rgb ?? [15, 118, 110];
  const secondaryRgb =
    rankedColors.find((color) => colorDistance(color.rgb, primaryRgb) > 70)?.rgb ??
    primaryRgb.map((value) => Math.round(value + (255 - value) * 0.55));

  return {
    primary: rgbToHex(primaryRgb[0], primaryRgb[1], primaryRgb[2]),
    secondary: rgbToHex(secondaryRgb[0], secondaryRgb[1], secondaryRgb[2]),
  };
}

async function extractLogoColors(file: File, previewUrl: string): Promise<LogoColors | null> {
  if (file.type === "image/svg+xml") {
    return extractSvgColors(file);
  }

  return extractRasterColors(previewUrl);
}

function safeStorageFileName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

function fileExtension(file: File) {
  const fromName = safeStorageFileName(file.name).split(".").pop();
  if (fromName) {
    return fromName === "jpg" ? "jpg" : fromName;
  }

  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function missingChecklistItems(checklist: Record<keyof typeof checklistLabels, boolean>) {
  return Object.entries(checklistLabels)
    .filter(([key]) => !checklist[key as keyof typeof checklistLabels])
    .map(([, label]) => label);
}

function buildChecklist(form: OnboardingForm, step: number) {
  return {
    restaurantDataCompleted: Boolean(form.restaurantName.trim() && form.restaurantType && form.language),
    brandingCompleted: Boolean(form.primaryColor && form.secondaryColor),
    openingHoursCompleted: weekdays.some(({ key }) => form.openingHours[key].enabled),
    bonusProgramCompleted: form.averageBill > 0 && form.firstRewardVisits > 0,
    firstRewardCreated: form.starterRewards.filter((reward) => reward.title.trim()).length > 0,
    qrReady: true,
    guestTestReady: step >= 5,
  };
}

function getStepBlocker(
  step: number,
  form: OnboardingForm,
  checklist: Record<keyof typeof checklistLabels, boolean>,
) {
  if (step === 0 && !form.restaurantName.trim()) {
    return "Bitte gib den Namen deines Restaurants ein.";
  }

  if (step === 2 && !checklist.openingHoursCompleted) {
    return "Bitte wähle mindestens einen Öffnungstag.";
  }

  if (step === 3 && (!form.averageBill || !form.firstRewardVisits)) {
    return "Bitte fülle die zwei Werte für dein Bonusprogramm aus.";
  }

  if (step === 4 && form.starterRewards.filter((reward) => reward.title.trim()).length === 0) {
    return "Bitte wähle mindestens ein Willkommensgeschenk.";
  }

  if (step === 6) {
    const missingItems = missingChecklistItems(checklist);
    if (missingItems.length) {
      return `Noch offen: ${missingItems.join(", ")}`;
    }
  }

  return null;
}

export function RestaurantOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeRestaurant, loading: tenantLoading, refreshTenants } = useTenant();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState<OnboardingForm>(() => createDefaultForm());
  const [draftLoading, setDraftLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoUploadStatus, setLogoUploadStatus] = useState<string | null>(null);
  const [colorStatus, setColorStatus] = useState<string | null>(null);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const bonus = useMemo(
    () => calculateBonus(form.averageBill, form.firstRewardVisits, form.generosity),
    [form.averageBill, form.firstRewardVisits, form.generosity],
  );

  const restaurantSlug = slugifyRestaurant(form.restaurantName || "restaurant");
  const publicBaseUrl = getPublicAppBaseUrl();
  const restaurantQrUrl = `${publicBaseUrl}/customer/${restaurantSlug}`;
  const bonusQrUrl = `${publicBaseUrl}/w/${restaurantSlug}`;
  const visibleLogoUrl = logoPreviewUrl || form.logoUrl;
  const bonusCardColor = lightenColor(form.secondaryColor, 0.72);

  const checklist = useMemo(() => buildChecklist(form, step), [form, step]);

  const allReady = Object.values(checklist).every(Boolean);
  const stepBlocker = getStepBlocker(step, form, checklist);
  const missingItems = missingChecklistItems(checklist);
  const selectedStarterRewardCount = form.starterRewards.length;
  const starterRewardCounterTone = selectedStarterRewardCount === 0
    ? "gray"
    : selectedStarterRewardCount >= 3 && selectedStarterRewardCount <= 5
      ? "green"
      : "orange";
  const starterRewardConfirmationOpen = step === 4 && form.starterRewards.length > 0 && form.starterRewardConfirmed;
  const explanationDismissedKey = activeRestaurant?.id
    ? `wuxuai:onboarding-how-it-works-dismissed:${activeRestaurant.id}`
    : null;

  const explanation = [
    `${form.restaurantName || "Dein Restaurant"} bekommt ein eigenes digitales Bonusprogramm.`,
    `Gäste sehen deine Öffnungszeiten: ${openDaysSummary(form.openingHours)}.`,
    `Du planst ${bonus.returnRatePercent} Rückgabe nach ca. ${form.firstRewardVisits} Besuchen.`,
    `${form.starterRewards.length || 1} Willkommensgeschenk wartet später zufällig auf neue Gäste.`,
    "Willkommensgeschenke sind ein fester Teil deines Bonusprogramms.",
  ];

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      if (tenantLoading) {
        return;
      }

      if (!activeRestaurant?.id) {
        setDraftLoading(false);
        return;
      }

      setDraftLoading(true);

      try {
        const draft = await loadOnboardingDraft<OnboardingForm>(activeRestaurant.id);
        if (cancelled) {
          return;
        }

        if (draft.onboardingStatus === "ready" || draft.onboardingStatus === "completed") {
          navigate("/admin", { replace: true });
          return;
        }

        setForm(restoreForm(draft.draftData));
        setStep(draft.currentStep);
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Deine Einrichtung konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setDraftLoading(false);
        }
      }
    }

    restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [activeRestaurant?.id, navigate, tenantLoading]);

  useEffect(() => {
    if (!activeRestaurant?.id || tenantLoading || draftLoading) {
      return;
    }

    const dismissed = window.localStorage.getItem(`wuxuai:onboarding-how-it-works-dismissed:${activeRestaurant.id}`);
    if (dismissed !== "true") {
      setHowItWorksOpen(true);
    }
  }, [activeRestaurant?.id, draftLoading, tenantLoading]);

  useEffect(() => {
    setLogoPreviewUrl("");
    setLogoUploadStatus(null);
    setColorStatus(null);
  }, [activeRestaurant?.id]);

  useEffect(() => {
    if (draftLoading || tenantLoading || !activeRestaurant?.id) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setSaving(true);
      saveOnboardingDraft(activeRestaurant.id, step, form, checklist)
        .catch((error) => {
          if (!cancelled) {
            console.error("Onboarding-Fortschritt konnte nicht gespeichert werden.", error);
            setStatus("Fortschritt konnte gerade nicht gespeichert werden.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSaving(false);
          }
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [activeRestaurant?.id, checklist, draftLoading, form, step, tenantLoading]);

  async function persistDraftSnapshot(nextStep: number, nextForm: OnboardingForm) {
    if (!activeRestaurant?.id || tenantLoading || draftLoading) {
      return true;
    }

    setSaving(true);

    try {
      await saveOnboardingDraft(activeRestaurant.id, nextStep, nextForm, buildChecklist(nextForm, nextStep));
      return true;
    } catch (error) {
      console.error("Onboarding-Fortschritt konnte nicht gespeichert werden.", error);
      setStatus("Fortschritt konnte gerade nicht gespeichert werden.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateOpeningDay(day: Weekday, nextDay: Partial<OpeningDay>) {
    setForm((current) => ({
      ...current,
      openingHours: {
        ...current.openingHours,
        [day]: {
          ...current.openingHours[day],
          ...nextDay,
        },
      },
    }));
  }

  async function persistLogoUrl(nextLogoUrl: string) {
    setForm((current) => ({ ...current, logoUrl: nextLogoUrl }));

    if (!supabase || !activeRestaurant?.id) {
      return;
    }

    await supabase
      .from("restaurant_branding")
      .upsert(
        {
          restaurant_id: activeRestaurant.id,
          logo_url: nextLogoUrl,
        },
        { onConflict: "restaurant_id" },
      );
  }

  async function uploadLogo(file: File) {
    if (!supabase || !activeRestaurant?.id) {
      throw new Error("Supabase Storage ist nicht verbunden.");
    }

    const path = `${activeRestaurant.id}/branding/logo-${Date.now()}.${fileExtension(file)}`;
    const { error } = await supabase.storage.from("restaurant-media").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from("restaurant-media").getPublicUrl(path);
    await persistLogoUrl(data.publicUrl);
    return data.publicUrl;
  }

  async function handleLogoFile(file: File) {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setLogoUploadStatus("Bitte wähle PNG, JPG, JPEG oder SVG.");
      return;
    }

    if (file.size > maxSize) {
      setLogoUploadStatus("Das Logo darf maximal 5 MB groß sein.");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setLogoPreviewUrl((current) => {
      if (current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
    setLogoUploadStatus("Logo ausgewählt. Vorschau ist sofort aktiv.");

    try {
      const colors = await extractLogoColors(file, nextPreviewUrl);
      if (colors) {
        setForm((current) => ({
          ...current,
          primaryColor: colors.primary,
          secondaryColor: colors.secondary,
        }));
        setColorStatus("Farben automatisch aus deinem Logo erkannt");
      } else {
        setColorStatus("Farben konnten nicht eindeutig erkannt werden. Du kannst sie manuell anpassen.");
      }
    } catch {
      setColorStatus("Farben konnten nicht eindeutig erkannt werden. Du kannst sie manuell anpassen.");
    }

    try {
      const uploadedUrl = await uploadLogo(file);
      setLogoPreviewUrl("");
      setLogoUploadStatus("Logo gespeichert.");
      setForm((current) => ({ ...current, logoUrl: uploadedUrl }));
    } catch (error) {
      setLogoUploadStatus(
        `Logo bleibt als Vorschau sichtbar. Speichern in der Mediathek ist gerade nicht möglich: ${
          error instanceof Error ? error.message : "Speichern fehlgeschlagen"
        }`,
      );
    }
  }

  function handleLogoInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      handleLogoFile(file);
    }
    event.target.value = "";
  }

  function handleLogoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingLogo(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleLogoFile(file);
    }
  }

  function toggleStarterRewardTemplate(template: StarterRewardTemplate) {
    setForm((current) => {
      if (current.starterRewards.some((reward) => reward.key === template.key)) {
        return {
          ...current,
          starterRewardConfirmed: false,
          starterRewards: current.starterRewards.filter((reward) => reward.key !== template.key),
        };
      }

      return {
        ...current,
        starterRewardConfirmed: false,
        starterRewards: [
          ...current.starterRewards,
          {
            key: template.key,
            title: template.title,
            category: template.category,
            availableProducts: template.availableProducts,
            active: true,
          },
        ],
      };
    });
  }

  function openGuestPreview() {
    window.open(`/customer/${restaurantSlug}`, "_blank", "noopener,noreferrer");
  }

  function closeHowItWorks() {
    if (explanationDismissedKey) {
      window.localStorage.setItem(explanationDismissedKey, "true");
    }
    setHowItWorksOpen(false);
  }

  async function goToPreviousStep() {
    if (starterRewardConfirmationOpen) {
      const nextForm = { ...form, starterRewardConfirmed: false };
      setForm(nextForm);
      setStatus(null);
      await persistDraftSnapshot(step, nextForm);
      return;
    }

    const nextStep = Math.max(0, step - 1);
    setStatus(null);
    if (await persistDraftSnapshot(nextStep, form)) {
      setStep(nextStep);
    }
  }

  async function goToNextStep() {
    if (stepBlocker) {
      return;
    }

    if (step === 4 && form.starterRewards.length > 0 && !form.starterRewardConfirmed) {
      const nextForm = { ...form, starterRewardConfirmed: true };
      setStatus(null);
      setForm(nextForm);
      await persistDraftSnapshot(step, nextForm);
      return;
    }

    const nextStep = Math.min(steps.length - 1, step + 1);
    setStatus(null);
    if (await persistDraftSnapshot(nextStep, form)) {
      setStep(nextStep);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!allReady) {
      setStatus("Bitte die offenen Punkte in der Checkliste abschließen.");
      return;
    }

    setStatus(null);

    try {
      const result = await completePilotOnboarding({
        restaurantId: activeRestaurant?.id ?? null,
        ownerId: user?.id ?? null,
        restaurantName: form.restaurantName.trim(),
        restaurantType: form.restaurantType,
        language: form.language,
        slug: restaurantSlug,
        logoUrl: form.logoUrl || null,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        buttonColor: form.primaryColor,
        openingHours: form.openingHours,
        specialDays: linesToList(form.specialDays),
        holidays: linesToList(form.holidays),
        smartOpenEnabled: form.smartOpenEnabled,
        onboardingStatus: "ready",
        onboardingChecklist: checklist,
        loyaltyMode: "amount_based",
        amountPerPoint: bonus.amountPerPoint,
        redemptionReturnRate: bonus.returnRate,
        amountTierPoints: bonus.amountTierPoints,
        starterRewards: form.starterRewards.map((reward) => ({
          key: reward.key,
          title: reward.title.trim(),
          category: reward.category,
          products: linesToList(reward.availableProducts),
          imageUrl: null,
          active: true,
        })),
        staffName: form.staffName,
        staffPin: form.staffPin,
      });
      if (activeRestaurant?.id) {
        await saveOnboardingDraft(activeRestaurant.id, steps.length - 1, form, checklist);
      }
      await refreshTenants();
      setStatus(`${result.restaurant.name} ist startklar.`);
      setStep(steps.length - 1);
      navigate("/admin", { replace: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Restaurant konnte nicht eröffnet werden.");
    }
  }

  if (tenantLoading || draftLoading) {
    return <div className="auth-shell">Onboarding wird geladen …</div>;
  }

  if (!activeRestaurant) {
    return <div className="auth-shell">Kein Restaurant gefunden.</div>;
  }

  return (
    <>
      <header className="page-header installation-header">
        <div>
          <span className="pill">Restaurant einrichten</span>
          <h1>Willkommen! In wenigen Minuten startet dein digitales Bonusprogramm.</h1>
          <p className="muted">Gleich bereit für Gäste.</p>
        </div>
        <div className="row-actions">
          {saving ? <span className="pill">Speichert...</span> : null}
          <span className="pill">Schritt {step + 1} von {steps.length}</span>
          <button className="button secondary compact-button" onClick={() => setHowItWorksOpen(true)} type="button">
            <Info size={17} />
            So funktioniert's
          </button>
        </div>
      </header>

      <section className="onboarding-layout">
        <form className="card onboarding-card installation-card form" onSubmit={handleSubmit}>
          <div className="setup-steps" aria-label="Einrichtungsschritte">
            {steps.map((label, index) => (
              <button
                className={`setup-step${index === step ? " active" : ""}${index < step ? " done" : ""}`}
                aria-current={index === step ? "step" : undefined}
                disabled
                key={label}
                type="button"
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {step === 0 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[0]}</h2>
              <div className="field">
                <label htmlFor="restaurant-name">Wie heißt dein Restaurant?</label>
                <input
                  className="input input-large"
                  id="restaurant-name"
                  placeholder="z. B. Café am Markt"
                  value={form.restaurantName}
                  onChange={(event) => setForm((current) => ({ ...current, restaurantName: event.target.value }))}
                />
              </div>
              <div className="grid two">
                <div className="field">
                  <label htmlFor="restaurant-type">Was passt am besten zu dir?</label>
                  <select
                    className="select input-large"
                    id="restaurant-type"
                    value={form.restaurantType}
                    onChange={(event) => setForm((current) => ({ ...current, restaurantType: event.target.value }))}
                  >
                    <option>Restaurant</option>
                    <option>Café</option>
                    <option>Bar</option>
                    <option>Bistro</option>
                    <option>Food Truck</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="language">Welche Sprache sollen deine Gäste sehen?</label>
                  <select
                    className="select input-large"
                    id="language"
                    value={form.language}
                    onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                  >
                    <option>Deutsch</option>
                    <option>Englisch</option>
                  </select>
                </div>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[1]}</h2>
              <div
                className={`logo-dropzone${draggingLogo ? " active" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDraggingLogo(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDraggingLogo(false)}
                onDrop={handleLogoDrop}
              >
                <input
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  className="visually-hidden"
                  id="logo-file"
                  onChange={handleLogoInputChange}
                  ref={logoInputRef}
                  type="file"
                />
                <div className="logo-preview-box">
                  {visibleLogoUrl ? (
                    <img alt={`${form.restaurantName || "Restaurant"} Logo`} src={visibleLogoUrl} />
                  ) : (
                    <ImagePlus size={36} />
                  )}
                </div>
                <div>
                  <strong>Zieh dein Logo hierher</strong>
                  <p className="muted">PNG, JPG oder SVG bis 5 MB. Die Vorschau erscheint sofort.</p>
                  <button className="button secondary" onClick={() => logoInputRef.current?.click()} type="button">
                    <ImagePlus size={18} />
                    Logo auswählen
                  </button>
                </div>
              </div>

              {logoUploadStatus ? <p className="muted">{logoUploadStatus}</p> : null}
              {colorStatus ? (
                <div className="status-message">
                  <strong>{colorStatus}</strong>
                  <p>Du kannst sie später anpassen.</p>
                </div>
              ) : null}

              <details className="advanced-panel">
                <summary>Erweitert</summary>
                <div className="field">
                  <label htmlFor="logo-url">Logo-Link manuell einfügen</label>
                  <input
                    className="input"
                    id="logo-url"
                    placeholder="https://..."
                    value={form.logoUrl}
                    onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
                  />
                </div>
              </details>

              <div className="grid two">
                <div className="field">
                  <label htmlFor="primary-color">Deine Markenfarbe</label>
                  <p className="muted">Diese Farbe wird für Buttons, Bonuskarten und Highlights verwendet.</p>
                  <input
                    className="input color-input"
                    id="primary-color"
                    type="color"
                    value={form.primaryColor}
                    onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="secondary-color">Deine Akzentfarbe</label>
                  <input
                    className="input color-input"
                    id="secondary-color"
                    type="color"
                    value={form.secondaryColor}
                    onChange={(event) => setForm((current) => ({ ...current, secondaryColor: event.target.value }))}
                  />
                </div>
              </div>

              <div className="brand-swatch-grid">
                <article>
                  <span style={{ background: form.primaryColor }} />
                  <strong>Buttons</strong>
                </article>
                <article>
                  <span style={{ background: bonusCardColor }} />
                  <strong>Bonuskarten</strong>
                </article>
                <article>
                  <span style={{ background: form.secondaryColor }} />
                  <strong>Highlights</strong>
                </article>
              </div>

              <section className="brand-live-preview">
                <article className="customer-app-preview" style={{ borderColor: form.primaryColor }}>
                  <div className="customer-brand-header restaurant-brand-header">
                    <span className="restaurant-logo-frame">
                      {visibleLogoUrl ? (
                        <img
                          className="customer-logo restaurant-logo-image"
                          alt={`${form.restaurantName || "Restaurant"} Logo`}
                          src={visibleLogoUrl}
                        />
                      ) : (
                        <span className="restaurant-logo-placeholder" style={{ background: bonusCardColor }}>
                          {(form.restaurantName.trim().charAt(0) || "R").toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div className="restaurant-brand-copy">
                      <h3 className="restaurant-brand-title">{form.restaurantName || "Dein Restaurant"}</h3>
                      <p className="restaurant-brand-subtitle">Mein Bonus</p>
                    </div>
                  </div>
                  <div className="bonus-preview-card" style={{ background: bonusCardColor, borderColor: form.secondaryColor }}>
                    <span>Deine Bonuskarte</span>
                    <strong style={{ color: form.primaryColor }}>0 Punkte</strong>
                    <p>Punkteeinlösungen sammeln und beim nächsten Besuch einlösen.</p>
                  </div>
                  <button className="button customer-primary-button" style={{ background: form.primaryColor }} type="button">
                    Bonus öffnen
                  </button>
                </article>

                <article className="qr-preview-panel">
                  <h3>So testest du es als Gast</h3>
                  <div className="mini-qr-grid">
                    <div>
                      <QRCodeSVG value={restaurantQrUrl} size={96} level="M" />
                      <span>Restaurant</span>
                    </div>
                    <div>
                      <QRCodeSVG value={bonusQrUrl} size={96} level="M" />
                      <span>Mein Bonus</span>
                    </div>
                  </div>
                  <button className="button secondary" onClick={openGuestPreview} type="button">
                    Als Gast ansehen
                  </button>
                </article>
              </section>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[2]}</h2>
              <div className="schedule-grid">
                {weekdays.map(({ key, label }) => (
                  <article className="schedule-row" key={key}>
                    <label className="inline-check">
                      <input
                        checked={form.openingHours[key].enabled}
                        onChange={(event) => updateOpeningDay(key, { enabled: event.target.checked })}
                        type="checkbox"
                      />
                      {label}
                    </label>
                    <input
                      className="input"
                      disabled={!form.openingHours[key].enabled}
                      type="time"
                      value={form.openingHours[key].open}
                      onChange={(event) => updateOpeningDay(key, { open: event.target.value })}
                    />
                    <input
                      className="input"
                      disabled={!form.openingHours[key].enabled}
                      type="time"
                      value={form.openingHours[key].close}
                      onChange={(event) => updateOpeningDay(key, { close: event.target.value })}
                    />
                  </article>
                ))}
              </div>
              <div className="grid two">
                <div className="field">
                  <label htmlFor="special-days">Besondere Tage</label>
                  <textarea
                    className="textarea"
                    id="special-days"
                    placeholder="z. B. Feiertag geöffnet"
                    value={form.specialDays}
                    onChange={(event) => setForm((current) => ({ ...current, specialDays: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="holidays">Urlaub oder geschlossene Tage</label>
                  <textarea
                    className="textarea"
                    id="holidays"
                    placeholder="z. B. 24.12. geschlossen"
                    value={form.holidays}
                    onChange={(event) => setForm((current) => ({ ...current, holidays: event.target.value }))}
                  />
                </div>
              </div>
              <label className="inline-check large-check">
                <input
                  checked={form.smartOpenEnabled}
                  onChange={(event) => setForm((current) => ({ ...current, smartOpenEnabled: event.target.checked }))}
                  type="checkbox"
                />
                Gäste sehen automatisch, ob du geöffnet hast
              </label>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[3]}</h2>
              <p className="muted">Lege fest, wie viel Gegenwert Gäste nach mehreren Besuchen einlösen können.</p>
              <div className="grid two">
                <div className="field">
                  <label htmlFor="average-bill">Was gibt ein Gast durchschnittlich aus?</label>
                  <input
                    className="input input-large"
                    id="average-bill"
                    min="1"
                    type="number"
                    value={form.averageBill}
                    onChange={(event) => setForm((current) => ({ ...current, averageBill: Number(event.target.value) || 1 }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="first-reward-visits">Nach wie vielen Besuchen soll die erste Freude kommen?</label>
                  <input
                    className="input input-large"
                    id="first-reward-visits"
                    min="1"
                    type="number"
                    value={form.firstRewardVisits}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, firstRewardVisits: Number(event.target.value) || 1 }))
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="first-reward-type">Was möchtest du gerne geben?</label>
                <select
                  className="select input-large"
                  id="first-reward-type"
                  value={form.firstRewardType}
                  onChange={(event) => setForm((current) => ({ ...current, firstRewardType: event.target.value }))}
                >
                  <option>Gratis Produkt</option>
                  <option>Rabatt</option>
                  <option>Upgrade</option>
                  <option>Überraschung</option>
                </select>
              </div>
              <div className="choice-grid">
                {(["Sparsam", "Normal", "Großzügig", "Premium"] as Generosity[]).map((option) => (
                  <button
                    className={`choice-card${form.generosity === option ? " active" : ""}`}
                    key={option}
                    onClick={() => setForm((current) => ({ ...current, generosity: option }))}
                    type="button"
                  >
                      {option}
                      <span>{Math.round(generosityReturnRates[option] * 100)} % Rückgabe</span>
                      <small>{generosityHelpText[option]}</small>
                  </button>
                ))}
              </div>
              <article className="calculation-card">
                <strong>Unsere Empfehlung für dich</strong>
                <p className="muted">
                  {form.generosity} gewählt: {bonus.returnRatePercent} Rückgabe.
                </p>
                <p className="muted">
                  Erwartete Konsumation bis zur Einlösung: {formatEuro(form.averageBill)} × {form.firstRewardVisits} Besuche = {formatEuro(bonus.expectedConsumptionEuro)}
                </p>
                <p className="muted">
                  Empfohlener Einlösewert: {bonus.returnRatePercent} von {formatEuro(bonus.expectedConsumptionEuro)} = {formatEuro(bonus.rewardValueEuro, true)}
                </p>
                <p className="muted">
                  WUXUAI berechnet daraus später automatisch die passende Punkte-Einlösung.
                </p>
              </article>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[4]}</h2>
              <article className="calculation-card">
                <strong>Welche Willkommensgeschenke möchtest du anbieten?</strong>
                <p className="muted">Empfohlen: 3–5 Willkommensgeschenke. Jeder neue Gast erhält zufällig eines davon.</p>
              </article>

              {!starterRewardConfirmationOpen ? (
                <>
                  <div className={`starter-reward-counter ${starterRewardCounterTone}`}>
                    <div>
                      <strong>Willkommensgeschenke</strong>
                      <p className="muted">{selectedStarterRewardCount} / 5 ausgewählt</p>
                    </div>
                    {selectedStarterRewardCount > 0 && selectedStarterRewardCount < 3 ? (
                      <p className="muted">💡 Wir empfehlen 3–5 Willkommensgeschenke für mehr Abwechslung.</p>
                    ) : null}
                  </div>

                  <div className="template-selection-grid">
                    {starterRewardTemplates.map((template) => (
                      <button
                        className={`template-selection-card${
                          form.starterRewards.some((reward) => reward.key === template.key) ? " selected" : ""
                        }`}
                        key={template.key}
                        onClick={() => toggleStarterRewardTemplate(template)}
                        type="button"
                      >
                        <span className="template-check">
                          {form.starterRewards.some((reward) => reward.key === template.key) ? <Check size={18} /> : null}
                        </span>
                        <span className={`standard-asset mini ${template.asset}`}>
                          <StandardRewardIcon asset={template.asset} size={24} />
                        </span>
                        <strong>{template.title}</strong>
                        <small>{template.description}</small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <article className="starter-confirmation-card">
                  <h3>Du hast ausgewählt:</h3>
                  <div className="rule-list">
                    {form.starterRewards.map((reward) => (
                      <ChecklistRow done label={reward.title} key={reward.key} />
                    ))}
                  </div>
                  <p className="muted">
                    Jeder neue Gast erhält zufällig eines dieser Willkommensgeschenke.
                  </p>
                  <p className="muted">
                    Welches konkrete Produkt du verschenkst, entscheidest du später im Bereich Willkommensgeschenke.
                  </p>
                  <p className="muted">
                    Du kannst Bilder, Produkte und Details jederzeit später bearbeiten.
                  </p>
                </article>
              )}

              <article className="calculation-card">
                <strong>Dein Bonusprogramm ist bereits einsatzbereit.</strong>
                <p className="muted">
                  Eigene Bilder und weitere Anpassungen kannst du jederzeit später vornehmen.
                </p>
              </article>
            </section>
          ) : null}

          {step === 5 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[5]}</h2>
              <article className="calculation-card">
                <strong>Restaurant Starter Kit</strong>
                <p className="muted">
                  Lade dein druckfertiges Paket herunter. Es enthält alles für Eingang und Kassa.
                </p>
              </article>
              <div className="qr-launch-grid">
                <QrLaunchCard
                  description="Neue Gäste scannen diesen QR-Code. Sie werden Mitglied und erhalten ihr erstes Willkommensgeschenk."
                  icon="👤"
                  id="restaurant-qr"
                  logoUrl={visibleLogoUrl}
                  restaurantName={form.restaurantName}
                  subtitle="Mitglied werden"
                  title="Neue Gäste"
                  url={restaurantQrUrl}
                />
                <QrLaunchCard
                  description="Bestandsgäste scannen diesen QR-Code nach dem Bezahlen und sammeln Bonuspunkte."
                  icon="🎁"
                  id="bonus-qr"
                  logoUrl={visibleLogoUrl}
                  restaurantName={form.restaurantName}
                  subtitle="Mein Bonus"
                  title="Bonuspunkte sammeln"
                  url={bonusQrUrl}
                />
              </div>
              <div className="starter-kit-action">
                <button
                  className="button starter-kit-button"
                  onClick={() => {
                    downloadRestaurantStarterKit({
                      bonusQrId: "bonus-qr",
                      logoUrl: visibleLogoUrl,
                      primaryColor: form.primaryColor,
                      restaurantName: form.restaurantName,
                      restaurantQrId: "restaurant-qr",
                      secondaryColor: form.secondaryColor,
                    }).catch((error) => {
                      window.alert(error instanceof Error ? error.message : "Restaurant Starter Kit konnte nicht gespeichert werden.");
                    });
                  }}
                  type="button"
                >
                  <Printer size={22} />
                  📦 Restaurant Starter Kit herunterladen
                </button>
              </div>
            </section>
          ) : null}

          {step === 6 ? (
            <section className="wizard-screen">
              <h2>{stepTitles[6]}</h2>
              <div className="rule-list">
                <ChecklistRow done={checklist.restaurantDataCompleted} label={checklistLabels.restaurantDataCompleted} />
                <ChecklistRow done={checklist.brandingCompleted} label={checklistLabels.brandingCompleted} />
                <ChecklistRow done={checklist.openingHoursCompleted} label={checklistLabels.openingHoursCompleted} />
                <ChecklistRow done={checklist.bonusProgramCompleted} label={checklistLabels.bonusProgramCompleted} />
                <ChecklistRow done={checklist.firstRewardCreated} label={checklistLabels.firstRewardCreated} />
                <ChecklistRow done={checklist.guestTestReady} label={checklistLabels.guestTestReady} />
                <ChecklistRow done={checklist.qrReady} label={checklistLabels.qrReady} />
              </div>
              {!allReady ? (
                <div className="status-message">
                  <strong>Fast geschafft.</strong>
                  <p>Bitte prüfe noch: {missingItems.join(", ")}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="wizard-footer">
            <button
              className="button secondary"
              disabled={saving || step === 0}
              onClick={goToPreviousStep}
              type="button"
            >
              ← Zurück
            </button>
            {step < steps.length - 1 ? (
              <button
                className="button"
                disabled={saving || Boolean(stepBlocker)}
                onClick={goToNextStep}
                type="button"
              >
                {starterRewardConfirmationOpen ? "Bestätigen →" : "Weiter →"}
              </button>
            ) : (
              <button className="button" disabled={saving || !allReady} type="submit">
                Restaurant starten
              </button>
            )}
          </div>

          {stepBlocker && step < steps.length - 1 ? <p className="status-message">{stepBlocker}</p> : null}
          {status ? <p className="status-message">{status}</p> : null}
        </form>
      </section>

      {howItWorksOpen ? (
        <div className="modal-backdrop" role="presentation">
          <aside className="how-modal" aria-modal="true" role="dialog" aria-labelledby="how-title">
            <div className="modal-header">
              <h2 id="how-title">So funktioniert's</h2>
              <button className="icon-button" onClick={closeHowItWorks} type="button" aria-label="Schließen">
                <X size={20} />
              </button>
            </div>
            <div className="rule-list">
              {explanation.map((line) => (
                <p className="muted" key={line}>{line}</p>
              ))}
            </div>
            <article className="calculation-card">
              <strong>Deine Gäste sollen schnell verstehen, warum sie wiederkommen.</strong>
              <p className="muted">
                Wir übersetzen deine Antworten in ein einfaches Bonusprogramm, das im Restaurant sofort erklärbar ist.
              </p>
            </article>
            <button className="button" onClick={closeHowItWorks} type="button">
              Verstanden
            </button>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function openDaysSummary(openingHours: Record<Weekday, OpeningDay>) {
  const activeDays = weekdays.filter(({ key }) => openingHours[key].enabled);
  if (activeDays.length === 0) return "Keine Öffnungszeiten";
  if (activeDays.length === 7) return "Alle Wochentage";
  return activeDays.map((day) => day.label).join(", ");
}

function StandardRewardIcon({ asset, size }: { asset: StarterRewardTemplate["asset"]; size: number }) {
  if (asset === "drink") return <CupSoda size={size} />;
  if (asset === "coffee") return <Coffee size={size} />;
  if (asset === "dessert") return <IceCreamBowl size={size} />;
  if (asset === "appetizer") return <Soup size={size} />;
  if (asset === "main") return <Utensils size={size} />;
  if (asset === "menu") return <UtensilsCrossed size={size} />;
  return <Gift size={size} />;
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`check-row${done ? " done" : ""}`}>
      <span>{done ? <Check size={15} /> : "•"}</span>
      <strong>{label}</strong>
    </div>
  );
}

function QrLaunchCard({
  description,
  icon,
  id,
  logoUrl,
  restaurantName,
  subtitle,
  title,
  url,
}: {
  description: string;
  icon: string;
  id: string;
  logoUrl: string;
  restaurantName: string;
  subtitle: string;
  title: string;
  url: string;
}) {
  return (
    <article className="card qr-box-large starter-qr-card">
      <div className="starter-qr-logo">
        {logoUrl ? (
          <img alt={`${restaurantName || "Restaurant"} Logo`} src={logoUrl} />
        ) : (
          <span>
            WUXUAI
            <small>Bonus</small>
          </span>
        )}
      </div>
      <span className="starter-qr-icon" aria-hidden="true">{icon}</span>
      <div className="starter-qr-heading">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="starter-qr-code">
        <QRCodeSVG id={id} value={url} size={178} level="M" />
      </div>
      <p className="starter-qr-description">{description}</p>
    </article>
  );
}
