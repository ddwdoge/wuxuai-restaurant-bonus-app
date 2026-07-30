import { ChangeEvent, DragEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Gift,
  ImagePlus,
  Info,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  completePilotOnboarding,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "../../onboarding/pilotOnboardingService";
import { useTenant } from "../../tenant/TenantProvider";
import { supabase } from "../../../shared/lib/supabase";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { productTerminology } from "../../../config/productTerminology";
import {
  BUSINESS_TYPE_OPTIONS,
  DEFAULT_POINTS_PER_EURO,
  GENEROSITY_OPTIONS,
  REDEMPTION_TYPE_OPTIONS,
  createBonusProgramSuggestion,
  getBusinessProfile,
  getWelcomeGiftOption,
  isKnownBusinessType,
  isProfileWelcomeGiftKey,
  reconcileBusinessProfileSelections,
  type GenerosityKey,
} from "../../../config/businessProfiles";
import { calculateRewardEconomics, isAllowedRedemptionRatePercent } from "../../loyalty/redemptionRate.mjs";
import { RedemptionRateSelect } from "../components/RedemptionRateSelect";
import { OwnerRewardImageUploader } from "../components/OwnerRewardImageUploader";
import { uploadOwnerRewardImage } from "../services/ownerRewardImageService";

type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
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

type OnboardingOutletContext = {
  onboardingAccountAction: ReactNode;
  onboardingRestaurantAction: ReactNode;
};

type LogoColors = {
  primary: string;
  secondary: string;
};

type StarterRewardDraft = {
  key: string;
  title: string;
  description?: string;
  category: string;
  availableProducts: string;
  estimatedValue?: number;
  imageUrl?: string | null;
  active: boolean;
};

type OnboardingForm = {
  restaurantName: string;
  restaurantType: string;
  language: string;
  legalForm: string;
  legalStreet: string;
  legalPostalCode: string;
  legalCity: string;
  legalCountry: string;
  legalEmail: string;
  legalComplaintContact: string;
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
  rewardCategory: string;
  firstRewardTitle: string;
  firstRewardDescription: string;
  firstRewardValue: number;
  pointsPerEuro: number;
  redemptionRatePercent: number;
  generosity: GenerosityKey;
  assistantConfirmed: boolean;
  welcomeGiftKey: string;
  customWelcomeTitle: string;
  customWelcomeDescription: string;
  customWelcomeValue: number;
  starterRewards: StarterRewardDraft[];
  staffName: string;
  staffPin: string;
};

const steps = [
  "Unternehmen",
  "Aussehen",
  "Geöffnet",
  "Punkteeinlösung",
  "Willkommensgeschenke",
  "Rechtliches",
  "Startklar",
];

const stepTitles = [
  "Erzähl uns etwas über dein Unternehmen.",
  "Wie soll dein Unternehmen aussehen?",
  "Wann hast du geöffnet?",
  "Wie sollen Gäste Punkte einlösen?",
  "Welche Willkommensgeschenke möchtest du anbieten?",
  "Rechtliches",
  "Herzlichen Glückwunsch! Dein Unternehmen ist startklar.",
];

const checklistLabels = {
  restaurantDataCompleted: "Unternehmensdaten fertig",
  brandingCompleted: "Aussehen fertig",
  openingHoursCompleted: "Öffnungszeiten fertig",
  bonusProgramCompleted: "Bonusprogramm fertig",
  firstRewardCreated: "Willkommensgeschenke fertig",
  guestTestReady: "Rechtliche Angaben bereit",
  qrReady: "Bonusprogramm bereit",
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

const generosityLabels = Object.fromEntries(
  GENEROSITY_OPTIONS.map((option) => [option.key, option.label]),
) as Record<GenerosityKey, string>;

const defaultOpeningHours: Record<Weekday, OpeningDay> = {
  mon: { enabled: true, open: "11:00", close: "22:00" },
  tue: { enabled: true, open: "11:00", close: "22:00" },
  wed: { enabled: true, open: "11:00", close: "22:00" },
  thu: { enabled: true, open: "11:00", close: "22:00" },
  fri: { enabled: true, open: "11:00", close: "23:00" },
  sat: { enabled: true, open: "12:00", close: "23:00" },
  sun: { enabled: false, open: "12:00", close: "21:00" },
};

function createDefaultForm(): OnboardingForm {
  return {
    restaurantName: "",
    restaurantType: "",
    language: "Deutsch",
    legalForm: "",
    legalStreet: "",
    legalPostalCode: "",
    legalCity: "",
    legalCountry: "Österreich",
    legalEmail: "",
    legalComplaintContact: "",
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
    firstRewardType: "free_item",
    rewardCategory: "",
    firstRewardTitle: "",
    firstRewardDescription: "",
    firstRewardValue: 5,
    pointsPerEuro: DEFAULT_POINTS_PER_EURO,
    redemptionRatePercent: 3,
    generosity: "standard",
    assistantConfirmed: false,
    welcomeGiftKey: "",
    customWelcomeTitle: "",
    customWelcomeDescription: "",
    customWelcomeValue: 0,
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
  const restoredBusinessType = String(draftData?.restaurantType ?? "");
  const profile = getBusinessProfile(restoredBusinessType);
  const firstStarterReward = starterRewards[0];
  const matchingWelcomeGift = firstStarterReward
    ? profile.welcomeGiftOptions.find((option) => option.key === firstStarterReward.key || option.label === firstStarterReward.title)
    : null;
  const legacyGenerosity = String(draftData?.generosity ?? "");
  const mappedGenerosity: GenerosityKey | string = legacyGenerosity === "Sparsam"
    ? "economical"
    : legacyGenerosity === "Großzügig"
      ? "generous"
      : legacyGenerosity === "Premium"
        ? "premium"
        : legacyGenerosity === "Normal"
          ? "standard"
          : legacyGenerosity || "standard";
  const generosity: GenerosityKey = GENEROSITY_OPTIONS.some((option) => option.key === mappedGenerosity)
    ? mappedGenerosity as GenerosityKey
    : "standard";

  return {
    ...defaults,
    ...draftData,
    restaurantType: restoredBusinessType,
    generosity,
    firstRewardType: REDEMPTION_TYPE_OPTIONS.some((option) => option.key === draftData?.firstRewardType)
      ? String(draftData?.firstRewardType)
      : defaults.firstRewardType,
    welcomeGiftKey: draftData?.welcomeGiftKey || matchingWelcomeGift?.key || (firstStarterReward ? "custom" : ""),
    starterRewards: starterRewards.filter((reward) => reward.active !== false).map((reward, index) => ({
      key: reward.key || `starter-reward-${index + 1}`,
      title: reward.title || "Eigene Überraschung",
      description: reward.description || "Willkommensgeschenk für neue Gäste.",
      category: reward.category || "Eigene Überraschung",
      availableProducts: reward.availableProducts || "",
      estimatedValue: Number(reward.estimatedValue) || 0,
      imageUrl: reward.imageUrl || null,
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

function calculateBonus(form: OnboardingForm): BonusCalculation {
  const cleanAverageBill = Math.max(1, form.averageBill || 1);
  const pointsPerEuro = Math.max(1, Math.round(form.pointsPerEuro || DEFAULT_POINTS_PER_EURO));
  const economics = calculateRewardEconomics({
    productPrice: Math.max(1, form.firstRewardValue || 1),
    redemptionRatePercent: form.redemptionRatePercent,
    pointsPerEuro,
  });
  const returnRate = form.redemptionRatePercent / 100;
  const expectedConsumptionEuro = Number(economics.estimatedConsumption.toFixed(2));
  const amountPerPoint = Number((1 / pointsPerEuro).toFixed(4));
  const firstRewardPoints = economics.requiredPoints;
  const rewardValueEuro = Math.max(1, form.firstRewardValue || 1);

  return {
    pointsPerEuro,
    amountPerPoint,
    firstRewardPoints,
    rewardValueEuro,
    expectedConsumptionEuro,
    returnRate,
    returnRatePercent: `${form.redemptionRatePercent} %`,
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
  const { accentColor, height, logoImage, primaryColor, width, x, y } = options;
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
    branding.name || "Dein Unternehmen",
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
  drawWrappedText(context, branding.name || "Dein Unternehmen", canvas.width / 2, nameY, canvas.width - margin * 2 - 104, 76);

  context.fillStyle = branding.primaryColor;
  context.font = "900 122px Inter, Arial, sans-serif";
  drawWrappedText(context, "Starter Kit", canvas.width / 2, titleY, canvas.width - margin * 2 - 104, 140);

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
    name: input.restaurantName || "Dein Unternehmen",
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

function isIndividualStarterReward(reward: StarterRewardDraft) {
  return reward.key.startsWith("custom-")
    || reward.key.startsWith("legacy-")
    || reward.category.startsWith("Eigene")
    || !isProfileWelcomeGiftKey(reward.key);
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
    restaurantDataCompleted: Boolean(
      form.restaurantName.trim()
      && form.restaurantType
      && form.language
      && form.legalForm.trim()
      && form.legalStreet.trim()
      && form.legalPostalCode.trim()
      && form.legalCity.trim()
      && form.legalCountry.trim()
      && form.legalEmail.trim(),
    ),
    brandingCompleted: Boolean(form.primaryColor && form.secondaryColor),
    openingHoursCompleted: weekdays.some(({ key }) => form.openingHours[key].enabled),
    bonusProgramCompleted: Boolean(
      form.averageBill > 0
      && form.firstRewardType
      && form.rewardCategory
      && form.firstRewardTitle.trim()
      && form.assistantConfirmed
      && isAllowedRedemptionRatePercent(form.redemptionRatePercent),
    ),
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
  if (step === 0 && !checklist.restaurantDataCompleted) {
    if (!form.restaurantType) return "Bitte wähle zuerst eine Branche aus.";
    return "Bitte fülle die Pflichtfelder zu deinem Unternehmen aus.";
  }

  if (step === 2 && !checklist.openingHoursCompleted) {
    return "Bitte wähle mindestens einen Öffnungstag.";
  }

  if (step === 3) {
    if (!form.restaurantType) return "Bitte wähle zuerst eine Branche aus.";
    if (!form.firstRewardType) return "Bitte wähle eine Art der Punkteeinlösung aus.";
    if (!form.rewardCategory) return "Bitte wähle eine Belohnungskategorie aus.";
    if (!form.assistantConfirmed) return "Bitte prüfe die empfohlenen Einstellungen.";
  }

  if (step === 4 && form.starterRewards.filter((reward) => reward.title.trim()).length === 0) {
    return "Bitte wähle ein Willkommensgeschenk aus.";
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
  const navigate = useNavigate();
  const { onboardingAccountAction, onboardingRestaurantAction } = useOutletContext<OnboardingOutletContext>();
  const { activeRestaurant, loading: tenantLoading, refreshTenants } = useTenant();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const assistantControlsRef = useRef<HTMLDivElement | null>(null);
  const submissionInFlightRef = useRef(false);
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
  const [customGiftFile, setCustomGiftFile] = useState<File | null>(null);
  const [customGiftPreviewUrl, setCustomGiftPreviewUrl] = useState("");
  const [businessProfileNotice, setBusinessProfileNotice] = useState<string | null>(null);

  const bonus = useMemo(
    () => calculateBonus(form),
    [form],
  );
  const businessProfile = useMemo(() => getBusinessProfile(form.restaurantType), [form.restaurantType]);
  const assistantSuggestion = useMemo(
    () => createBonusProgramSuggestion({
      businessType: form.restaurantType,
      generosity: form.generosity,
      averagePurchase: form.averageBill,
      pointsPerEuro: form.pointsPerEuro,
      redemptionType: form.firstRewardType,
    }),
    [form.averageBill, form.firstRewardType, form.generosity, form.pointsPerEuro, form.restaurantType],
  );

  const visibleLogoUrl = logoPreviewUrl || form.logoUrl;
  const bonusCardColor = lightenColor(form.secondaryColor, 0.72);

  const checklist = useMemo(() => buildChecklist(form, step), [form, step]);
  const progressPercent = Math.round(((step + 1) / steps.length) * 100);

  const allReady = Object.values(checklist).every(Boolean);
  const stepBlocker = getStepBlocker(step, form, checklist);
  const missingItems = missingChecklistItems(checklist);
  const starterRewardConfirmationOpen = step === 4 && form.starterRewards.length > 0 && form.starterRewardConfirmed;
  const explanationDismissedKey = activeRestaurant?.id
    ? `wuxuai:onboarding-how-it-works-dismissed:${activeRestaurant.id}`
    : null;

  const explanation = [
    `${form.restaurantName || "Dein Unternehmen"} bekommt ein eigenes digitales Bonusprogramm.`,
    `Gäste sehen deine Öffnungszeiten: ${openDaysSummary(form.openingHours)}.`,
    `Du planst ${bonus.returnRatePercent} Rückgabe mit ${bonus.pointsPerEuro} Punkten pro Euro.`,
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

        const restoredForm = restoreForm(draft.draftData);
        setForm({
          ...restoredForm,
          restaurantType: restoredForm.restaurantType || activeRestaurant.restaurant_type || "",
        });
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
  }, [activeRestaurant?.id, activeRestaurant?.restaurant_type, navigate, tenantLoading]);

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
    return () => {
      if (customGiftPreviewUrl) URL.revokeObjectURL(customGiftPreviewUrl);
    };
  }, [customGiftPreviewUrl]);

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

  function handleBusinessTypeChange(nextBusinessType: string) {
    setForm((current) => {
      const reconciled = reconcileBusinessProfileSelections({
        businessType: nextBusinessType,
        welcomeGiftKey: current.welcomeGiftKey,
        rewardCategory: current.rewardCategory,
      });
      const nextProfile = getBusinessProfile(nextBusinessType);
      const validGiftKeys = new Set(nextProfile.welcomeGiftOptions.map((option) => option.key));
      const retainedRewards = current.starterRewards.filter((reward) =>
        isIndividualStarterReward(reward)
        || validGiftKeys.has(reward.key),
      );
      return {
        ...current,
        restaurantType: nextBusinessType,
        welcomeGiftKey: reconciled.welcomeGiftKey,
        rewardCategory: reconciled.rewardCategory,
        assistantConfirmed: false,
        starterRewardConfirmed: false,
        starterRewards: retainedRewards,
      };
    });
    setBusinessProfileNotice("Die Branche wurde geändert. Bitte prüfe deine Willkommensgeschenke und Belohnungen.");
  }

  function updateAssistantField(patch: Partial<OnboardingForm>) {
    setForm((current) => ({ ...current, ...patch, assistantConfirmed: false }));
  }

  function applyAssistantSuggestion() {
    const suggestedGift = assistantSuggestion.welcomeGift;
    setForm((current) => {
      const preservedIndividualRewards = current.starterRewards.filter(isIndividualStarterReward);
      const suggestedRewards = suggestedGift
        ? [{
            key: suggestedGift.key,
            title: suggestedGift.label,
            description: suggestedGift.description,
            category: suggestedGift.category,
            availableProducts: "",
            estimatedValue: suggestedGift.estimatedValue,
            imageUrl: null,
            active: true,
          }]
        : [];
      return {
        ...current,
        welcomeGiftKey: suggestedGift?.key ?? current.welcomeGiftKey,
        redemptionRatePercent: assistantSuggestion.redemptionRatePercent,
        pointsPerEuro: assistantSuggestion.pointsPerEuro,
        rewardCategory: assistantSuggestion.rewardCategory,
        firstRewardTitle: assistantSuggestion.rewardTitle,
        firstRewardDescription: assistantSuggestion.description,
        firstRewardValue: assistantSuggestion.estimatedValue,
        assistantConfirmed: true,
        starterRewardConfirmed: false,
        starterRewards: [...preservedIndividualRewards, ...suggestedRewards],
      };
    });
    setStatus("Empfohlene Einstellungen übernommen.");
  }

  function handleWelcomeGiftSelection(key: string) {
    const selected = getWelcomeGiftOption(businessProfile, key);
    setForm((current) => {
      const preservedIndividualRewards = current.starterRewards.filter(isIndividualStarterReward);
      return {
        ...current,
        welcomeGiftKey: key,
        starterRewardConfirmed: false,
        starterRewards: selected && selected.key !== "custom"
          ? [...preservedIndividualRewards, {
              key: selected.key,
              title: selected.label,
              description: selected.description,
              category: selected.category,
              availableProducts: "",
              estimatedValue: selected.estimatedValue,
              imageUrl: null,
              active: true,
            }]
          : preservedIndividualRewards,
      };
    });
  }

  function handleCustomGiftFile(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setCustomGiftPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return previewUrl;
    });
    setCustomGiftFile(file);
  }

  function addCustomWelcomeGift() {
    const title = form.customWelcomeTitle.trim();
    if (!title) {
      setStatus("Bitte gib eine Bezeichnung für deine eigene Auswahl ein.");
      return;
    }
    if (title.length > 80) {
      setStatus("Die Bezeichnung darf maximal 80 Zeichen lang sein.");
      return;
    }
    setForm((current) => ({
      ...current,
      welcomeGiftKey: "custom",
      starterRewardConfirmed: false,
      starterRewards: [
        ...current.starterRewards.filter((reward) => reward.key !== "custom-welcome-gift"),
        {
          key: "custom-welcome-gift",
          title,
          description: current.customWelcomeDescription.trim() || "Persönliches Willkommensgeschenk für neue Gäste.",
          category: "Eigene Auswahl",
          availableProducts: title,
          estimatedValue: Math.max(0, current.customWelcomeValue || 0),
          imageUrl: current.starterRewards.find((reward) => reward.key === "custom-welcome-gift")?.imageUrl ?? null,
          active: true,
        },
      ],
    }));
    setStatus("Eigene Auswahl übernommen.");
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
    if (submissionInFlightRef.current) {
      return;
    }

    if (!allReady) {
      setStatus("Bitte die offenen Punkte in der Checkliste abschließen.");
      return;
    }

    if (!activeRestaurant?.id) {
      setStatus("Das bestehende Unternehmen konnte nicht aktiviert werden.");
      return;
    }

    submissionInFlightRef.current = true;
    setSaving(true);
    setStatus(null);

    try {
      let completedForm = form;
      if (customGiftFile) {
        const uploaded = await uploadOwnerRewardImage({
          restaurantId: activeRestaurant.id,
          folder: "starter-rewards",
          entityId: "onboarding-custom-welcome",
          file: customGiftFile,
        });
        completedForm = {
          ...form,
          starterRewards: form.starterRewards.map((reward) => reward.key === "custom-welcome-gift"
            ? { ...reward, imageUrl: uploaded.publicUrl }
            : reward),
        };
      }
      const result = await completePilotOnboarding({
        restaurantId: activeRestaurant.id,
        restaurantName: completedForm.restaurantName.trim(),
        restaurantType: completedForm.restaurantType,
        language: completedForm.language,
        logoUrl: completedForm.logoUrl || null,
        primaryColor: completedForm.primaryColor,
        secondaryColor: completedForm.secondaryColor,
        buttonColor: completedForm.primaryColor,
        openingHours: completedForm.openingHours,
        specialDays: linesToList(completedForm.specialDays),
        holidays: linesToList(completedForm.holidays),
        smartOpenEnabled: completedForm.smartOpenEnabled,
        onboardingChecklist: checklist,
        loyaltyMode: "amount_based",
        amountPerPoint: bonus.amountPerPoint,
        redemptionReturnRate: bonus.returnRate,
        amountTierPoints: bonus.amountTierPoints,
        starterRewards: completedForm.starterRewards.map((reward) => ({
          key: reward.key,
          title: reward.title.trim(),
          description: reward.description?.trim() || "Willkommensgeschenk für neue Gäste.",
          category: reward.category,
          products: linesToList(reward.availableProducts),
          estimatedValue: reward.estimatedValue ?? null,
          imageUrl: reward.imageUrl ?? null,
          active: true,
        })),
        staffName: form.staffName,
        staffPin: form.staffPin,
        legalProfile: {
          company_name: form.restaurantName.trim(),
          legal_form: form.legalForm.trim(),
          street: form.legalStreet.trim(),
          postal_code: form.legalPostalCode.trim(),
          city: form.legalCity.trim(),
          country: form.legalCountry.trim(),
          email: form.legalEmail.trim(),
          complaint_contact: form.legalComplaintContact.trim() || form.legalEmail.trim(),
        },
      });
      setForm(completedForm);
      await saveOnboardingDraft(activeRestaurant.id, steps.length - 1, completedForm, checklist);
      await refreshTenants();
      setStatus(`${result.restaurant.name} ist startklar.`);
      setStep(steps.length - 1);
      navigate("/admin", { replace: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unternehmen konnte nicht aktiviert werden.");
    } finally {
      submissionInFlightRef.current = false;
      setSaving(false);
    }
  }

  if (tenantLoading || draftLoading) {
    return <div className="auth-shell">Onboarding wird geladen …</div>;
  }

  if (!activeRestaurant) {
    return <div className="auth-shell">Kein Unternehmen gefunden.</div>;
  }

  return (
    <>
      <header className="installation-header">
        <div className="installation-header-copy">
          <span className="installation-eyebrow">{productTerminology.business} einrichten</span>
          <h1>Willkommen! In wenigen Minuten startet dein digitales Bonusprogramm.</h1>
          <p>Gleich bereit für deine Gäste.</p>
        </div>
        <div className="installation-header-actions">
          {onboardingRestaurantAction}
          <button
            aria-label="So funktioniert die Einrichtung"
            className="button secondary installation-help-action"
            onClick={() => setHowItWorksOpen(true)}
            type="button"
          >
            <Info size={17} />
            <span className="installation-help-label">So funktioniert's</span>
          </button>
          {onboardingAccountAction}
        </div>
      </header>

      <section className="onboarding-progress" aria-labelledby="onboarding-progress-title">
        <div className="onboarding-progress-copy">
          <div>
            <span>Schritt {step + 1} von {steps.length}</span>
            <h2 id="onboarding-progress-title">{stepTitles[step]}</h2>
          </div>
          <span>{progressPercent} % abgeschlossen</span>
        </div>
        <div
          aria-label={`${progressPercent} Prozent abgeschlossen`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          className="onboarding-progress-track"
          role="progressbar"
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        {saving ? <span className="onboarding-saving-status" role="status">Änderungen werden gespeichert...</span> : null}
      </section>

      <section className="onboarding-layout">
        <form className="card onboarding-card installation-card form" onSubmit={handleSubmit}>
          {step === 0 ? (
            <section className="wizard-screen">
              <div className="field">
                <label htmlFor="restaurant-name">Wie heißt dein Unternehmen?</label>
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
                  <label htmlFor="restaurant-type">{productTerminology.businessType}</label>
                  <select
                    aria-describedby={businessProfileNotice ? "business-profile-notice" : undefined}
                    className="select input-large premium-business-select"
                    id="restaurant-type"
                    required
                    value={form.restaurantType}
                    onChange={(event) => handleBusinessTypeChange(event.target.value)}
                  >
                    <option value="">Branche auswählen</option>
                    {!isKnownBusinessType(form.restaurantType) && form.restaurantType ? (
                      <option value={form.restaurantType}>Bestehende Branche: {form.restaurantType}</option>
                    ) : null}
                    {BUSINESS_TYPE_OPTIONS.map((option) => (
                      <option key={option.key} value={option.label}>{option.label}</option>
                    ))}
                  </select>
                  {businessProfileNotice ? <p className="field-note" id="business-profile-notice" role="status">{businessProfileNotice}</p> : null}
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
              <div className="onboarding-legal-fields">
                <div>
                  <span className="premium-dashboard-kicker">Rechtliche Angaben</span>
                  <h3>Damit dein Bonusprogramm direkt starten kann</h3>
                  <p className="muted">Aus diesen Stammdaten erstellt WUXUAI automatisch deine rechtlichen Dokumente. Eigene Rechtstexte musst du hier nicht schreiben.</p>
                </div>
                <div className="grid two">
                  <div className="field">
                    <label htmlFor="legal-form">Rechtsform</label>
                    <input className="input" id="legal-form" onChange={(event) => setForm((current) => ({ ...current, legalForm: event.target.value }))} placeholder="z. B. Einzelunternehmen" value={form.legalForm} />
                  </div>
                  <div className="field">
                    <label htmlFor="legal-email">Kontakt-E-Mail</label>
                    <input className="input" id="legal-email" onChange={(event) => setForm((current) => ({ ...current, legalEmail: event.target.value }))} type="email" value={form.legalEmail} />
                  </div>
                  <div className="field">
                    <label htmlFor="legal-street">Straße und Hausnummer</label>
                    <input className="input" id="legal-street" onChange={(event) => setForm((current) => ({ ...current, legalStreet: event.target.value }))} value={form.legalStreet} />
                  </div>
                  <div className="field">
                    <label htmlFor="legal-postal-code">Postleitzahl</label>
                    <input className="input" id="legal-postal-code" inputMode="numeric" onChange={(event) => setForm((current) => ({ ...current, legalPostalCode: event.target.value }))} value={form.legalPostalCode} />
                  </div>
                  <div className="field">
                    <label htmlFor="legal-city">Ort</label>
                    <input className="input" id="legal-city" onChange={(event) => setForm((current) => ({ ...current, legalCity: event.target.value }))} value={form.legalCity} />
                  </div>
                  <div className="field">
                    <label htmlFor="legal-country">Land</label>
                    <input className="input" id="legal-country" onChange={(event) => setForm((current) => ({ ...current, legalCountry: event.target.value }))} value={form.legalCountry} />
                  </div>
                </div>
                <details className="advanced-panel">
                  <summary>Beschwerdekontakt optional anpassen</summary>
                  <div className="field">
                    <label htmlFor="legal-complaint-contact">Beschwerdekontakt</label>
                    <input className="input" id="legal-complaint-contact" onChange={(event) => setForm((current) => ({ ...current, legalComplaintContact: event.target.value }))} placeholder={form.legalEmail || "Kontakt-E-Mail wird verwendet"} value={form.legalComplaintContact} />
                    <p className="muted">Wenn du nichts einträgst, verwenden wir deine Kontakt-E-Mail.</p>
                  </div>
                </details>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="wizard-screen">
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
                    <img alt={`${form.restaurantName || "Unternehmen"} Logo`} src={visibleLogoUrl} />
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
                          alt={`${form.restaurantName || "Unternehmen"} Logo`}
                          src={visibleLogoUrl}
                        />
                      ) : (
                        <span className="restaurant-logo-placeholder" style={{ background: bonusCardColor }}>
                          {(form.restaurantName.trim().charAt(0) || "R").toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div className="restaurant-brand-copy">
                      <h3 className="restaurant-brand-title">{form.restaurantName || "Dein Unternehmen"}</h3>
                      <p className="restaurant-brand-subtitle">Mein Bonus</p>
                    </div>
                  </div>
                  <div className="bonus-preview-card" style={{ background: bonusCardColor, borderColor: form.secondaryColor }}>
                    <span>Deine Bonuskarte</span>
                    <strong style={{ color: form.primaryColor }}>0 Punkte</strong>
                    <p>Punkteeinlösungen sammeln und beim nächsten Besuch einlösen.</p>
                  </div>
                  <span
                    className="button customer-primary-button onboarding-preview-button"
                    style={{ background: form.primaryColor }}
                  >
                    Bonus öffnen
                  </span>
                </article>
              </section>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="wizard-screen">
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
              <p className="muted">Wähle die wichtigsten Eckpunkte. WUXUAI erstellt daraus einen Vorschlag, den du vor dem Weitergehen bestätigst.</p>
              <div className="grid two business-assistant-controls" ref={assistantControlsRef}>
                <div className="field">
                  <label htmlFor="average-bill">Was gibt ein Gast durchschnittlich aus?</label>
                  <input
                    className="input input-large"
                    id="average-bill"
                    min="1"
                    step="0.5"
                    type="number"
                    value={form.averageBill}
                    onChange={(event) => updateAssistantField({ averageBill: Number(event.target.value) || 1 })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="generosity">Wie großzügig soll dein Bonusprogramm sein?</label>
                  <select className="select input-large" id="generosity" value={form.generosity} onChange={(event) => updateAssistantField({ generosity: event.target.value as GenerosityKey })}>
                    {GENEROSITY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="first-reward-type">Wie sollen Punkte eingelöst werden?</label>
                  <select className="select input-large" id="first-reward-type" value={form.firstRewardType} onChange={(event) => updateAssistantField({ firstRewardType: event.target.value })}>
                    <option value="">Art der Punkteeinlösung auswählen</option>
                    {REDEMPTION_TYPE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="reward-category">Belohnungskategorie</label>
                  <select className="select input-large" id="reward-category" value={form.rewardCategory} onChange={(event) => updateAssistantField({ rewardCategory: event.target.value })}>
                    <option value="">Kategorie auswählen</option>
                    {businessProfile.redemptionCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="points-per-euro">Punkte pro Euro</label>
                  <input className="input input-large" id="points-per-euro" inputMode="numeric" min="1" max="100" type="number" value={form.pointsPerEuro} onChange={(event) => updateAssistantField({ pointsPerEuro: Math.max(1, Number(event.target.value) || DEFAULT_POINTS_PER_EURO) })} />
                  <small>Standard: 1 € = 10 Punkte</small>
                </div>
                <RedemptionRateSelect id="onboarding-redemption-rate" value={form.redemptionRatePercent} onChange={(value) => updateAssistantField({ redemptionRatePercent: value })} />
              </div>

              <article className={`business-assistant-card${form.assistantConfirmed ? " confirmed" : ""}`} aria-live="polite">
                <div className="business-assistant-heading">
                  <div><span className="premium-dashboard-kicker">Empfohlene Einrichtung</span><h3>{assistantSuggestion.businessType} · {generosityLabels[form.generosity]}</h3></div>
                  {form.assistantConfirmed ? <span className="business-assistant-status"><Check aria-hidden="true" size={16} /> Bestätigt</span> : null}
                </div>
                <dl className="business-assistant-summary">
                  <div><dt>Willkommensgeschenk</dt><dd>{assistantSuggestion.welcomeGift?.label ?? "Eigene Auswahl"}</dd></div>
                  <div><dt>Erste Belohnung</dt><dd>{assistantSuggestion.rewardTitle}</dd></div>
                  <div><dt>Einlösequote</dt><dd>{assistantSuggestion.redemptionRatePercent} %</dd></div>
                  <div><dt>Punkte pro Euro</dt><dd>{assistantSuggestion.pointsPerEuro}</dd></div>
                  <div><dt>Benötigte Punkte</dt><dd>{assistantSuggestion.requiredPoints}</dd></div>
                  <div><dt>Einordnung</dt><dd>{assistantSuggestion.economicsStatus}</dd></div>
                </dl>
                <div className="business-assistant-actions">
                  <button className="button primary" onClick={applyAssistantSuggestion} type="button">Vorschlag übernehmen</button>
                  <button className="button secondary" onClick={() => { setForm((current) => ({ ...current, assistantConfirmed: false })); assistantControlsRef.current?.querySelector<HTMLElement>("input, select")?.focus(); }} type="button">Anpassen</button>
                </div>
              </article>

              <div className="business-assistant-adjustments">
                <div className="field">
                  <label htmlFor="first-reward-title">Erste Belohnung</label>
                  <input className="input" id="first-reward-title" maxLength={80} value={form.firstRewardTitle} onChange={(event) => updateAssistantField({ firstRewardTitle: event.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="first-reward-value">Geschätzter Produktwert</label>
                  <input className="input" id="first-reward-value" min="1" step="0.5" type="number" value={form.firstRewardValue} onChange={(event) => updateAssistantField({ firstRewardValue: Math.max(1, Number(event.target.value) || 1) })} />
                </div>
                <div className="field full">
                  <label htmlFor="first-reward-description">Kurze Beschreibung</label>
                  <textarea className="textarea" id="first-reward-description" maxLength={180} value={form.firstRewardDescription} onChange={(event) => updateAssistantField({ firstRewardDescription: event.target.value })} />
                </div>
                {!form.assistantConfirmed ? (
                  <button
                    className="button secondary business-assistant-confirm"
                    disabled={!form.firstRewardType || !form.rewardCategory || !form.firstRewardTitle.trim()}
                    onClick={() => { setForm((current) => ({ ...current, assistantConfirmed: true })); setStatus("Einstellungen bestätigt."); }}
                    type="button"
                  >
                    Einstellungen bestätigen
                  </button>
                ) : null}
              </div>
              <article className="calculation-card">
                <strong>Wirtschaftliche Einordnung</strong>
                <p className="muted">Für {formatEuro(bonus.rewardValueEuro, true)} Gegenwert werden bei {bonus.returnRatePercent} ungefähr {formatEuro(bonus.expectedConsumptionEuro, true)} Konsumation und {bonus.firstRewardPoints} Punkte benötigt.</p>
                <p className="muted">Die Werte sind ein Vorschlag. Alte Belohnungen werden nicht neu berechnet.</p>
              </article>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="wizard-screen">
              <article className="calculation-card">
                <strong>Welches Willkommensgeschenk passt zu deinem Unternehmen?</strong>
                <p className="muted">Du siehst nur Vorschläge für {businessProfile.label}. Bestehende individuelle Geschenke bleiben erhalten.</p>
              </article>

              {!starterRewardConfirmationOpen ? (
                <div className="welcome-gift-selector">
                  <div className="field">
                    <label htmlFor="welcome-gift">Willkommensgeschenk auswählen</label>
                    <select className="select input-large" id="welcome-gift" value={form.welcomeGiftKey} onChange={(event) => handleWelcomeGiftSelection(event.target.value)}>
                      <option value="">Willkommensgeschenk auswählen</option>
                      {businessProfile.welcomeGiftOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                  </div>

                  {form.welcomeGiftKey === "custom" ? (
                    <section className="custom-welcome-gift" aria-labelledby="custom-welcome-title">
                      <div><h3 id="custom-welcome-title">Eigene Auswahl</h3><p className="muted">Die Bezeichnung ist erforderlich. Beschreibung, Wert und Bild sind optional.</p></div>
                      <div className="grid two">
                        <div className="field"><label htmlFor="custom-welcome-name">Bezeichnung</label><input className="input" id="custom-welcome-name" maxLength={80} value={form.customWelcomeTitle} onChange={(event) => setForm((current) => ({ ...current, customWelcomeTitle: event.target.value, starterRewardConfirmed: false }))} /></div>
                        <div className="field"><label htmlFor="custom-welcome-value">Geschätzter Wert</label><input className="input" id="custom-welcome-value" min="0" step="0.5" type="number" value={form.customWelcomeValue || ""} onChange={(event) => setForm((current) => ({ ...current, customWelcomeValue: Math.max(0, Number(event.target.value) || 0), starterRewardConfirmed: false }))} /></div>
                        <div className="field full"><label htmlFor="custom-welcome-description">Kurze Beschreibung</label><textarea className="textarea" id="custom-welcome-description" maxLength={180} value={form.customWelcomeDescription} onChange={(event) => setForm((current) => ({ ...current, customWelcomeDescription: event.target.value, starterRewardConfirmed: false }))} /></div>
                      </div>
                      <OwnerRewardImageUploader
                        categoryIcon={<Gift aria-hidden="true" size={42} />}
                        imageUrl={form.starterRewards.find((reward) => reward.key === "custom-welcome-gift")?.imageUrl}
                        label={form.customWelcomeTitle || "eigene Auswahl"}
                        onFileSelected={handleCustomGiftFile}
                        onRemove={() => { setCustomGiftFile(null); setCustomGiftPreviewUrl(""); }}
                        previewUrl={customGiftPreviewUrl || null}
                      />
                      <button className="button secondary" onClick={addCustomWelcomeGift} type="button">Eigene Auswahl übernehmen</button>
                    </section>
                  ) : null}

                  {form.starterRewards.length ? (
                    <div className="selected-welcome-gifts" aria-live="polite">
                      <strong>Ausgewählt</strong>
                      {form.starterRewards.map((reward) => <div key={reward.key}><Check aria-hidden="true" size={17} /><span>{reward.title}</span><small>{reward.category}</small></div>)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <article className="starter-confirmation-card">
                  <h3>Du hast ausgewählt:</h3>
                  <div className="rule-list">
                    {form.starterRewards.map((reward) => (
                      <ChecklistRow done label={reward.title} key={reward.key} />
                    ))}
                  </div>
                  <p className="muted">
                    Diese Auswahl wird beim Abschluss als Willkommensgeschenk eingerichtet. Details kannst du später weiterhin bearbeiten.
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
              <article className="calculation-card">
                <strong>Rechtliche Angaben</strong>
                <p className="muted">
                  Aus deinen Unternehmensdaten werden Teilnahmebedingungen, Datenschutzhinweise und Bonusregeln vorbereitet.
                </p>
              </article>
              <div className="rule-list">
                <ChecklistRow done={Boolean(form.restaurantName.trim())} label="Unternehmensname gespeichert" />
                <ChecklistRow done={Boolean(form.legalForm.trim())} label="Rechtsform gespeichert" />
                <ChecklistRow done={Boolean(form.legalStreet.trim() && form.legalPostalCode.trim() && form.legalCity.trim())} label="Unternehmensadresse gespeichert" />
                <ChecklistRow done={Boolean(form.legalEmail.trim())} label="Kontakt-E-Mail gespeichert" />
              </div>
              <p className="muted">Vorlage – rechtliche Prüfung empfohlen. Die Veröffentlichung erfolgt erst über den bestehenden Freigabeprozess.</p>
            </section>
          ) : null}

          {step === 6 ? (
            <section className="wizard-screen onboarding-completion-screen">
              <div className="rule-list">
                <ChecklistRow done={checklist.restaurantDataCompleted} label={checklistLabels.restaurantDataCompleted} />
                <ChecklistRow done={checklist.brandingCompleted} label={checklistLabels.brandingCompleted} />
                <ChecklistRow done={checklist.openingHoursCompleted} label={checklistLabels.openingHoursCompleted} />
                <ChecklistRow done={checklist.bonusProgramCompleted} label={checklistLabels.bonusProgramCompleted} />
                <ChecklistRow done={checklist.firstRewardCreated} label={checklistLabels.firstRewardCreated} />
                <ChecklistRow done={checklist.guestTestReady} label={checklistLabels.guestTestReady} />
                <ChecklistRow done={checklist.qrReady} label={checklistLabels.qrReady} />
                <ChecklistRow done={checklist.restaurantDataCompleted} label="Rechtliche Stammdaten gespeichert" />
                <ChecklistRow done={checklist.restaurantDataCompleted} label="Teilnahmebedingungen vorbereitet" />
                <ChecklistRow done={checklist.restaurantDataCompleted} label="Datenschutzerklärung vorbereitet" />
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
                Unternehmen aktivieren
              </button>
            )}
          </div>

          {stepBlocker && step < steps.length - 1 ? <p className="status-message">{stepBlocker}</p> : null}
          {status ? <p className="status-message">{status}</p> : null}
        </form>
      </section>

      <AppDrawer
        description="Die wichtigsten Schritte deines Bonusprogramms."
        footer={<button className="button" onClick={closeHowItWorks} type="button">Verstanden</button>}
        onClose={closeHowItWorks}
        open={howItWorksOpen}
        size="compact"
        title="So funktioniert's"
      >
        <div className="rule-list">
          {explanation.map((line) => (
            <p className="muted" key={line}>{line}</p>
          ))}
        </div>
        <article className="calculation-card">
          <strong>Deine Gäste sollen schnell verstehen, warum sie wiederkommen.</strong>
          <p className="muted">
            Wir übersetzen deine Antworten in ein einfaches Bonusprogramm, das im Geschäft sofort erklärbar ist.
          </p>
        </article>
      </AppDrawer>
    </>
  );
}

function openDaysSummary(openingHours: Record<Weekday, OpeningDay>) {
  const activeDays = weekdays.filter(({ key }) => openingHours[key].enabled);
  if (activeDays.length === 0) return "Keine Öffnungszeiten";
  if (activeDays.length === 7) return "Alle Wochentage";
  return activeDays.map((day) => day.label).join(", ");
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
          <img alt={`${restaurantName || "Unternehmen"} Logo`} src={logoUrl} />
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

// Die Druckerzeugung bleibt bis zur vollständigen Konsolidierung im QR Center verfügbar,
// wird im Onboarding aber bewusst nicht mehr angeboten.
void downloadRestaurantStarterKit;
void QrLaunchCard;
