"use client";

/**
 * A QR code drawn on the device (the `qrcode` library, rendered to SVG).
 * Replaces the third-party QR image service the link cards used, so an
 * organisation's survey links are never sent to an outside server just to
 * draw a picture of them. Error correction "M" survives a creased,
 * sun-faded card on a camp noticeboard.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#22252b", light: "#ffffff" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: size }}
      className="[&>svg]:h-full [&>svg]:w-full"
      // The SVG comes from the qrcode library for a URL we built ourselves — no user HTML.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
