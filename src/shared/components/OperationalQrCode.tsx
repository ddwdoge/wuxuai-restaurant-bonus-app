import { QRCodeSVG } from "qrcode.react";
import { OPERATIONAL_QR_CONFIG } from "../lib/operationalQr.mjs";

type OperationalQrCodeProps = {
  id: string;
  title: string;
  value: string;
};

export function OperationalQrCode({ id, title, value }: OperationalQrCodeProps) {
  return (
    <QRCodeSVG
      bgColor={OPERATIONAL_QR_CONFIG.backgroundColor}
      className="operational-qr-code"
      fgColor={OPERATIONAL_QR_CONFIG.foregroundColor}
      id={id}
      level={OPERATIONAL_QR_CONFIG.errorCorrectionLevel}
      marginSize={OPERATIONAL_QR_CONFIG.marginModules}
      size={OPERATIONAL_QR_CONFIG.screenSize}
      title={title}
      value={value}
    />
  );
}
