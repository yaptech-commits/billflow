"use client";

export type ThermalWidth = 58 | 80;

export interface BluetoothReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface BluetoothReceiptPayload {
  businessName: string;
  invoiceNumber: string;
  issuedAt: Date;
  customerName: string;
  items: BluetoothReceiptItem[];
  subtotal: number;
  discountAmount?: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  currencyCode: string;
}

type BluetoothCharacteristic = {
  writeValue: (value: BufferSource) => Promise<void>;
};

type BluetoothDevice = {
  name?: string;
  gatt?: {
    connect: () => Promise<{ getPrimaryService: (service: string) => Promise<{ getCharacteristic: (characteristic: string) => Promise<BluetoothCharacteristic> }> }>;
  };
};

type BluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices: boolean;
      optionalServices: string[];
    }) => Promise<BluetoothDevice>;
  };
};

const SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

const CHARACTERISTIC_UUIDS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
  "49535343-1e4d-4bd9-ba61-23c647249616",
];

export function isBluetoothPrintingSupported() {
  return typeof window !== "undefined" && "bluetooth" in navigator && Boolean((navigator as BluetoothNavigator).bluetooth);
}

function money(value: number, currency: string) {
  return `${currency} ${value.toFixed(2)}`;
}

function padLine(left: string, right: string, width: number) {
  const safeLeft = left.length > width - right.length - 1 ? `${left.slice(0, Math.max(0, width - right.length - 4))}...` : left;
  const spaces = Math.max(1, width - safeLeft.length - right.length);
  return `${safeLeft}${" ".repeat(spaces)}${right}`;
}

function centerLine(value: string, width: number) {
  if (value.length >= width) return value.slice(0, width);
  const left = Math.floor((width - value.length) / 2);
  return `${" ".repeat(left)}${value}`;
}

function buildReceiptText(payload: BluetoothReceiptPayload, width: ThermalWidth) {
  const columns = width === 58 ? 32 : 48;
  const divider = "-".repeat(columns);
  const lines: string[] = [];
  lines.push("\x1b@", "\x1ba\x01", "\x1bE\x01");
  lines.push(centerLine(payload.businessName.toUpperCase(), columns));
  lines.push("\x1bE\x00", centerLine("INVOICE", columns));
  lines.push(centerLine(`#${payload.invoiceNumber}`, columns));
  lines.push(centerLine(payload.issuedAt.toLocaleString(), columns));
  lines.push("\x1ba\x00", divider);
  lines.push(`Bill to: ${payload.customerName}`);
  lines.push(`Payment: ${payload.paymentMethod.toUpperCase()}`);
  lines.push(divider);
  for (const item of payload.items) {
    lines.push(padLine(item.name, money(item.quantity * item.unitPrice, payload.currencyCode), columns));
    lines.push(`  ${item.quantity} x ${money(item.unitPrice, payload.currencyCode)}`);
  }
  lines.push(divider);
  lines.push(padLine("Subtotal", money(payload.subtotal, payload.currencyCode), columns));
  if ((payload.discountAmount || 0) > 0) {
    lines.push(padLine("Discount", `-${money(payload.discountAmount || 0, payload.currencyCode)}`, columns));
  }
  lines.push(padLine("Tax", money(payload.taxAmount, payload.currencyCode), columns));
  lines.push("\x1bE\x01", padLine("TOTAL", money(payload.total, payload.currencyCode), columns), "\x1bE\x00");
  if (payload.amountPaid !== undefined) lines.push(padLine("Paid", money(payload.amountPaid, payload.currencyCode), columns));
  if ((payload.change || 0) > 0) lines.push(padLine("Change", money(payload.change || 0, payload.currencyCode), columns));
  lines.push("", centerLine("Thank you for your business!", columns), "\n\n\n", "\x1dV\x00");
  return lines.join("\n");
}

async function findPrinterCharacteristic(server: Awaited<ReturnType<NonNullable<BluetoothDevice["gatt"]>["connect"]>>) {
  for (const serviceUuid of SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      for (const characteristicUuid of CHARACTERISTIC_UUIDS) {
        try {
          return await service.getCharacteristic(characteristicUuid);
        } catch {
          // Try the next characteristic used by common portable ESC/POS printers.
        }
      }
    } catch {
      // Try the next service used by common portable ESC/POS printers.
    }
  }
  throw new Error("The selected printer does not expose a supported ESC/POS Bluetooth service.");
}

export async function printReceiptOverBluetooth(payload: BluetoothReceiptPayload, width: ThermalWidth) {
  if (!isBluetoothPrintingSupported()) {
    throw new Error("Bluetooth printing is not supported in this browser. Use Chrome on Android or the regular Print button.");
  }
  const bluetooth = (navigator as BluetoothNavigator).bluetooth!;
  const device = await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICE_UUIDS });
  if (!device.gatt) throw new Error("This Bluetooth printer does not support GATT connections.");
  const server = await device.gatt.connect();
  const characteristic = await findPrinterCharacteristic(server);
  const bytes = new TextEncoder().encode(buildReceiptText(payload, width));
  const chunkSize = 180;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    await characteristic.writeValue(bytes.slice(offset, offset + chunkSize));
  }
}
