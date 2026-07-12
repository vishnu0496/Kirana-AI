// Bulk inventory import from a CSV file sent as a WhatsApp document.
// Deliberately CSV-only (no XLSX/PDF parsing) — a shopkeeper's Excel sheet
// exports to CSV in one click, and this needs zero extra dependencies.

export interface ImportRow {
  item: string;
  quantity: number;
  unit: string;
  price?: number;
}

export interface ImportResult {
  rows: ImportRow[];
  skipped: number;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Expects columns "item,quantity,unit,price" (unit/price optional, any
 * column order, header names case-insensitive). Falls back to positional
 * item,quantity,unit,price if no recognizable header row is present.
 */
export function parseInventoryCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const itemIdx = header.indexOf("item");
  const qtyIdx = header.indexOf("quantity");
  const hasHeader = itemIdx !== -1 && qtyIdx !== -1;

  const cols = hasHeader
    ? { item: itemIdx, qty: qtyIdx, unit: header.indexOf("unit"), price: header.indexOf("price") }
    : { item: 0, qty: 1, unit: 2, price: 3 };
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const line of dataLines) {
    const fields = splitCsvLine(line);
    const item = fields[cols.item]?.trim();
    const quantity = Number(fields[cols.qty]);
    if (!item || !Number.isFinite(quantity) || quantity < 0) {
      skipped++;
      continue;
    }
    const unit = cols.unit >= 0 ? (fields[cols.unit]?.trim() ?? "") : "";
    const priceRaw = cols.price >= 0 ? fields[cols.price]?.trim() : "";
    const price = priceRaw ? Number(priceRaw) : undefined;
    rows.push({ item, quantity, unit, price: Number.isFinite(price) ? price : undefined });
  }
  return { rows, skipped };
}
