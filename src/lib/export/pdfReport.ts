import type { jsPDF as JsPdf } from 'jspdf';
import { formatINRPlain, formatNumber } from '@/lib/format';
import { PROJECTION_YEARS, SUBSIDY_AREA_CAP_SQM } from '@/lib/finance';
import { downloadBlob, reportFileName, type ReportData } from './reportData';

type Rgb = [number, number, number];

const BRAND: Rgb = [31, 111, 74];
const BRAND_SOFT: Rgb = [232, 243, 237];
const INK: Rgb = [24, 33, 29];
const MUTED: Rgb = [104, 114, 109];
const BORDER: Rgb = [222, 228, 224];
const DANGER: Rgb = [190, 64, 52];

const PAGE_MARGIN = 16;

/**
 * jsPDF's built-in fonts only cover Latin-1. Normalise common typography and
 * report whether anything unprintable (e.g. Devanagari) remains.
 */
export function toPdfText(value: string): { text: string; printable: boolean } {
  const text = String(value ?? '')
    .replace(/₹\s?/g, 'Rs ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\u00a0\u2009\u202f]/g, ' ');
  // eslint-disable-next-line no-control-regex
  return { text, printable: !/[^\x00-\xff]/.test(text) };
}

const pdfText = (value: string) => toPdfText(value).text;

interface AutoTableDoc extends JsPdf {
  lastAutoTable?: { finalY: number };
}

/** Builds the report document in memory (no download), so it can be tested. */
export async function buildPdfReport(data: ReportData): Promise<JsPdf> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc: AutoTableDoc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const bottomLimit = pageHeight - 20;
  let y = PAGE_MARGIN;

  const setColor = (rgb: Rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };
  const lastTableY = () => (doc.lastAutoTable?.finalY ?? y) + 6;

  const sectionHeading = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 18 : 12);
    doc.setFillColor(...BRAND);
    doc.rect(PAGE_MARGIN, y - 3.6, 1.2, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setColor(INK);
    doc.text(pdfText(title), PAGE_MARGIN + 4, y);
    y += 5;
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setColor(MUTED);
      doc.text(pdfText(subtitle), PAGE_MARGIN + 4, y);
      y += 5;
    }
    y += 2;
  };

  const paragraph = (text: string, size = 9.5, color: Rgb = INK) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    setColor(color);
    const lines = doc.splitTextToSize(pdfText(text), contentWidth) as string[];
    lines.forEach((line) => {
      ensureSpace(5);
      doc.text(line, PAGE_MARGIN, y);
      y += size * 0.45;
    });
    y += 2;
  };

  const bullets = (items: string[]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(INK);
    items.forEach((item) => {
      const lines = doc.splitTextToSize(pdfText(item), contentWidth - 5) as string[];
      lines.forEach((line, index) => {
        ensureSpace(5);
        if (index === 0) {
          doc.setFillColor(...BRAND);
          doc.circle(PAGE_MARGIN + 1.2, y - 1.2, 0.7, 'F');
        }
        doc.text(line, PAGE_MARGIN + 5, y);
        y += 4.3;
      });
    });
    y += 2;
  };

  const tableStyles = {
    theme: 'grid' as const,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: INK, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255] as Rgb, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [249, 251, 250] as Rgb },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  };

  /* ------------------------------- cover ------------------------------- */
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 46, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(198, 228, 211);
  doc.text('GREENHOUSE IQ', PAGE_MARGIN, 15);
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(pdfText(data.title), PAGE_MARGIN, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(222, 240, 230);
  doc.text(
    pdfText(`${data.location || 'Location not set'}  |  Generated ${data.generatedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`),
    PAGE_MARGIN,
    36
  );
  y = 56;

  const { financials, result } = data;
  const metrics: Array<[string, string]> = [
    ['Total project cost', formatINRPlain(result.cost.totalCost)],
    ['Cost per m2', formatINRPlain(result.cost.costPerSqm)],
    ['After subsidy', formatINRPlain(financials.netInvestment)],
    [
      'Payback period',
      financials.paybackYears === null ? 'Does not pay back' : `${formatNumber(financials.paybackYears)} years`,
    ],
  ];
  const gap = 4;
  const boxWidth = (contentWidth - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * (boxWidth + gap);
    doc.setFillColor(...(index === 0 ? BRAND_SOFT : ([248, 250, 249] as Rgb)));
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, boxWidth, 20, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(MUTED);
    doc.text(label.toUpperCase(), x + 3, y + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    setColor(index === 0 ? BRAND : INK);
    doc.text(value, x + 3, y + 14.5);
  });
  y += 28;

  if (data.snapshot) {
    const imageHeight = contentWidth * 0.5;
    try {
      doc.setDrawColor(...BORDER);
      doc.roundedRect(PAGE_MARGIN, y, contentWidth, imageHeight, 2, 2, 'S');
      // Fit the capture inside the frame without distorting it (the viewer is
      // rarely the frame's 2:1 shape), centred horizontally.
      const props = doc.getImageProperties(data.snapshot);
      const scale = Math.min((contentWidth - 1) / props.width, (imageHeight - 1) / props.height);
      const drawWidth = props.width * scale;
      const drawHeight = props.height * scale;
      doc.addImage(
        data.snapshot,
        'JPEG',
        PAGE_MARGIN + (contentWidth - drawWidth) / 2,
        y + (imageHeight - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
      y += imageHeight + 8;
    } catch {
      // A corrupt snapshot should never block the rest of the report.
    }
  }

  sectionHeading('Project configuration');
  const { config, labels } = data;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Parameter', 'Value', 'Parameter', 'Value']],
    body: [
      ['Dimensions', `${config.length} m x ${config.width} m`, 'Greenhouse type', labels.type],
      ['Floor area', `${formatNumber(result.area)} m2`, 'Roof', labels.roof],
      ['Gutter / ridge height', `${config.gutterHeight} m / ${config.ridgeHeight} m`, 'Frame', labels.structure],
      ['Volume', `${formatNumber(result.volume)} m3`, 'Cover', labels.cover],
      ['Primary crop', labels.crop, 'Side ventilation', labels.sideVentilation],
      ['Irrigation', labels.irrigation, 'Door', labels.door],
    ].map((row) => row.map(pdfText)),
    columnStyles: { 0: { textColor: MUTED }, 2: { textColor: MUTED } },
  });
  y = lastTableY();

  /* --------------------------- cost breakdown -------------------------- */
  doc.addPage();
  y = PAGE_MARGIN;
  sectionHeading('Capital cost breakdown', 'Estimated installed cost including labour and climate adjustment.');
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Item', 'Amount', 'Share']],
    body: data.costItems.map((item) => [pdfText(item.label), formatINRPlain(item.amount), `${(item.share * 100).toFixed(1)}%`]),
    foot: [
      [
        `Total (incl. ${((result.cost.climateAdjustment ?? 0) * 100).toFixed(0)}% climate adjustment)`,
        formatINRPlain(result.cost.totalCost),
        '',
      ],
    ],
    footStyles: { fillColor: BRAND_SOFT, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });
  y = lastTableY();

  // Horizontal bar chart of the same breakdown.
  ensureSpace(data.costItems.length * 7 + 6);
  const labelWidth = 44;
  const barMax = contentWidth - labelWidth - 26;
  const largest = Math.max(...data.costItems.map((item) => item.amount), 1);
  doc.setFontSize(8.5);
  data.costItems.forEach((item) => {
    const barWidth = Math.max(0.5, (item.amount / largest) * barMax);
    doc.setFont('helvetica', 'normal');
    setColor(MUTED);
    doc.text(pdfText(item.label), PAGE_MARGIN, y + 3.4);
    doc.setFillColor(...BRAND);
    doc.roundedRect(PAGE_MARGIN + labelWidth, y, barWidth, 4.6, 1, 1, 'F');
    setColor(INK);
    doc.text(`${(item.share * 100).toFixed(0)}%`, PAGE_MARGIN + labelWidth + barWidth + 2, y + 3.4);
    y += 7;
  });
  y += 4;

  /* ------------------------ investment & returns ----------------------- */
  sectionHeading(
    'Investment & returns',
    `Planning estimate over ${PROJECTION_YEARS} years. ${
      result.subsidy
        ? `Subsidy: ${result.subsidy.scheme === 'NHB' ? 'NHB' : 'state mission (MIDH 2025)'} norm of ${formatINRPlain(result.subsidy.normPerSqmInr)}/m2 on ${formatNumber(result.subsidy.eligibleAreaSqm)} m2.`
        : `Subsidy applies to the first ${formatNumber(SUBSIDY_AREA_CAP_SQM)} m2.`
    }`
  );
  const { assumptions } = data;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Assumption', 'Value', 'Result', 'Value']],
    body: [
      ['Capital subsidy', `${assumptions.subsidyPct}%`, 'Subsidy amount', formatINRPlain(financials.subsidyAmount)],
      ['Yield', `${assumptions.yieldPerSqm} ${data.unit}/m2/yr`, 'Net investment', formatINRPlain(financials.netInvestment)],
      ['Farm-gate price', `Rs ${assumptions.pricePerUnit}/${data.unit}`, 'Annual revenue', formatINRPlain(financials.annualRevenue)],
      ['Operating cost', `${assumptions.operatingCostPct}% of revenue`, 'Annual profit', formatINRPlain(financials.annualProfit)],
      [
        'Cultivable area',
        '85% of floor area',
        `${PROJECTION_YEARS}-year ROI`,
        financials.roi === null ? '-' : `${formatNumber(financials.roi * 100)}%`,
      ],
    ],
    columnStyles: { 0: { textColor: MUTED }, 2: { textColor: MUTED }, 3: { halign: 'right' } },
  });
  y = lastTableY();

  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['', ...financials.cumulativeCashflow.map((_, year) => `Year ${year}`)]],
    body: [['Cumulative cash', ...financials.cumulativeCashflow.map((value) => formatINRPlain(value))]],
    styles: { ...tableStyles.styles, fontSize: 8, halign: 'right' },
    columnStyles: { 0: { halign: 'left', textColor: MUTED } },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index > 0) {
        const value = financials.cumulativeCashflow[hook.column.index - 1];
        hook.cell.styles.textColor = value < 0 ? DANGER : BRAND;
      }
    },
  });
  y = lastTableY();

  /* ----------------------------- bank loan ----------------------------- */
  const { loan } = data;
  const perPeriod = { monthly: 'a month', quarterly: 'a quarter', 'half-yearly': 'every 6 months' }[loan.terms.frequency];
  ensureSpace(70);
  sectionHeading(
    'Bank loan and repayment',
    `${formatNumber(loan.terms.loanSharePct)}% term loan at ${formatNumber(loan.terms.interestPct)}% a year over ${loan.terms.tenureYears} years`
  );
  paragraph(
    `${loan.terms.moratoriumMonths} months of interest only, then equal ${loan.terms.frequency} instalments. ` +
      'The subsidy is held in a Subsidy Reserve Fund Account and adjusted against the last instalments (NHB), ' +
      'so interest is paid on the whole loan until then.',
    8.5,
    MUTED
  );
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Means of finance', 'Amount', 'Repayment', 'Amount']],
    body: [
      ['Bank term loan', formatINRPlain(loan.loanAmount), 'Instalment after moratorium', `${formatINRPlain(loan.installment)} ${perPeriod}`],
      [
        'Your margin',
        formatINRPlain(loan.margin),
        'Interest during moratorium',
        loan.moratoriumPeriods > 0 ? `${formatINRPlain(loan.moratoriumPayment)} ${perPeriod}` : '-',
      ],
      ['Subsidy in reserve', formatINRPlain(loan.subsidyInReserve), 'Total interest', formatINRPlain(loan.totalInterest)],
      [
        'Project cost',
        formatINRPlain(loan.projectCost),
        'Lowest / average DSCR',
        loan.minDscr === null ? '-' : `${formatNumber(loan.minDscr)} / ${formatNumber(loan.avgDscr ?? 0)}`,
      ],
    ],
    columnStyles: { 0: { textColor: MUTED }, 1: { halign: 'right' }, 2: { textColor: MUTED }, 3: { halign: 'right' } },
  });
  y = lastTableY();
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Year', 'Farm cash', 'Loan payments', 'Subsidy released', 'Left over', 'Cumulative', 'DSCR']],
    body: loan.years.map((row) => [
      `Year ${row.year}`,
      formatINRPlain(row.farmCash),
      formatINRPlain(row.debtService),
      row.subsidyReleased > 0 ? formatINRPlain(row.subsidyReleased) : '-',
      formatINRPlain(row.netCash),
      formatINRPlain(row.cumulative),
      row.dscr === null ? '-' : formatNumber(row.dscr),
    ]),
    styles: { ...tableStyles.styles, fontSize: 8, halign: 'right' },
    columnStyles: { 0: { halign: 'left', textColor: MUTED } },
    didParseCell: (hook) => {
      if (hook.section !== 'body') return;
      const row = loan.years[hook.row.index];
      if ((hook.column.index === 4 && row.netCash < 0) || (hook.column.index === 6 && row.dscr !== null && row.dscr < 1)) {
        hook.cell.styles.textColor = DANGER;
      }
    },
  });
  y = lastTableY();
  paragraph(
    'DSCR = farm cash / loan payments in the year; below 1.0 the farm does not earn enough that year to pay the bank. ' +
      'Farm income is assumed to start when the moratorium ends. Defaults: Central Bank of India poly house scheme (loan up to 80%, ' +
      'up to 7 years with a 3-12 month moratorium) and Canara Bank agriculture term loan rate (one-year MCLR + 2.30%, 18.08.2026).',
    8,
    MUTED
  );

  /* -------------------------- climate & crops -------------------------- */
  doc.addPage();
  y = PAGE_MARGIN;
  sectionHeading('Site climate', `${pdfText(data.location)} - ${pdfText(result.climate.climateZone)}`);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Average temperature', 'Humidity', 'Annual rainfall', 'Climate cost factor']],
    body: [
      [
        `${result.climate.avgTemperature} C`,
        `${result.climate.humidity}%`,
        `${formatNumber(result.climate.rainfall)} mm`,
        `x${result.climate.climateFactor}`,
      ],
    ],
  });
  y = lastTableY();
  if (result.climate.advisories.length > 0) bullets(result.climate.advisories);

  sectionHeading(
    'Crop suggestions',
    data.cropsSource === 'ai' ? 'AI-ranked for this structure, district and irrigation system.' : 'Based on the climate group of the location.'
  );
  const cropsPrintable = data.crops.every((crop) =>
    [crop.name, crop.detail, crop.expectedYield, crop.season].every((field) => toPdfText(field).printable)
  );
  if (cropsPrintable) {
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Crop', 'Suitability', 'Expected yield', 'Season', 'Notes']],
      body: data.crops.map((crop) => [
        pdfText(crop.name),
        crop.suitability.charAt(0).toUpperCase() + crop.suitability.slice(1),
        pdfText(crop.expectedYield),
        pdfText(crop.season),
        pdfText(crop.detail),
      ]),
      columnStyles: { 0: { fontStyle: 'bold' }, 4: { cellWidth: 70 } },
    });
    y = lastTableY();
  } else {
    paragraph('Crop suggestions are in a language the PDF cannot render. Switch the app to English and regenerate to include them.', 9, MUTED);
  }

  /* -------------------- AI summary (only when chosen) ------------------- */
  if (data.advisor) {
    const advisor = data.advisor;
    const allText = [
      advisor.summary,
      ...advisor.strengths,
      ...advisor.risks.flatMap((risk) => [risk.title, risk.detail]),
      ...advisor.recommendations.flatMap((rec) => [rec.title, rec.detail, rec.impact]),
    ];
    ensureSpace(40);
    sectionHeading('AI summary (AI-generated)', 'Written by an open-source AI model from this project\'s figures and official documents. Verify before acting.');
    if (allText.every((text) => toPdfText(text).printable)) {
      doc.setFillColor(...BRAND_SOFT);
      doc.roundedRect(PAGE_MARGIN, y - 1, 42, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setColor(BRAND);
      doc.text(`Verdict: ${advisor.verdict.toUpperCase()}`, PAGE_MARGIN + 3, y + 3.6);
      y += 11;
      paragraph(advisor.summary);
      if (advisor.strengths.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(INK);
        ensureSpace(8);
        doc.text('Strengths', PAGE_MARGIN, y);
        y += 5;
        bullets(advisor.strengths);
      }
      if (advisor.risks.length > 0) {
        autoTable(doc, {
          ...tableStyles,
          startY: y,
          head: [['Risk', 'Severity', 'Detail']],
          body: advisor.risks.map((risk) => [pdfText(risk.title), risk.severity, pdfText(risk.detail)]),
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { cellWidth: 20 } },
        });
        y = lastTableY();
      }
      if (advisor.recommendations.length > 0) {
        autoTable(doc, {
          ...tableStyles,
          startY: y,
          head: [['Recommendation', 'Area', 'Detail', 'Expected impact']],
          body: advisor.recommendations.map((rec) => [pdfText(rec.title), rec.category, pdfText(rec.detail), pdfText(rec.impact)]),
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { cellWidth: 20 }, 3: { cellWidth: 38 } },
        });
        y = lastTableY();
      }
    } else {
      paragraph('The AI summary is in a language the PDF cannot render. Switch the app to English and generate the summary again to include it.', 9, MUTED);
    }
  }

  /* ------------------------------ footers ------------------------------ */
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.line(PAGE_MARGIN, pageHeight - 12, pageWidth - PAGE_MARGIN, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(MUTED);
    doc.text('Greenhouse IQ - planning estimate, not a quotation. Confirm prices and subsidies locally.', PAGE_MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 7, { align: 'right' });
  }

  return doc;
}

export async function exportPdfReport(data: ReportData): Promise<void> {
  const doc = await buildPdfReport(data);
  downloadBlob(doc.output('blob'), reportFileName(data, 'pdf'));
}
