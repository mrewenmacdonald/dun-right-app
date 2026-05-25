// DÙN RIGHT — PDF generation in Keltic Geomatics LEM format
// Matches the KEA Daily Field Ticket layout: green headers, three-column layout,
// hour-type breakdown, Keltic footer

const KELTIC = {
  green:      [20,  80,  40],   // Dark forest green #145028
  greenLight: [40, 110,  60],   // Lighter green for sub-headers
  white:      [255, 255, 255],
  black:      [0,   0,   0],
  dark:       [30,  30,  30],
  grey:       [100, 100, 100],
  lightGrey:  [200, 200, 200],
  rowAlt:     [240, 247, 242],  // Very light green tint for alternating rows
  rowWhite:   [255, 255, 255]
};

// Page constants (A4 in mm)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const COL_W  = PAGE_W - MARGIN * 2;

function sectionHeader(doc, y, title) {
  doc.setFillColor(...KELTIC.green);
  doc.rect(MARGIN, y, COL_W, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...KELTIC.white);
  doc.text(title.toUpperCase(), MARGIN + 3, y + 5);
  doc.setTextColor(...KELTIC.dark);
  return y + 7;
}

function tableHeader(doc, y, cols) {
  // cols: [{text, x, w, align}]
  doc.setFillColor(220, 235, 225);
  doc.rect(MARGIN, y, COL_W, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...KELTIC.dark);
  cols.forEach(col => {
    const align = col.align || 'left';
    const tx = align === 'right' ? col.x + col.w - 1 : col.x + 1;
    doc.text(col.text, tx, y + 4.5, { align });
  });
  return y + 6;
}

function kelticHeader(doc, lemNumber, date, projectName, clientName) {
  // Top green bar
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, 0, PAGE_W, 22, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...KELTIC.white);
  doc.text('KELTIC GEOMATICS', MARGIN, 10);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Land & Engineering Surveys', MARGIN, 15);

  // Right side — document type
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DAILY FIELD TICKET', PAGE_W - MARGIN, 9, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('(LEM)', PAGE_W - MARGIN, 14, { align: 'right' });

  // Thin white divider line
  doc.setDrawColor(...KELTIC.white);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 18, PAGE_W - MARGIN, 18);

  // Project info row (white background below header)
  let y = 22;
  doc.setFillColor(248, 252, 249);
  doc.rect(0, y, PAGE_W, 20, 'F');
  doc.setDrawColor(...KELTIC.lightGrey);
  doc.setLineWidth(0.2);
  doc.rect(0, y, PAGE_W, 20, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...KELTIC.grey);

  // Left column
  doc.text('PROJECT:', MARGIN, y + 5);
  doc.text('CLIENT:', MARGIN, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...KELTIC.dark);
  doc.text(String(projectName || '—').toUpperCase(), MARGIN + 18, y + 5);
  doc.text(String(clientName || '—'), MARGIN + 18, y + 12);

  // Right column
  const midX = PAGE_W / 2 + 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...KELTIC.grey);
  doc.text('LEM #:', midX, y + 5);
  doc.text('DATE:', midX, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...KELTIC.green);
  doc.setFontSize(9);
  doc.text(String(lemNumber || '—'), midX + 15, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...KELTIC.dark);
  doc.text(String(date || '—'), midX + 15, y + 12);

  doc.setTextColor(...KELTIC.dark);
  return y + 22; // return next y position
}

function kelticFooter(doc, pageNum, totalPages) {
  const y = PAGE_H - 12;
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, y - 2, PAGE_W, 1, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...KELTIC.grey);
  doc.text('www.kelticgeo.com', MARGIN, y + 3);
  doc.text('49-8371 202B St, Langley BC, V2Y 4K6', PAGE_W / 2, y + 3, { align: 'center' });
  doc.text('(778) 539-5505', PAGE_W - MARGIN, y + 3, { align: 'right' });
  doc.setTextColor(...KELTIC.lightGrey);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W / 2, y + 8, { align: 'center' });
  doc.setTextColor(...KELTIC.dark);
}

function checkNewPage(doc, y, neededHeight, lemNumber, date, projectName, clientName, pageRef) {
  if (y + neededHeight > PAGE_H - 18) {
    kelticFooter(doc, pageRef.page, '?');
    doc.addPage();
    pageRef.page++;
    y = kelticHeader(doc, lemNumber, date, projectName, clientName);
  }
  return y;
}

// ─── MAIN LEM PDF ─────────────────────────────────────────────────────────────
export async function generateLEMPDF(lem, project, user, supervisor) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const projectName = project?.name || '—';
  const clientName  = project?.clientName || '—';
  const lemNumber   = lem.lemNumber || `LEM-${String(lem.id).padStart(4,'0')}`;
  const date        = lem.date || '—';

  const pageRef = { page: 1 };
  let y = kelticHeader(doc, lemNumber, date, projectName, clientName);

  // ── LABOUR SECTION ────────────────────────────────────────────────────────
  y = sectionHeader(doc, y, 'Labour');

  const labourItems = lem.labourItems || [];
  if (labourItems.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...KELTIC.grey);
    doc.text('No labour entries', MARGIN + 3, y + 5);
    y += 8;
  } else {
    // Column header
    const labCols = [
      { text: 'Name / Title',     x: MARGIN,     w: 38 },
      { text: 'Surveying',        x: MARGIN+38,  w: 16 },
      { text: 'Drafting',         x: MARGIN+54,  w: 16 },
      { text: 'Office',           x: MARGIN+70,  w: 14 },
      { text: 'Other',            x: MARGIN+84,  w: 14 },
      { text: 'Travel',           x: MARGIN+98,  w: 14 },
      { text: 'Total',            x: MARGIN+112, w: 14 },
      { text: 'Rate',             x: MARGIN+126, w: 18, align: 'right' },
      { text: 'Amount',           x: MARGIN+144, w: 22, align: 'right' },
      { text: 'KM Start',         x: MARGIN+166, w: 17 },
      { text: 'KM Stop',          x: MARGIN+183, w: 17 }
    ];
    // trim last two cols if page too narrow — use simplified layout
    const simpleCols = [
      { text: 'Name / Title',  x: MARGIN,    w: 50 },
      { text: 'Survey',        x: MARGIN+50, w: 14 },
      { text: 'Draft',         x: MARGIN+64, w: 14 },
      { text: 'Office',        x: MARGIN+78, w: 14 },
      { text: 'Other',         x: MARGIN+92, w: 14 },
      { text: 'Travel',        x: MARGIN+106,w: 14 },
      { text: 'Total hrs',     x: MARGIN+120,w: 18 },
      { text: 'Rate/hr',       x: MARGIN+138,w: 18, align: 'right' },
      { text: 'Amount',        x: MARGIN+156,w: 18, align: 'right' },
      { text: 'KM',            x: MARGIN+174,w: 16 }
    ];

    y = tableHeader(doc, y, simpleCols);

    labourItems.forEach((item, i) => {
      y = checkNewPage(doc, y, 12, lemNumber, date, projectName, clientName, pageRef);
      const bg = i % 2 === 0 ? KELTIC.rowWhite : KELTIC.rowAlt;
      doc.setFillColor(...bg);
      doc.rect(MARGIN, y, COL_W, 11, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...KELTIC.dark);
      doc.text(String(item.name || '—'), MARGIN + 1, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...KELTIC.grey);
      doc.text(String(item.title || ''), MARGIN + 1, y + 8.5);

      const total = (item.survey||0) + (item.draft||0) + (item.office||0) + (item.other||0) + (item.travel||0);
      const amount = total * (item.rate || 0);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...KELTIC.dark);

      const vals = [
        [MARGIN+51, String(item.survey || 0)],
        [MARGIN+65, String(item.draft  || 0)],
        [MARGIN+79, String(item.office || 0)],
        [MARGIN+93, String(item.other  || 0)],
        [MARGIN+107,String(item.travel || 0)],
        [MARGIN+121,total.toFixed(1)]
      ];
      vals.forEach(([x, v]) => doc.text(v, x, y + 6));

      doc.setFont('helvetica', 'bold');
      doc.text(`$${Number(item.rate||0).toFixed(2)}`, MARGIN+155, y+6, { align: 'right' });
      doc.setTextColor([0,100,50]);
      doc.text(`$${amount.toFixed(2)}`, MARGIN+173, y+6, { align: 'right' });
      doc.setTextColor(...KELTIC.dark);
      doc.setFont('helvetica', 'normal');

      const km = (item.kmStop||0) - (item.kmStart||0);
      doc.text(`${item.kmStart||0}–${item.kmStop||0} (${km}km)`, MARGIN+175, y+6);
      y += 11;

      // LOA row if applicable
      if ((item.loaFood || 0) > 0 || (item.loaAccom || 0) > 0) {
        doc.setFillColor(248, 255, 248);
        doc.rect(MARGIN, y, COL_W, 6, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...KELTIC.grey);
        doc.text(`LOA — Food: $${Number(item.loaFood||0).toFixed(2)}   Accommodation: $${Number(item.loaAccom||0).toFixed(2)}`, MARGIN + 3, y + 4);
        y += 6;
      }
    });

    // Labour totals row
    const totalHrs = labourItems.reduce((s,l) => s + ((l.survey||0)+(l.draft||0)+(l.office||0)+(l.other||0)+(l.travel||0)), 0);
    const totalAmt = labourItems.reduce((s,l) => {
      const hrs = (l.survey||0)+(l.draft||0)+(l.office||0)+(l.other||0)+(l.travel||0);
      return s + hrs * (l.rate||0);
    }, 0);
    const totalLOA = labourItems.reduce((s,l) => s + (l.loaFood||0) + (l.loaAccom||0), 0);

    doc.setFillColor(...KELTIC.green);
    doc.rect(MARGIN, y, COL_W, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...KELTIC.white);
    doc.text('LABOUR TOTAL', MARGIN + 3, y + 5);
    doc.text(`${totalHrs.toFixed(1)} hrs`, MARGIN + 121, y + 5);
    doc.text(`$${totalAmt.toFixed(2)}`, MARGIN + 173, y + 5, { align: 'right' });
    if (totalLOA > 0) doc.text(`LOA: $${totalLOA.toFixed(2)}`, MARGIN + 140, y + 5);
    y += 9;
  }

  // ── INSTRUMENTS / CONSUMABLES / FIELD SAMPLES — 3 column layout ──────────
  y = checkNewPage(doc, y, 40, lemNumber, date, projectName, clientName, pageRef);
  y = sectionHeader(doc, y, 'Instruments | Consumables | Field Samples');

  const thirdW  = COL_W / 3;
  const col2X   = MARGIN + thirdW;
  const col3X   = MARGIN + thirdW * 2;

  // Sub-headers for each column
  const subHeaderH = 6;
  doc.setFillColor(220, 235, 225);
  doc.rect(MARGIN,  y, thirdW,  subHeaderH, 'F');
  doc.rect(col2X,   y, thirdW,  subHeaderH, 'F');
  doc.rect(col3X,   y, thirdW,  subHeaderH, 'F');

  doc.setDrawColor(...KELTIC.green);
  doc.setLineWidth(0.3);
  doc.line(col2X, y, col2X, y + subHeaderH);
  doc.line(col3X, y, col3X, y + subHeaderH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...KELTIC.green);
  doc.text('INSTRUMENTS',  MARGIN + 2,       y + 4.5);
  doc.text('CONSUMABLES',  col2X + 2,        y + 4.5);
  doc.text('FIELD SAMPLES',col3X + 2,        y + 4.5);
  y += subHeaderH;

  // Column item headers
  const itemHdrH = 5;
  doc.setFillColor(235, 245, 238);
  doc.rect(MARGIN, y, COL_W, itemHdrH, 'F');
  doc.line(col2X, y, col2X, y + itemHdrH);
  doc.line(col3X, y, col3X, y + itemHdrH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...KELTIC.grey);
  doc.text('Description',        MARGIN + 2, y + 3.5);
  doc.text('S/N',                MARGIN + 32,y + 3.5);
  doc.text('Qty',                MARGIN + 52,y + 3.5, { align: 'right' });
  doc.text('Description',        col2X + 2,  y + 3.5);
  doc.text('Qty',                col2X + thirdW - 4, y + 3.5, { align: 'right' });
  doc.text('Type',               col3X + 2,  y + 3.5);
  doc.text('Qty',                col3X + thirdW - 4, y + 3.5, { align: 'right' });
  y += itemHdrH;

  const instruments  = lem.instruments  || [];
  const consumables  = lem.consumables  || [];
  const fieldSamples = lem.fieldSamples || [];
  const maxRows = Math.max(instruments.length, consumables.length, fieldSamples.length, 1);
  const rowH = 5.5;

  for (let i = 0; i < maxRows; i++) {
    const bg = i % 2 === 0 ? KELTIC.rowWhite : KELTIC.rowAlt;
    doc.setFillColor(...bg);
    doc.rect(MARGIN, y, COL_W, rowH, 'F');
    doc.setDrawColor(...KELTIC.lightGrey);
    doc.line(col2X, y, col2X, y + rowH);
    doc.line(col3X, y, col3X, y + rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...KELTIC.dark);

    // Instruments col
    if (instruments[i]) {
      const instr = instruments[i];
      doc.text(String(instr.name || '').slice(0, 20), MARGIN + 2, y + 3.8);
      if (instr.serialNumber) {
        doc.setFontSize(6);
        doc.setTextColor(...KELTIC.grey);
        doc.text(String(instr.serialNumber), MARGIN + 32, y + 3.8);
        doc.setFontSize(7);
        doc.setTextColor(...KELTIC.dark);
      }
      doc.text(String(instr.qty || 1), MARGIN + 52, y + 3.8, { align: 'right' });
    }

    // Consumables col
    if (consumables[i]) {
      const con = consumables[i];
      doc.text(String(con.name || '').slice(0, 20), col2X + 2, y + 3.8);
      doc.text(`${con.qty || 1} ${con.unit || ''}`, col2X + thirdW - 4, y + 3.8, { align: 'right' });
    }

    // Field samples col
    if (fieldSamples[i]) {
      const fs = fieldSamples[i];
      doc.text(String(fs.type || '').slice(0, 18), col3X + 2, y + 3.8);
      doc.text(String(fs.qty || 1), col3X + thirdW - 4, y + 3.8, { align: 'right' });
    }

    y += rowH;
  }

  // Outer border for 3-col section
  doc.setDrawColor(...KELTIC.green);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y - maxRows * rowH - subHeaderH - itemHdrH, COL_W, maxRows * rowH + subHeaderH + itemHdrH, 'S');

  y += 4;

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (lem.notes) {
    y = checkNewPage(doc, y, 20, lemNumber, date, projectName, clientName, pageRef);
    y = sectionHeader(doc, y, 'Notes');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...KELTIC.dark);
    const lines = doc.splitTextToSize(lem.notes, COL_W - 4);
    doc.text(lines, MARGIN + 2, y + 5);
    y += lines.length * 5 + 8;
  }

  // ── SIGNATURES ────────────────────────────────────────────────────────────
  y = checkNewPage(doc, y, 45, lemNumber, date, projectName, clientName, pageRef);
  y = sectionHeader(doc, y, 'Approvals & Signatures');

  const sigBoxH = 28;
  const halfW   = COL_W / 2 - 2;

  // Field Staff signature box
  doc.setDrawColor(...KELTIC.green);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, halfW, sigBoxH, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...KELTIC.green);
  doc.text('FIELD STAFF', MARGIN + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...KELTIC.dark);
  doc.setFontSize(7);
  doc.text(user?.name || '—', MARGIN + 2, y + 10);

  if (lem.signature) {
    try {
      doc.addImage(lem.signature, 'PNG', MARGIN + 2, y + 12, 50, 12);
    } catch(e) {}
  }

  doc.setDrawColor(...KELTIC.lightGrey);
  doc.line(MARGIN + 2, y + sigBoxH - 7, MARGIN + halfW - 2, y + sigBoxH - 7);
  doc.setFontSize(6.5);
  doc.setTextColor(...KELTIC.grey);
  doc.text('Signature', MARGIN + 2, y + sigBoxH - 4);
  doc.text(`Date: ${date}`, MARGIN + 2, y + sigBoxH - 1);

  // Supervisor signature box
  const sig2X = MARGIN + halfW + 4;
  doc.setDrawColor(...KELTIC.green);
  doc.setLineWidth(0.3);
  doc.rect(sig2X, y, halfW, sigBoxH, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...KELTIC.green);
  doc.text('SUPERVISOR APPROVAL', sig2X + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...KELTIC.dark);
  doc.setFontSize(7);
  doc.text(supervisor?.name || 'Pending', sig2X + 2, y + 10);
  doc.setDrawColor(...KELTIC.lightGrey);
  doc.line(sig2X + 2, y + sigBoxH - 7, sig2X + halfW - 2, y + sigBoxH - 7);
  doc.setFontSize(6.5);
  doc.setTextColor(...KELTIC.grey);
  doc.text('Signature', sig2X + 2, y + sigBoxH - 4);
  doc.text(`Approved: ${lem.approvedAt?.slice(0,10) || '—'}`, sig2X + 2, y + sigBoxH - 1);

  y += sigBoxH + 4;

  // ── STATUS STAMP ──────────────────────────────────────────────────────────
  if (lem.status === 'approved') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(20, 140, 60);
    doc.saveGraphicsState();
    doc.text('APPROVED', PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 30 });
    doc.restoreGraphicsState();
  }

  // Footer on all pages
  const totalPages = pageRef.page;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    kelticFooter(doc, p, totalPages);
  }

  return doc;
}

// ─── INVOICE PDF (Keltic branded) ─────────────────────────────────────────────
export async function generateInvoicePDF(invoice, project, items, lems) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const projectName = project?.name || '—';
  const clientName  = project?.clientName || '—';
  const invNum      = `INV-${String(invoice.id).padStart(4,'0')}`;

  // Header
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...KELTIC.white);
  doc.text('KELTIC GEOMATICS', MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Land & Engineering Surveys', MARGIN, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INVOICE', PAGE_W - MARGIN, 10, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(invNum, PAGE_W - MARGIN, 16, { align: 'right' });

  let y = 26;

  // Info block
  doc.setFillColor(248, 252, 249);
  doc.rect(MARGIN, y, COL_W, 28, 'F');
  doc.setDrawColor(...KELTIC.lightGrey);
  doc.rect(MARGIN, y, COL_W, 28, 'S');

  const leftX = MARGIN + 3;
  const rightX = PAGE_W / 2 + 5;
  const info = [
    ['Project:', projectName],
    ['Bill To:', clientName],
    ['Client Email:', project?.clientEmail || '—']
  ];
  const rightInfo = [
    ['Invoice #:', invNum],
    ['Date:', invoice.createdAt?.slice(0,10) || '—'],
    ['Terms:', invoice.dueDate || '30 days net']
  ];

  doc.setFontSize(8);
  info.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...KELTIC.grey);
    doc.text(label, leftX, y + 6 + i * 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...KELTIC.dark);
    doc.text(String(val), leftX + 25, y + 6 + i * 8);
  });
  rightInfo.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...KELTIC.grey);
    doc.text(label, rightX, y + 6 + i * 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...KELTIC.dark);
    doc.text(String(val), rightX + 22, y + 6 + i * 8);
  });

  y += 32;

  // Line items table
  y = sectionHeader(doc, y, 'Services Rendered');
  const itCols = [
    { text: 'Description',  x: MARGIN,     w: 100 },
    { text: 'Qty',          x: MARGIN+100, w: 20  },
    { text: 'Rate',         x: MARGIN+120, w: 30, align: 'right' },
    { text: 'Amount',       x: MARGIN+150, w: 40, align: 'right' }
  ];
  y = tableHeader(doc, y, itCols);

  let subtotal = 0;
  items.forEach((item, i) => {
    const bg = i % 2 === 0 ? KELTIC.rowWhite : KELTIC.rowAlt;
    doc.setFillColor(...bg);
    doc.rect(MARGIN, y, COL_W, 7, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...KELTIC.dark);
    doc.text(String(item.description || '').slice(0, 55), MARGIN + 2, y + 5);
    doc.text(String(item.quantity || 1), MARGIN + 102, y + 5);
    doc.text(`$${Number(item.rate || 0).toFixed(2)}`, MARGIN + 149, y + 5, { align: 'right' });
    const amt = (item.quantity || 1) * (item.rate || 0);
    subtotal += amt;
    doc.text(`$${amt.toFixed(2)}`, MARGIN + 189, y + 5, { align: 'right' });
    y += 7;
  });

  y += 4;
  const gst    = subtotal * 0.05;
  const grand  = subtotal + gst;

  const totals = [['Subtotal', subtotal], ['GST (5%)', gst]];
  totals.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...KELTIC.grey);
    doc.text(label, MARGIN + 140, y);
    doc.setTextColor(...KELTIC.dark);
    doc.text(`$${val.toFixed(2)}`, MARGIN + 189, y, { align: 'right' });
    y += 7;
  });

  doc.setFillColor(...KELTIC.green);
  doc.rect(MARGIN + 120, y - 1, COL_W - 120, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...KELTIC.white);
  doc.text('TOTAL DUE', MARGIN + 122, y + 7);
  doc.text(`$${grand.toFixed(2)}`, MARGIN + 189, y + 7, { align: 'right' });
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...KELTIC.grey);
  doc.text('Please reference the invoice number when making payment. Thank you for your business.', MARGIN, y);

  kelticFooter(doc, 1, 1);

  return doc;
}
