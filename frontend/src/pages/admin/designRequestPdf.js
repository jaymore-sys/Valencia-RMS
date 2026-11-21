import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";

const ink = rgb(.12, .16, .23);
const muted = rgb(.34, .39, .46);
const accent = rgb(.63, .22, .13);
const peach = rgb(1, .95, .91);
const width = 595;
const height = 842;
const margin = 48;
const contentWidth = width - margin * 2;

export async function createDesignRequestPdf(brief, attachments) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = [];
  let page;
  let y;

  function newPage() {
    page = pdf.addPage([width, height]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: height - 9, width, height: 9, color: accent });
    page.drawText("VALENCIA  /  DESIGN TEAM", { x: margin, y: 799, size: 10, font: bold, color: accent });
    y = 763;
  }

  function reserve(space) {
    if (y - space < 54) newPage();
  }

  async function text(value, { size = 11, strong = false, color = ink } = {}) {
    const font = strong ? bold : regular;
    const advance = Math.ceil(size * 1.42);
    let canvas;
    let ctx;
    const canvasContext = () => {
      if (!canvas) {
        canvas = document.createElement("canvas");
        ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Text rendering is unavailable in this browser.");
      }
      ctx.font = `${strong ? "bold " : ""}${size}px sans-serif`;
      return ctx;
    };
    const measure = line => {
      try {
        return { width: font.widthOfTextAtSize(line, size), raster: false };
      } catch {
        return { width: canvasContext().measureText(line).width, raster: true };
      }
    };
    async function draw(line) {
      reserve(advance);
      const metrics = measure(line);
      const baseline = y - size;
      if (line && metrics.raster) {
        const context = canvasContext();
        canvas.width = Math.ceil((metrics.width + 4) * 3);
        canvas.height = (advance + 6) * 3;
        context.scale(3, 3);
        context.font = `${strong ? "bold " : ""}${size}px sans-serif`;
        context.fillStyle = `rgb(${[color.red, color.green, color.blue].map(channel => Math.round(channel * 255)).join(",")})`;
        context.fillText(line, 1, advance);
        const image = await pdf.embedPng(canvas.toDataURL("image/png"));
        page.drawImage(image, { x: margin - 1, y: baseline - 6, width: canvas.width / 3, height: canvas.height / 3 });
      } else if (line) {
        page.drawText(line, { x: margin, y: baseline, size, font, color });
      }
      y -= advance;
    }

    for (const paragraph of String(value ?? "").replace(/\r\n?/g, "\n").split("\n")) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (measure(next).width <= contentWidth) {
          line = next;
          continue;
        }
        if (line) await draw(line);
        line = "";
        for (const char of word) {
          if (measure(line + char).width > contentWidth) {
            await draw(line);
            line = "";
          }
          line += char;
        }
      }
      await draw(line);
    }
  }

  async function section(title) {
    y -= 13;
    reserve(61);
    page.drawRectangle({ x: margin - 7, y: y - 17, width: contentWidth + 14, height: 22, color: peach });
    await text(title, { size: 11, strong: true, color: accent });
    y -= 5;
  }

  const remainingFiles = attachments.map((file, index) => ({
    ...file, embeddedName: `${String(index + 1).padStart(2, "0")} - ${file.name}`,
  }));

  async function showFiles(files) {
    for (const file of files) {
      await pdf.attach(file.content, file.embeddedName, { mimeType: "application/octet-stream", description: file.name });
      if (!/\.pdf$/i.test(file.name)) {
        await text(`${file.name} (embedded file)`, { size: 10, color: muted });
        continue;
      }
      try {
        const source = await PDFDocument.load(file.content);
        const indices = source.getPageIndices();
        if (!indices.length) throw new Error("Empty PDF");
        const copied = await pdf.copyPages(source, indices);
        await text(`${file.name} (next ${copied.length} ${copied.length === 1 ? "page" : "pages"})`, { size: 10, color: muted });
        for (const sheet of copied) {
          sheet.node.delete(PDFName.of("Annots"));
          sheet.node.delete(PDFName.of("AA"));
          pdf.addPage(sheet);
        }
        page = null;
        y = 0;
      } catch {
        await text(`${file.name} (embedded file, preview unavailable)`, { size: 10, color: muted });
      }
    }
  }

  pdf.setTitle(brief.title);
  newPage();
  await text(brief.category, { size: 11, strong: true, color: accent });
  await text(brief.title, { size: 26, strong: true });
  for (const [label, value] of brief.fields) {
    if (value) await text(`${label}  ·  ${value}`, { size: 10, color: muted });
  }
  await section("Request brief");
  for (const entry of brief.answers) {
    if (entry.label) {
      reserve(36);
      await text(entry.label, { size: 10, strong: true, color: muted });
    }
    await text(entry.value);
    const matchingFiles = entry.label ? remainingFiles.filter(file => file.label === entry.label) : [];
    if (matchingFiles.length) {
      await showFiles(matchingFiles);
      for (const file of matchingFiles) remainingFiles.splice(remainingFiles.indexOf(file), 1);
    }
    y -= 7;
  }

  if (brief.replies.length) {
    await section("Additional information");
    for (const reply of brief.replies) {
      reserve(36);
      await text(reply.label, { size: 10, strong: true, color: muted });
      await text(reply.value);
      y -= 7;
    }
  }

  if (remainingFiles.length) {
    await section("Other shared files");
    await showFiles(remainingFiles);
  }
  const totalPages = pdf.getPageCount();
  for (const sheet of pages) {
    const pageNumber = pdf.getPages().indexOf(sheet) + 1;
    sheet.drawLine({ start: { x: margin, y: 45 }, end: { x: width - margin, y: 45 }, thickness: .5, color: muted });
    sheet.drawText(`Design brief #${brief.id}`, { x: margin, y: 29, size: 9, font: regular, color: muted });
    sheet.drawText(`${pageNumber} / ${totalPages}`, { x: width - margin - 28, y: 29, size: 9, font: regular, color: muted });
  }
  return pdf.save();
}
