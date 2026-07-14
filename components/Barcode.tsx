"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  format?: string;
}

/**
 * Renders a barcode SVG for the given value using JsBarcode.
 * Defaults to CODE128 format which supports alphanumeric strings.
 */
export default function Barcode({ value, width = 1.5, height = 40, displayValue = true, format = "CODE128" }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          background: "transparent",
          lineColor: "#ffffff",
          margin: 5,
          fontSize: 12,
          textMargin: 2,
        });
      } catch {
        // Invalid barcode value — silently fail
      }
    }
  }, [value, width, height, displayValue, format]);

  if (!value) return null;

  return <svg ref={svgRef} />;
}
