import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

export type ExportBranding = {
  appName?: string;
  companyName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  footer?: string;
};

export type ExportTable = {
  title: string;
  subtitle?: string;
  meta?: string[];
  summary?: Array<{ label: string; value: string | number }>;
  headers: string[];
  rows: Array<Array<string | number>>;
  footer?: string;
  branding?: ExportBranding;
};

const defaultBrand = {
  green: "1268F3",
  greenDark: "0A1F4D",
  sun: "F4B51C",
  mint: "EEF6FF",
  line: "DCE4F0",
  text: "1F2937",
  muted: "64748B",
  row: "F8FAFC",
};

const defaultCompanyName = "NexPonto";
const defaultSystemName = "Sistema de Ponto e RH";

function hex(value: string | undefined, fallback: string) {
  const normalized = String(value || "").replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function resolveBrand(table: ExportTable) {
  return {
    green: hex(table.branding?.primaryColor, defaultBrand.green),
    greenDark: hex(table.branding?.primaryColor, defaultBrand.greenDark),
    sun: hex(table.branding?.secondaryColor, defaultBrand.sun),
    mint: hex(table.branding?.backgroundColor, defaultBrand.mint),
    line: defaultBrand.line,
    text: defaultBrand.text,
    muted: defaultBrand.muted,
    row: defaultBrand.row,
  };
}

function logoPath() {
  const png = path.join(process.cwd(), "public", "nexponto-mark.png");
  const jpeg = path.join(process.cwd(), "public", "nexponto-mark.jpg");
  return fs.existsSync(png) ? png : jpeg;
}

function hasLogo() {
  try {
    return fs.existsSync(logoPath());
  } catch {
    return false;
  }
}

function readLogoForExcel() {
  try {
    const file = logoPath();
    return { buffer: fs.readFileSync(file), extension: file.toLowerCase().endsWith(".png") ? "png" as const : "jpeg" as const };
  } catch {
    return null;
  }
}

function isPayrollTable(table: ExportTable) {
  return table.title.toLowerCase().includes("folha");
}

function safeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function maybeWrapText(value: unknown, max = 42) {
  const text = safeText(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const first = cut.slice(0, lastSpace > 18 ? lastSpace : max).trim();
  const rest = text.slice(first.length).trim();
  return `${first}\n${rest.length > max ? `${rest.slice(0, max - 1)}…` : rest}`;
}

function isNumericLike(value: string) {
  return /^-?\d+([,.]\d+)?$/.test(value) || /^-?R\$/.test(value) || /^(sim|não|valid|draft|pago|paga)$/i.test(value);
}

function collectPdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function writePdfHeader(doc: PDFKit.PDFDocument, table: ExportTable) {
  const brand = resolveBrand(table);
  const companyName = table.branding?.companyName || table.branding?.appName || defaultCompanyName;
  const width = doc.page.width;
  const headerHeight = isPayrollTable(table) ? 108 : 96;
  doc.save();
  doc.rect(0, 0, width, headerHeight).fill(`#${brand.greenDark}`);
  doc.rect(0, headerHeight - 6, width, 6).fill(`#${brand.sun}`);
  doc.circle(width - 76, 40, 70).fillOpacity(0.10).fill(`#${brand.sun}`).fillOpacity(1);
  doc.circle(width - 36, 88, 46).fillOpacity(0.09).fill("#FFFFFF").fillOpacity(1);

  if (hasLogo()) {
    try {
      doc.roundedRect(34, 20, 64, 64, 14).fill("#FFFFFF");
      doc.image(fs.readFileSync(logoPath()), 41, 27, {
        fit: [50, 50],
        align: "center",
        valign: "center",
      });
    } catch {
      doc.roundedRect(34, 20, 64, 64, 14).fill(`#${brand.green}`);
      doc.circle(66, 38, 14).fill(`#${brand.sun}`);
      doc.font("Helvetica-Bold").fontSize(14).fillColor("white").text("NP", 42, 56, {
        width: 48,
        align: "center",
        lineBreak: false,
      });
    }
  } else {
    doc.roundedRect(34, 20, 64, 64, 14).fill(`#${brand.green}`);
    doc.circle(66, 38, 14).fill(`#${brand.sun}`);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("white").text("NP", 42, 56, {
      width: 48,
      align: "center",
      lineBreak: false,
    });
  }

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(isPayrollTable(table) ? 22 : 18)
    .text(table.title, 116, 23, { width: width - 410, ellipsis: true });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#EAF8EF")
    .text(table.subtitle || companyName, 116, isPayrollTable(table) ? 55 : 50, {
      width: width - 410,
      ellipsis: true,
      lineBreak: false,
    });

  if (isPayrollTable(table)) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(`#${brand.sun}`).text("DOCUMENTO FINANCEIRO ADMINISTRATIVO", 116, 79, {
      width: 290,
      characterSpacing: 0.4,
      lineBreak: false,
    });
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(`#${brand.sun}`)
    .text(companyName, width - 284, 26, {
      align: "right",
      width: 244,
    });
  doc
    .font("Helvetica")
    .fontSize(8.4)
    .fillColor("#EAF8EF")
    .text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, width - 284, 48, {
      align: "right",
      width: 244,
      lineBreak: false,
    });
  doc.restore();
}

function writePdfFooter(doc: PDFKit.PDFDocument, table: ExportTable) {
  const brand = resolveBrand(table);
  const companyName = table.branding?.companyName || table.branding?.appName || defaultCompanyName;
  const systemName = table.branding?.appName || defaultSystemName;
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 28;
    doc.save();
    doc
      .strokeColor(`#${brand.line}`)
      .lineWidth(0.8)
      .moveTo(36, footerY - 8)
      .lineTo(doc.page.width - 36, footerY - 8)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(7.2)
      .fillColor(`#${brand.muted}`)
      .text(table.footer || `${companyName} — ${systemName}`, 36, footerY, {
        width: 420,
        height: 10,
        lineBreak: false,
        ellipsis: true,
      });
    doc.text(
      `Página ${i + 1} de ${pages.count}`,
      doc.page.width - 170,
      footerY,
      { align: "right", width: 134, height: 10, lineBreak: false },
    );
    doc.restore();
  }
}

function drawSummaryCards(
  doc: PDFKit.PDFDocument,
  table: ExportTable,
  y: number,
) {
  const brand = resolveBrand(table);
  if (!table.summary?.length) return y;
  const cards = table.summary.slice(0, 4);
  const gap = 8;
  const cardWidth =
    (doc.page.width - 72 - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x = 36 + index * (cardWidth + gap);
    doc
      .roundedRect(x, y, cardWidth, 42, 10)
      .fillAndStroke(`#${brand.mint}`, `#${brand.line}`);
    doc
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .fillColor(`#${brand.green}`)
      .text(String(card.label).toUpperCase(), x + 10, y + 9, {
        width: cardWidth - 20,
        ellipsis: true,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(String(card.value).length > 14 ? 9.4 : 11)
      .fillColor(`#${brand.greenDark}`)
      .text(String(card.value), x + 10, y + 24, {
        width: cardWidth - 20,
        ellipsis: true,
      });
  });
  return y + 56;
}

function sectionTable(table: ExportTable) {
  // A pré-folha deve sair em uma tabela única: separar em
  // "Detalhamento 1/4" deixava o documento torto e ruim para conferência.
  if (isPayrollTable(table)) {
    return [
      { title: "Quadro oficial da folha", headers: table.headers, rows: table.rows },
    ];
  }

  const maxColumns = 10;
  if (table.headers.length <= maxColumns) {
    return [
      { title: "Detalhamento", headers: table.headers, rows: table.rows },
    ];
  }

  const identityCount = Math.min(2, table.headers.length);
  const identityHeaders = table.headers.slice(0, identityCount);
  const restHeaders = table.headers.slice(identityCount);
  const chunks: Array<{
    title: string;
    headers: string[];
    rows: Array<Array<string | number>>;
  }> = [];
  const chunkSize = Math.max(1, maxColumns - identityCount);
  for (let start = 0; start < restHeaders.length; start += chunkSize) {
    const headers = [
      ...identityHeaders,
      ...restHeaders.slice(start, start + chunkSize),
    ];
    const rows = table.rows.map((row) => [
      ...row.slice(0, identityCount),
      ...row.slice(identityCount + start, identityCount + start + chunkSize),
    ]);
    chunks.push({
      title: `${isPayrollTable(table) ? "Continuação da folha" : "Detalhamento"} ${chunks.length + 1}/${Math.ceil(restHeaders.length / chunkSize)}`,
      headers,
      rows,
    });
  }
  return chunks;
}

function columnWeights(headers: string[], table: ExportTable) {
  if (isPayrollTable(table)) {
    return headers.map((header) => {
      const key = header.toLowerCase();
      if (key.includes("funcion")) return 2.65;
      if (key.includes("unidade") || key.includes("filial")) return 1.25;
      if (key.includes("líquido") || key.includes("final")) return 1.05;
      if (key.includes("desconto") || key.includes("acrésc")) return 1.0;
      if (key.includes("atraso") || key.includes("hora") || key.includes("he")) return 1.0;
      if (key.includes("prev") || key.includes("trab") || key.includes("falt")) return 0.68;
      return 0.9;
    });
  }
  return headers.map((header, index) => {
    const key = header.toLowerCase();
    if (index === 0) return 1.65;
    if (key.includes("funcion")) return 1.8;
    if (key.includes("filial")) return 1.3;
    if (key.includes("justific") || key.includes("observ")) return 1.8;
    if (key.includes("valor") || key.includes("custo")) return 1.15;
    return 1;
  });
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  headers: string[],
  x: number,
  y: number,
  width: number,
  rowHeight: number,
  fontSize: number,
  widths: number[],
  table: ExportTable,
) {
  const brand = resolveBrand(table);
  // Desenho propositalmente simples: evita artefatos pretos/tortos no PDFKit
  // em ambiente serverless e mantém padrão corporativo.
  doc.save();
  doc.rect(x, y, width, rowHeight).fill(`#${brand.green}`);
  doc.rect(x, y + rowHeight - 2, width, 2).fill(`#${brand.sun}`);
  doc.restore();

  let cursor = x;
  headers.forEach((header, index) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(fontSize)
      .fillOpacity(1)
      .fillColor("#FFFFFF")
      .text(header, cursor + 5, y + 8, {
        width: Math.max(10, widths[index] - 10),
        ellipsis: true,
        lineBreak: false,
      });
    cursor += widths[index];
  });
}

function drawDataRow(
  doc: PDFKit.PDFDocument,
  row: Array<string | number>,
  rowIndex: number,
  x: number,
  y: number,
  width: number,
  rowHeight: number,
  fontSize: number,
  widths: number[],
  table: ExportTable,
) {
  const brand = resolveBrand(table);
  const rowFill = rowIndex % 2 ? "#FFFFFF" : `#${brand.row}`;
  doc.save();
  doc.fillOpacity(1);
  doc.strokeOpacity(1);
  doc.rect(x, y, width, rowHeight).fill(rowFill);
  doc.strokeColor(`#${brand.line}`).lineWidth(0.45).rect(x, y, width, rowHeight).stroke();
  doc.restore();

  let cursor = x;
  row.forEach((cell, index) => {
    const rawText = safeText(cell);
    const text = index <= 1 ? maybeWrapText(rawText, index === 0 ? 34 : 24) : safeText(rawText);
    const isMoney = /^-?R\$/.test(rawText);
    const align = isMoney ? "right" : isNumericLike(rawText) && index > 1 ? "center" : "left";
    doc
      .font(index < 2 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(fontSize)
      .fillOpacity(1)
      .fillColor(
        isMoney || /total|final/i.test(String(row[0]))
          ? `#${brand.greenDark}`
          : `#${brand.text}`,
      )
      .text(text, cursor + 5, y + 6, {
        width: Math.max(10, widths[index] - 10),
        height: rowHeight - 10,
        ellipsis: true,
        lineBreak: true,
        align,
      });
    cursor += widths[index];
  });
}

export async function createPdfBuffer(table: ExportTable) {
  const brand = resolveBrand(table);
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 34,
    bufferPages: true,
    autoFirstPage: true,
  });
  writePdfHeader(doc, table);

  let y = isPayrollTable(table) ? 126 : 108;
  if (table.meta?.length) {
    doc.font("Helvetica").fontSize(8).fillColor(`#${brand.text}`);
    table.meta
      .slice(0, 6)
      .forEach((item, index) =>
        doc.text(item, 36, y + index * 12, {
          width: doc.page.width - 72,
          ellipsis: true,
        }),
      );
    y += Math.min(6, table.meta.length) * 12 + 8;
  }

  y = drawSummaryCards(doc, table, y);

  const usableWidth = doc.page.width - 72;
  const rowHeight = isPayrollTable(table) ? 32 : 30;
  const sections = sectionTable(table);

  function ensurePage(space = rowHeight) {
    if (y + space > doc.page.height - 48) {
      doc.addPage();
      writePdfHeader(doc, table);
      y = isPayrollTable(table) ? 126 : 108;
      return true;
    }
    return false;
  }

  sections.forEach((section, sectionIndex) => {
    ensurePage(48);
    if (sectionIndex > 0) y += 8;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(`#${brand.greenDark}`)
      .text(section.title, 36, y, { width: usableWidth });
    y += 16;

    const weights = columnWeights(section.headers, table);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const scaledWidths = weights.map((value) => (usableWidth * value) / totalWeight);
    const fontSize = isPayrollTable(table) ? 7.1 : (section.headers.length > 9 ? 6.2 : 7.2);

    drawTableHeader(
      doc,
      section.headers,
      36,
      y,
      usableWidth,
      rowHeight,
      fontSize,
      scaledWidths,
      table,
    );
    y += rowHeight;

    if (!section.rows.length) {
      ensurePage(rowHeight + 8);
      doc.roundedRect(36, y, usableWidth, 42, 8).fill("#F8FAFC");
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(`#${brand.muted}`)
        .text(
          "Nenhum registro encontrado para os filtros aplicados.",
          48,
          y + 14,
          {
            width: usableWidth - 24,
            align: "center",
          },
        );
      y += 50;
      return;
    }

    section.rows.forEach((row, rowIndex) => {
      const newPage = ensurePage(rowHeight);
      if (newPage) {
        drawTableHeader(doc, section.headers, 36, y, usableWidth, rowHeight, fontSize, scaledWidths, table);
        y += rowHeight;
      }
      drawDataRow(
        doc,
        row,
        rowIndex,
        36,
        y,
        usableWidth,
        rowHeight,
        fontSize,
        scaledWidths,
        table,
      );
      y += rowHeight;
    });
  });

  if (table.title.toLowerCase().includes("folha")) {
    ensurePage(82);
    const signatureY = y + 10;
    doc
      .roundedRect(36, signatureY, usableWidth, 54, 10)
      .strokeColor(`#${brand.line}`)
      .lineWidth(0.8)
      .stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(`#${brand.greenDark}`)
      .text("CONFERÊNCIA ADMINISTRATIVA", 50, signatureY + 12, {
        width: usableWidth - 28,
        lineBreak: false,
      });
    doc
      .font("Helvetica")
      .fontSize(7.4)
      .fillColor(`#${brand.muted}`)
      .text(
        "Responsável RH: ________________________________   Direção: ________________________________   Data: ____/____/______",
        50,
        signatureY + 33,
        { width: usableWidth - 28, lineBreak: false },
      );
  }

  writePdfFooter(doc, table);
  return collectPdf(doc);
}

export async function createQrPdfBuffer(params: {
  qrPng: Buffer;
  branchName: string;
  address?: string | null;
  validUntil?: string | null;
  clockUrl: string;
  branding?: {
    app_name?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    report_footer?: string | null;
  };
}) {
  const brand = defaultBrand;
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 48,
    bufferPages: true,
  });
  const width = doc.page.width;
  const primary = (params.branding?.primary_color || `#${brand.greenDark}`).replace(/^#?/, "#");
  const secondary = (params.branding?.secondary_color || `#${brand.sun}`).replace(/^#?/, "#");
  const appName = params.branding?.app_name || "NexPonto";
  doc.rect(0, 0, width, 150).fill(primary);
  doc.rect(0, 144, width, 6).fill(secondary);
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#FFFFFF").text(appName, 48, 42, { align: "center" });
  doc.font("Helvetica").fontSize(13).fillColor("#D9EAFF").text("Ponto seguro por QR e geolocalização", 48, 82, { align: "center" });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(`#${brand.greenDark}`).text(params.branchName, 48, 184, { align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor(`#${brand.muted}`).text(params.address || "Endereço configurado no painel", 48, 216, { align: "center" });
  doc.roundedRect((width - 300) / 2, 250, 300, 300, 24).fillAndStroke("#FFFFFF", `#${brand.line}`);
  doc.image(params.qrPng, (width - 254) / 2, 273, { width: 254, height: 254 });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(primary).text("Escaneie para registrar o ponto", 48, 580, { align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor(`#${brand.text}`).text(
    "O registro só é concluído após validação do PIN, GPS, filial, escala e sequência da jornada.",
    82,
    616,
    { width: width - 164, align: "center", lineGap: 4 },
  );
  doc.font("Helvetica").fontSize(8).fillColor(`#${brand.muted}`).text(
    `Validade: ${params.validUntil ? new Date(params.validUntil).toLocaleString("pt-BR") : "não informada"}\n${params.clockUrl}\n${params.branding?.report_footer || "Uso restrito à filial e dentro da política de segurança da empresa."}`,
    60,
    690,
    { width: width - 120, align: "center" },
  );
  return collectPdf(doc);
}


function moneyCellValue(value: string | number) {
  if (typeof value === "number") return value;
  const normalized = String(value || "")
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : value;
}

function styleWorksheetHeader(row: ExcelJS.Row, table: ExportTable) {
  const brand = resolveBrand(table);
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${brand.green}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: `FF${brand.sun}` } } };
  });
}

function fitColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let width = 14;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, Math.min(54, String(cell.value ?? "").length + 4));
    });
    column.width = width;
  });
}

async function createPayrollXlsxBuffer(table: ExportTable) {
  const brand = resolveBrand(table);
  const companyName = table.branding?.companyName || table.branding?.appName || defaultCompanyName;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NexPonto";
  workbook.created = new Date();
  workbook.modified = new Date();

  const resumo = workbook.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 6 }] });
  resumo.columns = [{ width: 24 }, { width: 34 }, { width: 24 }, { width: 34 }];
  for (let r = 1; r <= 4; r += 1) {
    for (let c = 1; c <= 4; c += 1) {
      const cell = resumo.getRow(r).getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${brand.greenDark}` } };
    }
  }
  const payrollLogo = readLogoForExcel();
  if (payrollLogo) {
    try {
      const logoId = workbook.addImage({ buffer: payrollLogo.buffer as any, extension: payrollLogo.extension });
      resumo.addImage(logoId, { tl: { col: 0.2, row: 0.2 }, ext: { width: 64, height: 64 } });
    } catch {
      resumo.getCell("A2").value = "NexPonto";
      resumo.getCell("A2").font = { bold: true, color: { argb: `FF${brand.sun}` }, size: 11 };
    }
  } else {
    resumo.getCell("A2").value = "NexPonto";
    resumo.getCell("A2").font = { bold: true, color: { argb: `FF${brand.sun}` }, size: 11 };
  }
  resumo.getCell("B1").value = companyName;
  resumo.getCell("B1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  resumo.getCell("B2").value = table.title;
  resumo.getCell("B2").font = { bold: true, color: { argb: `FF${brand.sun}` }, size: 14 };
  resumo.getCell("B3").value = table.subtitle || "Conferência de folha";
  resumo.getCell("B3").font = { color: { argb: "FFEAF8EF" } };
  resumo.getCell("B4").value = `Emitido em ${new Date().toLocaleString("pt-BR")}`;
  resumo.getCell("B4").font = { color: { argb: "FFEAF8EF" } };

  let cursor = 6;
  (table.meta || []).forEach((item) => {
    resumo.getRow(cursor).values = [item];
    cursor += 1;
  });
  cursor += 1;
  resumo.getRow(cursor).values = ["Indicador", "Valor"];
  styleWorksheetHeader(resumo.getRow(cursor), table);
  (table.summary || []).forEach((item, index) => {
    const row = resumo.getRow(cursor + index + 1);
    row.values = [item.label, item.value];
    row.getCell(1).font = { bold: true };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${brand.mint}` } };
  });

  const folha = workbook.addWorksheet("Folha", { views: [{ state: "frozen", ySplit: 1 }] });
  folha.addRow(table.headers);
  styleWorksheetHeader(folha.getRow(1), table);
  table.rows.forEach((row) => folha.addRow(row.map((value) => String(value).startsWith("R$") ? moneyCellValue(value) : value)));
  folha.autoFilter = { from: "A1", to: { row: 1, column: Math.max(1, table.headers.length) } };
  fitColumns(folha);
  folha.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: `FF${brand.line}` } } };
    });
  });

  const headerIndex = Object.fromEntries(table.headers.map((header, index) => [header, index]));
  const pendencias = workbook.addWorksheet("Pendências", { views: [{ state: "frozen", ySplit: 1 }] });
  pendencias.addRow(["Funcionário", "Filial", "Pendência", "Gravidade", "Ação necessária"]);
  styleWorksheetHeader(pendencias.getRow(1), table);
  table.rows.forEach((row) => {
    const funcionario = row[headerIndex["Funcionário"] ?? 0];
    const filial = row[headerIndex["Filial"] ?? 1];
    const cargo = row[headerIndex["Cargo"] ?? 2];
    const salario = row[headerIndex["Salário base"] ?? -1];
    const diaria = row[headerIndex["Diária"] ?? -1];
    if (!cargo || String(cargo).toLowerCase().includes("a definir")) pendencias.addRow([funcionario, filial, "Cargo não definido", "Crítica", "Editar cadastro do funcionário"]);
    if (String(salario || "").includes("0,00") && String(diaria || "").includes("0,00")) pendencias.addRow([funcionario, filial, "Sem salário/diária", "Crítica", "Preencher remuneração antes de fechar a folha"]);
  });
  if (pendencias.rowCount === 1) pendencias.addRow(["Sem pendências detectadas no Excel", "-", "-", "Info", "Manter conferência manual"]);
  fitColumns(pendencias);

  const dados = workbook.addWorksheet("Dados bancários", { views: [{ state: "frozen", ySplit: 1 }] });
  dados.addRow(["Funcionário", "Filial", "Pix", "Banco", "Agência", "Conta", "Status dos dados"]);
  styleWorksheetHeader(dados.getRow(1), table);
  table.rows.forEach((row) => {
    const funcionario = row[headerIndex["Funcionário"] ?? 0];
    const filial = row[headerIndex["Filial"] ?? 1];
    const pix = row[headerIndex["Pix"] ?? -1] || "-";
    const banco = row[headerIndex["Banco"] ?? -1] || "-";
    const agencia = row[headerIndex["Agência"] ?? -1] || "-";
    const conta = row[headerIndex["Conta"] ?? -1] || "-";
    const okPayment = String(pix) !== "-" || String(conta) !== "-";
    dados.addRow([funcionario, filial, pix, banco, agencia, conta, okPayment ? "Informado" : "Pendente"]);
  });
  fitColumns(dados);

  const auditoria = workbook.addWorksheet("Auditoria-Conferência", { views: [{ state: "frozen", ySplit: 1 }] });
  auditoria.addRow(["Item", "Valor"]);
  styleWorksheetHeader(auditoria.getRow(1), table);
  auditoria.addRow(["Arquivo", table.title]);
  auditoria.addRow(["Emitido em", new Date().toLocaleString("pt-BR")]);
  auditoria.addRow(["Linhas", table.rows.length]);
  auditoria.addRow(["Observação", "Conferir pendências antes de fechar ou registrar a exportação da pré-folha."]);
  fitColumns(auditoria);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createXlsxBuffer(table: ExportTable) {
  const brand = resolveBrand(table);
  const companyName = table.branding?.companyName || table.branding?.appName || defaultCompanyName;
  if (isPayrollTable(table)) return createPayrollXlsxBuffer(table);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NexPonto";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const summary = workbook.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 6 }],
  });
  summary.columns = [
    { width: 18 },
    { width: 38 },
    { width: 34 },
    { width: 28 },
  ];
  for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) {
    summary.getRow(rowNumber).height = rowNumber === 1 ? 24 : 20;
    for (let colNumber = 1; colNumber <= 4; colNumber += 1) {
      summary.getRow(rowNumber).getCell(colNumber).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${brand.greenDark}` },
      };
    }
  }
  const reportLogo = readLogoForExcel();
  if (reportLogo) {
    try {
      const logoId = workbook.addImage({ buffer: reportLogo.buffer as any, extension: reportLogo.extension });
      summary.addImage(logoId, {
        tl: { col: 0.25, row: 0.25 },
        ext: { width: 60, height: 60 },
      });
    } catch {
      summary.getCell("A2").value = "NexPonto";
      summary.getCell("A2").font = { bold: true, color: { argb: `FF${brand.sun}` }, size: 11 };
    }
  } else {
    summary.getCell("A2").value = "NexPonto";
    summary.getCell("A2").font = { bold: true, color: { argb: `FF${brand.sun}` }, size: 11 };
  }
  summary.getCell("B1").value = companyName;
  summary.getCell("B1").font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 16,
  };
  summary.getCell("B2").value = table.title;
  summary.getCell("B2").font = {
    bold: true,
    color: { argb: `FF${brand.sun}` },
    size: 14,
  };
  summary.getCell("B3").value = table.subtitle || "";
  summary.getCell("B3").font = { color: { argb: "FFEAF8EF" } };
  summary.getCell("B4").value =
    `Emitido em ${new Date().toLocaleString("pt-BR")}`;
  summary.getCell("B4").font = { color: { argb: "FFEAF8EF" } };

  (table.meta || []).forEach((item, index) => {
    const row = summary.getRow(index + 6);
    row.values = [item];
    row.font = { color: { argb: `FF${brand.text}` } };
  });
  const summaryStart = 6 + (table.meta?.length || 0) + 1;
  summary.getCell(`A${summaryStart}`).value = "Resumo executivo";
  summary.getCell(`A${summaryStart}`).font = {
    bold: true,
    color: { argb: `FF${brand.greenDark}` },
    size: 13,
  };
  (table.summary || []).forEach((item, index) => {
    const row = summary.getRow(summaryStart + index + 1);
    row.values = [item.label, item.value];
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: "left" };
    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${brand.mint}` },
    };
  });

  const details = workbook.addWorksheet("Detalhes", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  details.addRow(table.headers);
  details.getRow(1).height = 26;
  details.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${brand.green}` },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: `FF${brand.sun}` } },
    };
  });
  table.rows.forEach((row) => details.addRow(row));
  details.autoFilter = {
    from: "A1",
    to: {
      row: 1,
      column: Math.max(1, table.headers.length),
    },
  };
  details.columns.forEach((column, index) => {
    const header = table.headers[index] || "";
    let width = Math.max(14, String(header).length + 4);
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(
        width,
        Math.min(54, String(cell.value ?? "").length + 4),
      );
    });
    column.width = width;
  });
  details.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 26 : 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        bottom: { style: "hair", color: { argb: `FF${brand.line}` } },
      };
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF6FAF7" },
        };
      }
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function fileResponse(
  buffer: Buffer,
  filename: string,
  contentType: string,
) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
      "Content-Length": String(buffer.byteLength),
    },
  });
}
