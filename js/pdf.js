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

// Page constants (US Letter in mm — 8.5×11")
const PAGE_W = 215.9;
const PAGE_H = 279.4;
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
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

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
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

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

  // ─── Client Signature ─────────────────────────────────────────────────────
  if (invoice.signatureDataUrl) {
    // ensure room on current page
    if (y + 42 > PAGE_H - 20) { doc.addPage(); y = MARGIN; }
    doc.setDrawColor(...KELTIC.green);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...KELTIC.dark);
    doc.text('CLIENT ACCEPTANCE', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
    doc.text(`Signed by: ${invoice.signedBy || ''}  |  Date: ${(invoice.signedAt || '').slice(0,10)}`, MARGIN, y);
    y += 4;
    try {
      doc.addImage(invoice.signatureDataUrl, 'PNG', MARGIN, y, 80, 22, undefined, 'FAST');
    } catch(e) {}
    y += 26;
    doc.setDrawColor(180,180,180);
    doc.line(MARGIN, y, MARGIN + 80, y);
  }

  return doc;
}

// ─── FLHA PDF ─────────────────────────────────────────────────────────────────
export async function generateFLHAPDF(formData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const PW = 216, PH = 279, M = 10, CW = PW - M * 2;
  let y = M;

  function checkPage(needed) {
    if (y + (needed || 20) > PH - 14) { doc.addPage(); y = M; }
  }

  function catHdr(text, color) {
    checkPage(10);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(M, y, CW, 5.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(text.toUpperCase(), M + 2, y + 3.8);
    doc.setTextColor(30, 30, 30); y += 7;
  }

  // Page header
  doc.setFillColor(20, 80, 40);
  doc.rect(0, 0, PW, 20, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255,255,255);
  doc.text('KELTIC GEOMATICS', M, 9);
  doc.setFontSize(9);
  doc.text('Field Level Hazard Assessment (FLHA)', M, 16);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
  doc.text('Form #FLHA2015/003', PW - M, 9, { align: 'right' });
  doc.text('Date: ' + (formData.date || ''), PW - M, 16, { align: 'right' });
  y = 26;

  // Info block
  doc.setFillColor(20,80,40); doc.rect(M, y, CW, 6, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text('JOB INFORMATION', M + 2, y + 4.2);
  doc.setTextColor(30,30,30); y += 7;
  const info = [
    ['Company:', formData.company || 'Keltic Geomatics', 'Prepared By:', formData.preparedBy || ''],
    ['Work Description:', formData.task || '', 'Location:', formData.location || ''],
    ['Muster Point:', formData.muster || '', 'PPE Inspected:', formData.ppe === 'yes' ? 'Yes ✓' : formData.ppe === 'partial' ? 'Partial' : 'No']
  ];
  info.forEach(([l1,v1,l2,v2]) => {
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    doc.text(l1, M, y); doc.setFont('helvetica','normal'); doc.text(v1, M+36, y);
    if (l2) { doc.setFont('helvetica','bold'); doc.text(l2, M+108, y); doc.setFont('helvetica','normal'); doc.text(v2, M+138, y); }
    y += 5.5;
  });
  y += 3;

  // STOP & THINK banner
  doc.setFillColor(231,76,60); doc.rect(M, y, CW, 9, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255,255,255);
  doc.text('STOP & THINK  —  Identify ALL Hazards Before Starting Work', PW/2, y+6.2, { align:'center' });
  doc.setTextColor(30,30,30); y += 13;

  // Legend
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5);
  doc.text('SEVERITY: 1=Fatality/Perm Disability  2=LTI/Medical Aid  3=First Aid  4=Near Miss  5=Property Only', M, y); y += 4;
  doc.text('PROBABILITY: A=Certain/Likely  B=Unusual/Possible  C=Conceivable  D=Remote  E=Practically Impossible', M, y); y += 6;

  // Hazard section header
  doc.setFillColor(20,80,40); doc.rect(M, y, CW, 6, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text('HAZARD IDENTIFICATION — CHECK ALL THAT APPLY', M + 2, y + 4.2);
  doc.setTextColor(30,30,30); y += 7;

  const checkedSet = new Set((formData.hazards||[]).map(h => h.item));
  const cats = [
    { title:'Environmental', color:[46,204,113], items:['1. Extreme heat / sun exposure','2. Extreme cold / wind chill','3. Rain / wet / slippery conditions','4. Lightning / electrical storm','5. High winds / gusts','6. Poor visibility / fog / dust','7. Icy / frozen surfaces','8. Wildlife / animal hazards','9. Insects / vector-borne hazards','10. Terrain hazards (slopes, ditches, soft ground)','11. Flooding / standing water / spring thaw'] },
    { title:'Ergonomic', color:[52,152,219], items:['12. Awkward posture / body positioning','13. Manual material handling','14. Heavy lifting / lowering','15. Repetitive motion / strain','16. Prolonged standing / walking on uneven ground','17. Hand-arm vibration (equipment use)','18. Fatigue / physical exertion'] },
    { title:'Access / Egress', color:[230,126,34], items:['19. Uneven / unstable ground surface','20. Working at elevation (banks, embankments)','21. Confined / restricted space','22. Trenches / excavations nearby','23. Unimproved / off-road access','24. Entering / exiting vehicles or equipment','25. Slip, trip and fall hazards'] },
    { title:'Overhead', color:[155,89,182], items:['26. Overhead power lines (within 7m)','27. Falling objects / tools from above','28. Suspended loads / rigging overhead','29. Low clearance structures / bridges','30. Unstable overhead tree branches / widowmakers','31. Low-flying aircraft / helicopter operations','32. Birds / nests / wasp nests overhead'] },
    { title:'Rigging & Hoisting', color:[231,76,60], items:['33. Improper rigging / incorrect sling angle','34. Load swinging / unexpected movement','35. Equipment overload / capacity exceeded','36. Ground instability under crane / equipment','37. Communication failure during lift','38. Tag line control / load management'] },
    { title:'Electrical', color:[243,156,18], items:['39. Buried / underground utilities (gas, power, telecom)','40. Overhead conductors / energized lines','41. Ground fault / stray current','42. Equipment power failure or malfunction','43. Temporary power sources / generators','44. Electromagnetic interference (GPS, radio equipment)'] },
    { title:'Personal Limitations', color:[26,188,156], items:['45. Fatigue / insufficient rest (< 8 hours)','46. Physical impairment / existing injury','47. Medication effects / substance impairment','48. Lack of training / unfamiliarity with task'] }
  ];

  cats.forEach(cat => {
    const rows = Math.ceil(cat.items.length / 2);
    checkPage(8 + rows * 4.8);
    catHdr(cat.title, cat.color);
    const halfW = CW / 2;
    for (let i = 0; i < cat.items.length; i += 2) {
      checkPage(5);
      [cat.items[i], cat.items[i+1]].forEach((item, ci) => {
        if (!item) return;
        const x = M + ci * halfW;
        const chk = checkedSet.has(item);
        doc.setFillColor(chk ? cat.color[0] : 255, chk ? cat.color[1] : 255, chk ? cat.color[2] : 255);
        doc.setDrawColor(120,120,120);
        doc.rect(x + 1, y - 2.8, 3.5, 3.5, chk ? 'FD' : 'S');
        if (chk) { doc.setFont('helvetica','bold'); doc.setFontSize(5.5); doc.setTextColor(255,255,255); doc.text('✓', x + 1.6, y + 0.2); }
        doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(30,30,30);
        doc.text(item, x + 6, y, { maxWidth: halfW - 8 });
      });
      y += 4.8;
    }
    y += 2;
  });

  // Tasks / Hazards / Controls table
  checkPage(50);
  doc.setFillColor(20,80,40); doc.rect(M, y, CW, 6, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text('TASKS / HAZARDS / PRIORITY / CONTROL MEASURES', M+2, y+4.2);
  doc.setTextColor(30,30,30); y += 7;

  const tX = [M, M+50, M+100, M+116];
  const tW = [48, 48, 14, CW - 118];
  const tHdrs = ['Task Step','Hazard Identified','Pri.','Control Measure'];
  doc.setFillColor(40,40,40); doc.rect(M, y, CW, 5.5, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(255,255,255);
  tHdrs.forEach((h,i) => doc.text(h, tX[i]+1, y+3.8));
  doc.setTextColor(30,30,30); y += 6;

  const taskRows = formData.taskRows || [];
  while (taskRows.length < 5) taskRows.push({task:'',hazard:'',priority:'',control:''});
  taskRows.forEach((row, ri) => {
    const rh = 8;
    checkPage(rh + 2);
    doc.setFillColor(ri%2===0 ? 255:248, ri%2===0 ? 255:248, ri%2===0 ? 255:248);
    doc.rect(M, y, CW, rh, 'F');
    doc.setDrawColor(180,180,180); doc.rect(M, y, CW, rh, 'S');
    tX.slice(1).forEach(x => doc.line(x, y, x, y+rh));
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.text(row.task||'', tX[0]+1, y+5, {maxWidth:tW[0]-2});
    doc.text(row.hazard||'', tX[1]+1, y+5, {maxWidth:tW[1]-2});
    const priColor = {H:[231,76,60],M:[243,156,18],L:[46,204,113]}[row.priority];
    if (priColor) {
      doc.setFillColor(priColor[0],priColor[1],priColor[2]); doc.rect(tX[2], y, tW[2], rh, 'F');
      doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      doc.text(row.priority, tX[2]+4, y+5); doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
    }
    doc.text(row.control||'', tX[3]+1, y+5, {maxWidth:tW[3]-2});
    y += rh;
  });
  y += 5;

  // Controls
  if (formData.controls) {
    checkPage(20);
    doc.setFillColor(20,80,40); doc.rect(M,y,CW,6,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
    doc.text('ADDITIONAL CONTROLS / EMERGENCY PROCEDURES', M+2, y+4.2);
    doc.setTextColor(30,30,30); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    doc.splitTextToSize(formData.controls, CW-2).forEach(l => { checkPage(5); doc.text(l, M+1, y); y += 4.5; });
    y += 4;
  }

  // Job completion
  checkPage(50);
  doc.setFillColor(20,80,40); doc.rect(M,y,CW,6,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text('JOB COMPLETION CHECKLIST', M+2, y+4.2);
  doc.setTextColor(30,30,30); y += 8;
  ['All tools and equipment accounted for','Site left clean — no debris or hazards remaining','PPE removed and stored properly','Crew members returned safe','Supervisor notified of completion'].forEach(item => {
    checkPage(6);
    doc.setDrawColor(100,100,100); doc.rect(M+1, y-2.8, 4, 4, 'S');
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.text(item, M+7, y); y += 6;
  });
  y += 5;

  // Crew signatures
  checkPage(60);
  doc.setFillColor(20,80,40); doc.rect(M,y,CW,6,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text('CREW ACKNOWLEDGEMENT — PRINT NAME & SIGN', M+2, y+4.2);
  doc.setTextColor(30,30,30); y += 8;

  const crew = (formData.crewRows||[]).length ? formData.crewRows : [{name:'',role:''},{name:'',role:''},{name:'',role:''}];
  const sigX = [M, M + CW/2];
  doc.setFont('helvetica','bold'); doc.setFontSize(7);
  sigX.forEach(x => {
    doc.text('Name / Print:', x, y);
    doc.text('Role:', x+60, y);
    doc.text('Signature:', x+88, y);
  });
  y += 4;
  for (let i = 0; i < crew.length; i += 2) {
    checkPage(16);
    [crew[i], crew[i+1]].forEach((cr, ci) => {
      if (!cr) return;
      const x = sigX[ci] || M;
      doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text(cr.name||'', x, y+4);
      doc.text(cr.role||'', x+60, y+4);
      doc.setDrawColor(100,100,100);
      doc.line(x, y+6, x+52, y+6);
      doc.line(x+60, y+6, x+82, y+6);
      doc.line(x+88, y+6, x + CW/2 - 4, y+6);
    });
    y += 14;
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFillColor(20,80,40); doc.rect(0, PH-10, PW, 10, 'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(255,255,255);
    doc.text('Keltic Geomatics — Field Level Hazard Assessment — Form #FLHA2015/003', M, PH-4);
    doc.text('Page ' + pg + ' of ' + totalPages, PW-M, PH-4, { align:'right' });
  }
  return doc;
}

// ─── PURCHASE ORDER PDF ───────────────────────────────────────────────────────
export async function generatePOPDF(po, project, user) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  const poNum = `PO-${String(po.id).padStart(4,'0')}`;
  const projName = project?.name || '—';
  const clientName = project?.clientName || '—';
  const userName = user?.name || '—';

  // Header
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...KELTIC.white);
  doc.text('KELTIC GEOMATICS', MARGIN, 10);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Land & Engineering Surveys', MARGIN, 15);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('PURCHASE ORDER', PAGE_W - MARGIN, 10, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(poNum, PAGE_W - MARGIN, 16, { align: 'right' });

  let y = 30;

  // Info block
  const infoLines = [
    ['Requested By', userName],
    ['Project', projName],
    ['Client', clientName],
    ['Date', po.date || new Date().toISOString().slice(0,10)],
    ['Status', (po.status || 'pending').toUpperCase()],
  ];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const [label, val] of infoLines) {
    doc.setTextColor(...KELTIC.dark); doc.setFont('helvetica', 'bold');
    doc.text(label + ':', MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60,60,60);
    doc.text(String(val), MARGIN + 38, y);
    y += 6;
  }
  y += 4;

  // Divider
  doc.setDrawColor(...KELTIC.green); doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 6;

  // Vendor & Description
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...KELTIC.dark);
  doc.text('Vendor', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  doc.text(po.vendorName || '—', MARGIN, y); y += 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...KELTIC.dark);
  doc.text('Description', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  const descLines = doc.splitTextToSize(po.description || '—', PAGE_W - MARGIN * 2);
  doc.text(descLines, MARGIN, y); y += descLines.length * 5 + 4;

  // Cost box
  doc.setFillColor(248, 252, 249);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 14, 'F');
  doc.setDrawColor(...KELTIC.lightGrey);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 14, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...KELTIC.dark);
  doc.text('Estimated Cost:', MARGIN + 4, y + 9);
  doc.setTextColor(...KELTIC.green); doc.setFontSize(13);
  doc.text(`$${Number(po.estimatedCost || 0).toFixed(2)}`, PAGE_W - MARGIN - 4, y + 9, { align: 'right' });
  y += 20;

  if (po.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...KELTIC.dark);
    doc.text('Notes:', MARGIN, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80,80,80);
    const noteLines = doc.splitTextToSize(po.notes, PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, y); y += noteLines.length * 5 + 6;
  }

  // Approval block
  if (po.status === 'approved') {
    y += 4;
    doc.setDrawColor(...KELTIC.green); doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...KELTIC.green);
    doc.text('APPROVED', MARGIN, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
    doc.text(`Approved: ${(po.approvedAt || '').slice(0,10)}`, MARGIN, y);
  }

  // Footer
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...KELTIC.white);
  doc.text('Keltic Geomatics — Purchase Order', MARGIN, PAGE_H - 4);
  doc.text(poNum, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });

  return doc;
}

// ─── SIMOPS PDF ───────────────────────────────────────────────────────────────
export async function generateSIMOPSPDF(formData, project) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = 0;

  const M = MARGIN;
  const CW = PAGE_W - M * 2;

  function checkPage(need) {
    if (y + need > PAGE_H - 15) { doc.addPage(); y = M; }
  }

  // Header
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...KELTIC.white);
  doc.text('KELTIC GEOMATICS', M, 9);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Land & Engineering Surveys', M, 14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('SIMOPS FORM', PAGE_W - M, 9, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(formData.date || '', PAGE_W - M, 14, { align: 'right' });
  y = 28;

  // Info
  const info = [
    ['Location', formData.location || '—'],
    ['Project', project?.name || '—'],
    ['Supervisor', formData.supervisor || '—'],
    ['Date', formData.date || '—'],
    ['Radio Channel', formData.radioChannel || '—'],
    ['Check-in Freq', formData.checkinFrequency || '—'],
    ['Emergency Contact', formData.emergencyContact || '—'],
    ['Muster Point', formData.musterPoint || '—'],
  ];
  doc.setFontSize(9);
  for (const [k, v] of info) {
    checkPage(6);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...KELTIC.dark); doc.text(k + ':', M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60,60,60); doc.text(String(v), M + 44, y);
    y += 5.5;
  }
  y += 3;

  // Work description
  checkPage(20);
  doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.rect(M, y, CW, 6, 'F'); doc.text('WORK DESCRIPTION', M + 2, y + 4); y += 8;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(40,40,40);
  const descLines = doc.splitTextToSize(formData.workDescription || '—', CW);
  checkPage(descLines.length * 4 + 2);
  doc.text(descLines, M, y); y += descLines.length * 4 + 6;

  // Simultaneous operations
  if (formData.operations?.length) {
    checkPage(20);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SIMULTANEOUS OPERATIONS', M + 2, y + 4); y += 8;
    for (const op of formData.operations) {
      checkPage(12);
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...KELTIC.dark);
      doc.text(op.name || '—', M, y);
      doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
      doc.text(`${op.company || ''}  |  Sup: ${op.supervisor || ''}  |  Ph: ${op.phone || ''}`, M + 2, y + 4);
      y += 9;
    }
    y += 3;
  }

  // Hazards
  if (formData.hazards?.length) {
    checkPage(16);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('IDENTIFIED HAZARDS', M + 2, y + 4); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(40,40,40);
    formData.hazards.forEach(h => { checkPage(5); doc.text('• ' + h, M + 2, y); y += 4.5; });
    y += 4;
  }

  // Signoffs
  if (formData.signoffs?.length) {
    checkPage(20);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SIGN-OFFS', M + 2, y + 4); y += 8;
    for (const so of formData.signoffs) {
      checkPage(28);
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...KELTIC.dark);
      doc.text(so.name || '—', M, y); y += 4;
      if (so.signature) {
        try { doc.addImage(so.signature, 'PNG', M, y, 60, 18, undefined, 'FAST'); } catch(e) {}
        y += 20;
      }
      doc.setDrawColor(150,150,150); doc.line(M, y, M + 70, y); y += 5;
    }
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    doc.setFillColor(...KELTIC.green); doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...KELTIC.white);
    doc.text('Keltic Geomatics — SIMOPS Form', M, PAGE_H - 4);
    doc.text(`Page ${pg} of ${total}`, PAGE_W - M, PAGE_H - 4, { align: 'right' });
  }
  return doc;
}

// ─── ENVIRONMENTAL SAFETY FORM PDF ────────────────────────────────────────────
export async function generateEnvironmentalPDF(formData, project) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = 0;
  const M = MARGIN;
  const CW = PAGE_W - M * 2;

  function checkPage(need) {
    if (y + need > PAGE_H - 15) { doc.addPage(); y = M; }
  }

  // Header
  doc.setFillColor(...KELTIC.green);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...KELTIC.white);
  doc.text('KELTIC GEOMATICS', M, 9);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Land & Engineering Surveys', M, 14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('ENVIRONMENTAL SAFETY FORM', PAGE_W - M, 9, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(formData.date || '', PAGE_W - M, 14, { align: 'right' });
  y = 28;

  // Info
  const info = [
    ['Date', formData.date || '—'],
    ['Location', formData.location || '—'],
    ['Project', project?.name || '—'],
    ['Weather', formData.weather || '—'],
  ];
  doc.setFontSize(9);
  for (const [k, v] of info) {
    checkPage(6);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...KELTIC.dark); doc.text(k + ':', M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60,60,60); doc.text(String(v), M + 26, y);
    y += 5.5;
  }
  y += 4;

  // Section 1: Hazards
  if (formData.hazards?.length) {
    checkPage(16);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SECTION 1 — ENVIRONMENTAL HAZARDS', M + 2, y + 4); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(40,40,40);
    formData.hazards.forEach(h => { checkPage(5); doc.text('• ' + h, M + 2, y); y += 4.5; });
    y += 4;
  }

  // Section 2: Mitigations
  if (formData.mitigations?.length) {
    checkPage(16);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SECTION 2 — MITIGATION MEASURES', M + 2, y + 4); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(40,40,40);
    formData.mitigations.forEach(m => { checkPage(5); doc.text('• ' + m, M + 2, y); y += 4.5; });
    y += 4;
  }

  // Section 3: Spill Kit
  if (formData.spillKit?.length) {
    checkPage(16);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SECTION 3 — SPILL KIT INVENTORY (CONFIRMED)', M + 2, y + 4); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(40,40,40);
    formData.spillKit.forEach(item => { checkPage(5); doc.text('✓ ' + item, M + 2, y); y += 4.5; });
    y += 4;
  }

  // Section 4: Waste
  if (formData.wasteItems?.length) {
    checkPage(16);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SECTION 4 — WASTE MANAGEMENT', M + 2, y + 4); y += 8;
    // Table header
    doc.setFillColor(230,245,235); doc.rect(M, y, CW, 6, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...KELTIC.dark);
    doc.text('Waste Type', M + 2, y + 4);
    doc.text('Disposal Method', M + CW * 0.4 + 2, y + 4);
    doc.text('Container', M + CW * 0.75 + 2, y + 4);
    y += 7;
    doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40);
    formData.wasteItems.forEach((w, i) => {
      checkPage(6);
      if (i % 2 === 0) { doc.setFillColor(250,250,250); doc.rect(M, y - 1, CW, 6, 'F'); }
      doc.text(w.type || '—', M + 2, y + 3);
      doc.text(w.disposal || '—', M + CW * 0.4 + 2, y + 3);
      doc.text(w.container || '—', M + CW * 0.75 + 2, y + 3);
      y += 6;
    });
    y += 4;
  }

  // Section 5: Sign-off
  if (formData.supervisorName || formData.supervisorSig) {
    checkPage(30);
    doc.setFillColor(...KELTIC.green); doc.setTextColor(...KELTIC.white); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.rect(M, y, CW, 6, 'F'); doc.text('SECTION 5 — SUPERVISOR SIGN-OFF', M + 2, y + 4); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...KELTIC.dark);
    doc.text(`Name: ${formData.supervisorName || '—'}`, M, y); y += 4;
    if (formData.supervisorSig) {
      try { doc.addImage(formData.supervisorSig, 'PNG', M, y, 60, 18, undefined, 'FAST'); } catch(e) {}
      y += 20;
    }
    doc.setDrawColor(150,150,150); doc.line(M, y, M + 70, y); y += 6;
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    doc.setFillColor(...KELTIC.green); doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...KELTIC.white);
    doc.text('Keltic Geomatics — Environmental Safety Form', M, PAGE_H - 4);
    doc.text(`Page ${pg} of ${total}`, PAGE_W - M, PAGE_H - 4, { align: 'right' });
  }
  return doc;
}
