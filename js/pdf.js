// DÙN RIGHT — PDF generation (jsPDF)
// Called after supervisor approval to create timesheet / invoice PDFs

const BRAND = {
  gold:  [200, 169, 110],
  dark:  [ 26,  26,  46],
  grey:  [100, 100, 100],
  light: [245, 245, 245]
};

function addHeader(doc, title) {
  // Dark header bar
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, 210, 28, 'F');
  // Gold accent line
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, 28, 210, 2, 'F');
  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(200, 169, 110);
  doc.text('DÙN RIGHT', 14, 17);
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text('FIELD SERVICES', 14, 23);
  // Document title
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 210 - 14, 17, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

function addFooter(doc, pageNum, totalPages) {
  const y = 290;
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, y - 2, 210, 0.5, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.grey);
  doc.text('DÙN RIGHT — Confidential', 14, y + 4);
  doc.text(`Page ${pageNum} of ${totalPages}`, 196, y + 4, { align: 'right' });
}

// ─── TIMESHEET PDF ────────────────────────────────────────────────────────────
export async function generateTimesheetPDF(workOrder, project, user, supervisor) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  addHeader(doc, 'FIELD TIME SHEET');

  let y = 38;

  // Info block
  const fields = [
    ['Project',    project?.name || '—'],
    ['Client',     project?.clientName || '—'],
    ['Date',       workOrder.date],
    ['Field Staff',user?.name || '—'],
    ['Approved By',supervisor?.name || 'Pending'],
    ['WO Number',  `WO-${String(workOrder.id).padStart(4,'0')}`]
  ];

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(12, y, 186, fields.length * 8 + 6, 2, 2, 'F');
  doc.setFontSize(9);
  fields.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.dark);
    doc.text(label + ':', 16, y + 6 + i * 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    doc.text(String(val), 55, y + 6 + i * 8);
  });

  y += fields.length * 8 + 14;

  // Labour table
  if (workOrder.labourItems && workOrder.labourItems.length > 0) {
    doc.setFillColor(...BRAND.dark);
    doc.rect(12, y, 186, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('LABOUR', 16, y + 5.5);

    y += 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.dark);
    doc.setFillColor(230, 230, 230);
    doc.rect(12, y, 186, 7, 'F');
    doc.text('Pay Item',       16, y + 5);
    doc.text('Hours',         120, y + 5);
    doc.text('Rate',          150, y + 5);
    doc.text('Amount',        180, y + 5, { align: 'right' });

    y += 7;
    let labourTotal = 0;
    doc.setFont('helvetica', 'normal');
    workOrder.labourItems.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(12, y, 186, 7, 'F');
      }
      doc.setTextColor(40, 40, 40);
      doc.text(item.name, 16, y + 5);
      doc.text(String(item.hours), 120, y + 5);
      doc.text(`$${Number(item.rate).toFixed(2)}`, 150, y + 5);
      const amt = item.hours * item.rate;
      labourTotal += amt;
      doc.text(`$${amt.toFixed(2)}`, 198, y + 5, { align: 'right' });
      y += 7;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...BRAND.gold);
    doc.rect(12, y, 186, 7, 'F');
    doc.setTextColor(...BRAND.dark);
    doc.text('Labour Subtotal', 16, y + 5);
    doc.text(`$${labourTotal.toFixed(2)}`, 198, y + 5, { align: 'right' });
    y += 14;
  }

  // Travel & LOA
  const extras = [];
  if (workOrder.billableTravel) extras.push(['Billable Travel', workOrder.billableTravelAmount || 0]);
  if (workOrder.loa)            extras.push(['Living Out Allowance (LOA)', workOrder.loaAmount || 0]);

  if (extras.length > 0) {
    doc.setFillColor(...BRAND.dark);
    doc.rect(12, y, 186, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('TRAVEL & ALLOWANCES', 16, y + 5.5);
    y += 8;
    doc.setFontSize(8);
    extras.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(12, y, 186, 7, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text(row[0], 16, y + 5);
      doc.text(`$${Number(row[1]).toFixed(2)}`, 198, y + 5, { align: 'right' });
      y += 7;
    });
    y += 7;
  }

  // Consumables
  if (workOrder.consumables && workOrder.consumables.length > 0) {
    doc.setFillColor(...BRAND.dark);
    doc.rect(12, y, 186, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('CONSUMABLES', 16, y + 5.5);
    y += 8;
    doc.setFontSize(8);
    workOrder.consumables.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(12, y, 186, 7, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text(item.name, 16, y + 5);
      doc.text(`${item.qty} ${item.unit}`, 120, y + 5);
      y += 7;
    });
    y += 7;
  }

  // Notes
  if (workOrder.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.dark);
    doc.text('NOTES', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(workOrder.notes, 182);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 8;
  }

  // Signature
  if (workOrder.signature) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.dark);
    doc.text('FIELD STAFF SIGNATURE', 14, y);
    y += 4;
    const img = workOrder.signature;
    doc.addImage(img, 'PNG', 14, y, 60, 20);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Signed: ${user?.name || ''}  |  Date: ${workOrder.date}`, 14, y);
  }

  addFooter(doc, 1, 1);

  return doc;
}

// ─── INVOICE PDF ──────────────────────────────────────────────────────────────
export async function generateInvoicePDF(invoice, project, items, workOrders) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  addHeader(doc, 'INVOICE');

  let y = 38;
  const invNum = `INV-${String(invoice.id).padStart(4,'0')}`;

  // Header info
  const infoFields = [
    ['Invoice No',  invNum],
    ['Date',        invoice.createdAt?.slice(0,10) || '—'],
    ['Project',     project?.name || '—'],
    ['Bill To',     project?.clientName || '—'],
    ['Due Date',    invoice.dueDate || '30 days net']
  ];

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(12, y, 186, infoFields.length * 8 + 6, 2, 2, 'F');
  doc.setFontSize(9);
  infoFields.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.dark);
    doc.text(label + ':', 16, y + 6 + i * 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    doc.text(String(val), 60, y + 6 + i * 8);
  });

  y += infoFields.length * 8 + 14;

  // Items table
  doc.setFillColor(...BRAND.dark);
  doc.rect(12, y, 186, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('Description', 16, y + 5.5);
  doc.text('Qty', 130, y + 5.5);
  doc.text('Rate', 155, y + 5.5);
  doc.text('Amount', 198, y + 5.5, { align: 'right' });

  y += 8;
  let total = 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  items.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(12, y, 186, 7, 'F');
    }
    doc.setTextColor(40, 40, 40);
    doc.text(item.description || '', 16, y + 5);
    doc.text(String(item.quantity || 1), 130, y + 5);
    doc.text(`$${Number(item.rate || 0).toFixed(2)}`, 155, y + 5);
    const amt = (item.quantity || 1) * (item.rate || 0);
    total += amt;
    doc.text(`$${amt.toFixed(2)}`, 198, y + 5, { align: 'right' });
    y += 7;
  });

  // GST + Total
  const gst = total * 0.05;
  const grand = total + gst;

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  [['Subtotal', total], ['GST (5%)', gst]].forEach(([label, val]) => {
    doc.setTextColor(...BRAND.grey);
    doc.text(label, 155, y);
    doc.setTextColor(40, 40, 40);
    doc.text(`$${val.toFixed(2)}`, 198, y, { align: 'right' });
    y += 7;
  });

  doc.setFillColor(...BRAND.gold);
  doc.rect(12, y, 186, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.dark);
  doc.text('TOTAL DUE', 16, y + 6.5);
  doc.text(`$${grand.toFixed(2)}`, 198, y + 6.5, { align: 'right' });
  y += 16;

  // Payment details
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND.grey);
  doc.text('Thank you for your business. Please reference the invoice number with your payment.', 14, y);

  addFooter(doc, 1, 1);

  return doc;
}
