import type { QRCodeSVG } from "qrcode.react";
import { type ComponentProps, lazy, Suspense } from "react";

/// Fetches the encoder ahead of the first code, e.g. when its trigger is hovered.
export const preloadQrCode = () => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG }));

const QrCodeSvg = lazy(preloadQrCode);

export interface QrCodeProps
  extends Pick<ComponentProps<typeof QRCodeSVG>, "marginSize" | "title"> {
  value: string;
  /// Side of the square, in pixels.
  size: number;
}

/// A QR code whose encoder loads with the first one shown.
export function QrCode({ size, ...rest }: QrCodeProps) {
  return (
    // The fallback holds the code's box, so what surrounds it does not jump when it lands.
    <Suspense fallback={<span style={{ width: size, height: size }} />}>
      {/* Literal colours: a scanner needs dark modules on light in any theme. */}
      <QrCodeSvg size={size} bgColor="#ffffff" fgColor="#14110E" level="M" {...rest} />
    </Suspense>
  );
}
