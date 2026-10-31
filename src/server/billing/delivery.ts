import PDFDocument from "pdfkit";
import type { PrismaClient } from "@prisma/client";
import { deliverMail } from "@/server/platform/mail";

// No "server-only" here: the standalone worker (tsx) imports this module.

export async function loadInvoiceDocument(db: PrismaClient, invoiceId: string) {
  return db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      organization: { select: { legalName: true, supportEmail: true, locale: true } },
      customer: true,
      subscription: { select: { number: true } },
      lines: { orderBy: { position: "asc" } },
    },
  });
}

type InvoiceDocument = NonNullable<Awaited<ReturnType<typeof loadInvoiceDocument>>>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/** Monochrome A4 invoice. Amounts use the ISO currency code so the PDF needs no embedded symbol font. */
export function renderInvoicePdf(inv: InvoiceDocument): Promise<Buffer> {
  const fmt = new Intl.NumberFormat(inv.organization.locale, { style: "currency", currency: inv.currency, currencyDisplay: "code" });
  const money = (x: { toString(): string }) => fmt.format(Number(x.toString()));
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Invoice ${inv.number}`, Author: inv.organization.legalName } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const ink = "#141414";
  const muted = "#595959";
  const left = 56;
  const right = doc.page.width - 56;

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(18).text(inv.organization.legalName, left, 56);
  doc.font("Helvetica").fontSize(10).fillColor(muted).text(inv.organization.supportEmail ?? "");
  doc.font("Helvetica-Bold").fontSize(14).fillColor(ink).text(`Invoice ${inv.number}`, left, 56, { align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor(muted);
  doc.text(`Issued ${day(inv.issueDate)}`, { align: "right" });
  doc.text(`Due ${day(inv.dueDate)}`, { align: "right" });
  if (inv.status === "CANCELLED") doc.font("Helvetica-Bold").fillColor(ink).text("CANCELLED", { align: "right" });

  doc.moveDown(2).font("Helvetica-Bold").fillColor(ink).fontSize(10).text("Bill to", left);
  doc.font("Helvetica").text(inv.customer.businessName).text(inv.customer.contactName).text(inv.customer.email);
  if (inv.customer.billingAddress) doc.text(inv.customer.billingAddress);
  if (inv.customer.taxId) doc.text(`Tax ID ${inv.customer.taxId}`);
  if (inv.periodStart) doc.moveDown().fillColor(muted).text(`Service period ${day(inv.periodStart)} to ${day(inv.periodEnd)}${inv.subscription ? ` · ${inv.subscription.number}` : ""}`);

  const cols = [left, left + 220, left + 260, left + 340, left + 410];
  let y = doc.moveDown(1.5).y;
  const row = (cells: string[], bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(ink);
    doc.text(cells[0], cols[0], y, { width: 215 });
    const h = doc.y;
    cells.slice(1).forEach((c, i) => doc.text(c, cols[i + 1], y, { width: (cols[i + 2] ?? right) - cols[i + 1] - 4, align: "right" }));
    y = Math.max(h, doc.y) + 6;
    doc.moveTo(left, y - 3).lineTo(right, y - 3).lineWidth(0.5).strokeColor("#E5E5E5").stroke();
  };
  row(["Description", "Qty", "Unit price", "Tax", "Amount"], true);
  for (const l of inv.lines) {
    const discount = Number(l.discountAmount) > 0 ? `\nDiscount −${money(l.discountAmount)}` : "";
    row([`${l.description}${discount}`, String(l.quantity), money(l.unitPrice), `${Number(l.taxRate)}%`, money(l.total)]);
  }
  y += 8;
  const total = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(bold ? ink : muted);
    doc.text(label, cols[2], y, { width: 140 });
    doc.fillColor(ink).text(value, cols[3], y, { width: right - cols[3], align: "right" });
    y = doc.y + 4;
  };
  total("Subtotal", money(inv.subtotal));
  if (Number(inv.discountTotal) > 0) total("Discount", `−${money(inv.discountTotal)}`);
  total("Tax", money(inv.taxTotal));
  total("Total", money(inv.total), true);
  if (Number(inv.amountPaid) > 0) {
    total("Paid", money(inv.amountPaid));
    total("Balance due", money(Number(inv.total) - Number(inv.amountPaid)), true);
  }
  doc.end();
  return done;
}

/** Outbox handler for `invoice.send`: renders the PDF at delivery time and records the delivery state (BILL-05). */
export async function deliverInvoice(db: PrismaClient, payload: { invoiceId: string }): Promise<void> {
  const inv = await loadInvoiceDocument(db, payload.invoiceId);
  if (!inv || inv.status === "CANCELLED") return;
  const pdf = await renderInvoicePdf(inv);
  const fmt = new Intl.NumberFormat(inv.organization.locale, { style: "currency", currency: inv.currency });
  await deliverMail({
    to: inv.customer.email,
    subject: `Invoice ${inv.number} from ${inv.organization.legalName}`,
    text: `Hello ${inv.customer.contactName},\n\nInvoice ${inv.number} for ${fmt.format(Number(inv.total))} is attached and due on ${day(inv.dueDate)}.\n\n${inv.organization.legalName}`,
    attachments: [{ filename: `${inv.number}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  await db.invoice.update({ where: { id: inv.id }, data: { deliveryStatus: "SENT", sentAt: new Date(), deliveryError: null } });
}

export async function invoiceDeliveryFailed(db: PrismaClient, payload: { invoiceId: string }, message: string): Promise<void> {
  const inv = await db.invoice.update({ where: { id: payload.invoiceId }, data: { deliveryStatus: "FAILED", deliveryError: message } });
  const dedupeKey = `send:${inv.id}`;
  await db.billingException.upsert({
    where: { organizationId_dedupeKey: { organizationId: inv.organizationId, dedupeKey } },
    create: {
      organizationId: inv.organizationId,
      type: "SEND_FAILED",
      relatedType: "Invoice",
      relatedId: inv.id,
      summary: `Could not email invoice ${inv.number}`,
      detail: message,
      dedupeKey,
    },
    update: { attempts: { increment: 1 }, lastAttemptAt: new Date(), detail: message, status: "OPEN", resolvedAt: null, resolution: null },
  });
}
