import type { jsPDF as JsPdf } from 'jspdf';
import { formatINRPlain, formatNumber } from '@/lib/format';
import { PROJECTION_YEARS } from '@/lib/poultryFinance';
import { downloadBlob, reportFileName, type ReportData } from './reportData';
import { APP_NAME } from '@/config/app';

type Rgb = [number, number, number];

const BRAND: Rgb = [31, 111, 74];
const BRAND_SOFT: Rgb = [232, 243, 237];
const INK: Rgb = [24, 33, 29];
const MUTED: Rgb = [104, 114, 109];
const BORDER: Rgb = [222, 228, 224];
const DANGER: Rgb = [190, 64, 52];
const WARN: Rgb = [166, 104, 20];

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
    .replace(/²/g, '2')
    .replace(/[\u00a0\u2009\u202f]/g, ' ');
  // eslint-disable-next-line no-control-regex
  return { text, printable: !/[^\x00-\xff]/.test(text) };
}

const pdfText = (value: string) => toPdfText(value).text;

interface AutoTableDoc extends JsPdf {
  lastAutoTable?: { finalY: number };
}

/**
 * Builds the report document in memory (no download), so it can be tested. The sections follow the order NABARD's
 * model projects and NLM applications use: technical, financial, managerial, then compliance.
 */
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

  const partHeading = (title: string) => {
    doc.addPage();
    y = PAGE_MARGIN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setColor(BRAND);
    doc.text(pdfText(title.toUpperCase()), PAGE_MARGIN, y);
    y += 7;
  };

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
      const lines = doc.splitTextToSize(pdfText(subtitle), contentWidth - 4) as string[];
      lines.forEach((line) => {
        doc.text(line, PAGE_MARGIN + 4, y);
        y += 4;
      });
      y += 1;
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

  const bullets = (items: string[], color: Rgb = INK) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(color);
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

  const { config, labels, result, financials } = data;
  const figures = data.assumptions as unknown as Record<string, number>;
  const layer = financials.product === 'eggs';
  const contract = config.farmingModel === 'contract';
  const money = (value: number) => formatINRPlain(value);

  /* ------------------------------- cover ------------------------------- */
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 46, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(198, 228, 211);
  doc.text(pdfText(APP_NAME.toUpperCase()), PAGE_MARGIN, 15);
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

  const metrics: Array<[string, string]> = [
    ['Capital cost', money(result.cost.capitalCost)],
    ['Birds housed', formatNumber(result.flock.birds)],
    ['Profit a year', money(financials.annualProfit)],
    ['Payback', financials.paybackYears === null ? 'Does not pay back' : `${formatNumber(financials.paybackYears)} years`],
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
    doc.text(pdfText(value), x + 3, y + 14.5);
  });
  y += 28;

  if (data.snapshot) {
    const imageHeight = contentWidth * 0.5;
    try {
      doc.setDrawColor(...BORDER);
      doc.roundedRect(PAGE_MARGIN, y, contentWidth, imageHeight, 2, 2, 'S');
      // Fit the capture inside the frame without distorting it, centred horizontally.
      const props = doc.getImageProperties(data.snapshot);
      const scale = Math.min((contentWidth - 1) / props.width, (imageHeight - 1) / props.height);
      const drawWidth = props.width * scale;
      const drawHeight = props.height * scale;
      doc.addImage(data.snapshot, 'JPEG', PAGE_MARGIN + (contentWidth - drawWidth) / 2, y + (imageHeight - drawHeight) / 2, drawWidth, drawHeight);
      y += imageHeight + 8;
    } catch {
      // A corrupt snapshot should never block the rest of the report.
    }
  }
  const openRules = data.siting.filter((rule) => !rule.ticked).length;
  paragraph(
    `${labels.bird}, ${formatNumber(result.flock.birds)} birds in a ${config.length} m x ${config.width} m ${labels.housing.toLowerCase()} (${formatNumber(result.areaSqft)} sq ft), ` +
      `${labels.farmingModel.toLowerCase()}. ${result.schemes.noneApplies ? 'No government scheme applies; the bank loan carries the project.' : ''} ` +
      `${openRules > 0 ? `${openRules} siting or registration item(s) still to confirm (see Compliance).` : 'All siting and registration items confirmed.'}`,
    9.5
  );

  /* ============================== TECHNICAL ============================== */
  partHeading('Part 1 - Technical');
  sectionHeading('The shed');
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Parameter', 'Value', 'Parameter', 'Value']],
    body: [
      ['Size', `${config.length} m x ${config.width} m`, 'Housing', labels.housing],
      ['Floor area', `${formatNumber(result.area)} m2 (${formatNumber(result.areaSqft)} sq ft)`, 'Roof', labels.roof],
      ['Eaves / ridge height', `${config.eavesHeight} m / ${config.ridgeHeight} m`, 'Frame', labels.frame],
      ['Volume', `${formatNumber(result.volume)} m3`, 'Roof sheet', labels.roofSheet],
      ['Birds', `${labels.bird}: ${formatNumber(result.flock.birds)}`, 'Side walls', labels.sideWalls],
      ['Floor space', `${result.flock.sqftPerBird ?? '-'} sq ft a bird${result.flock.normSqftPerBird !== null && result.flock.sqftPerBird !== result.flock.normSqftPerBird ? ` (norm ${result.flock.normSqftPerBird})` : ''}`, 'Entry', labels.entry],
      ['Farming model', labels.farmingModel, 'Feeding', labels.feeding],
    ].map((row) => row.map(pdfText)),
    columnStyles: { 0: { textColor: MUTED }, 2: { textColor: MUTED } },
  });
  y = lastTableY();

  sectionHeading('Production', layer ? 'One flock at a time: grown to point of lay and kept for the laying weeks in this shed.' : 'All-in all-out batches.');
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Figure', 'A year']],
    body: [
      [layer ? 'Flocks' : 'Batches', formatNumber(financials.cyclesPerYear)],
      [layer ? 'Hens culled' : 'Birds sold', formatNumber(financials.birdsSoldPerYear)],
      ...(layer ? [['Eggs', formatNumber(financials.eggsPerYear)]] : [['Live weight sold (kg)', formatNumber(financials.kgSoldPerYear)]]),
      ['Feed (kg)', formatNumber(financials.feedKgPerYear)],
    ],
    columnStyles: { 0: { textColor: MUTED }, 1: { halign: 'right' } },
  });
  y = lastTableY();
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [[layer ? 'Flock' : 'Batch', 'Placed (day)', ...(layer ? ['Starts laying'] : []), layer ? 'Culled' : 'Sold', 'Shed ready']],
    body: result.calendar.map((batch) => [
      String(batch.batch),
      String(batch.placeDay),
      ...(layer ? [String(batch.pointOfLayDay ?? '-')] : []),
      String(batch.saleDay),
      String(batch.readyDay),
    ]),
    styles: { ...tableStyles.styles, fontSize: 8, halign: 'right' },
  });
  y = lastTableY();

  sectionHeading('Site climate', `${data.location} - ${result.climate.climateZone}`);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Average temperature', 'Humidity', 'Annual rainfall', 'Hottest month']],
    body: [
      [
        `${result.climate.avgTemperature} C`,
        `${result.climate.humidity}%`,
        `${formatNumber(result.climate.rainfall)} mm`,
        result.climate.hottestMonthMeanC === null ? '-' : `${result.climate.hottestMonthMeanC} C (24-hour mean)`,
      ],
    ],
  });
  y = lastTableY();
  const heat = result.climate.heatStress;
  if (heat) {
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['THI', ...heat.thiByMonth.map((m) => m.month)]],
      body: [['', ...heat.thiByMonth.map((m) => formatNumber(m.thi))]],
      styles: { ...tableStyles.styles, fontSize: 7.5, halign: 'center', cellPadding: 1.4 },
      didParseCell: (hook) => {
        if (hook.section === 'body' && hook.column.index > 0 && heat.thiByMonth[hook.column.index - 1].thi > heat.threshold) {
          hook.cell.styles.textColor = DANGER;
          hook.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastTableY();
    paragraph(`Temperature-humidity index from NASA POWER monthly means; above ${heat.threshold} (in red) is severe heat stress for the birds.`, 8, MUTED);
  }
  if (result.climate.advisories.length > 0) bullets(result.climate.advisories);

  /* ============================== FINANCIAL ============================== */
  partHeading('Part 2 - Financial');
  sectionHeading('Capital cost', `NABARD 2023-24 rates; the ${result.diagnostics.envelopeFactor === 1 ? '' : `roof and wall area is ${formatNumber(result.diagnostics.envelopeFactor)} times that of `}standard open shed.`);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Item', 'Amount', 'Share']],
    body: data.costItems.map((item) => [pdfText(item.label), money(item.amount), `${(item.share * 100).toFixed(1)}%`]),
    foot: [['Capital cost', money(result.cost.capitalCost), '']],
    footStyles: { fillColor: BRAND_SOFT, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });
  y = lastTableY();
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['First batch (working capital)', 'Amount']],
    body: data.workingItems.map((item) => [pdfText(item.label), money(item.amount)]),
    foot: [
      ['Working capital', money(result.cost.workingCapital.total)],
      ['Project cost (capital + first batch)', money(result.cost.projectCost)],
    ],
    footStyles: { fillColor: BRAND_SOFT, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
  });
  y = lastTableY();
  if (contract) paragraph('Under contract the integrator supplies the chicks, feed and medicines, so the farmer finances the capital cost alone.', 8.5, MUTED);
  if (result.diagnostics.unsourcedRates.length > 0) {
    paragraph(`No published price for: ${result.diagnostics.unsourcedRates.join(', ')}. These use the planner's own rates; get a quotation.`, 8.5, WARN);
  }
  if (result.nabard) {
    const n = result.nabard;
    paragraph(
      `NABARD unit cost (${n.state} ${n.year}): ${money(n.unitCostInr)} for ${formatNumber(n.unitBirds)} birds, ${money(n.perBirdInr)} a bird, ` +
        `${money(n.normCostInr)} for this flock. Your project cost: ${money(n.ownCostInr)}. Cost a bank or scheme recognises: ${money(n.recognisedCostInr)}.` +
        (n.note ? ' NABARD prices open-sided units; a controlled shed is expected to cost more.' : ''),
      9
    );
  }

  sectionHeading('Government schemes', 'Every scheme checked, with its verdict. "Check" depends on facts the planner does not know or on unverified rules.');
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Scheme', 'Verdict', 'Support', 'Why']],
    body: result.schemes.schemes.map((scheme) => [
      pdfText(scheme.name),
      scheme.status === 'not-eligible' ? 'Not eligible' : scheme.status === 'check' ? 'Check' : 'Eligible',
      scheme.status === 'not-eligible'
        ? '-'
        : scheme.interestSubventionPct !== null
          ? `${scheme.interestSubventionPct}% interest subvention`
          : `${scheme.percent ?? 0}%: ${money(scheme.amountInr)}${scheme.verified ? '' : ' (unverified)'}`,
      pdfText(scheme.reasons.join(' ') || '-'),
    ]),
    columnStyles: { 0: { cellWidth: 52 }, 3: { cellWidth: 62 } },
  });
  y = lastTableY();
  if (result.schemes.noneApplies) paragraph('No scheme applies to this farm: the bank loan carries the project.', 9, WARN);

  sectionHeading('Assumptions', 'Each figure with its source. Figures marked "verify" come from secondary or old sources or are the planner\'s own.');
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Assumption', 'Value', 'Source']],
    body: data.assumptionRows.map((row) => [pdfText(row.label), formatNumber(row.value), pdfText(`${row.source ?? 'Your figure'}${row.source && !row.verified ? ' (verify)' : ''}`)]),
    styles: { ...tableStyles.styles, fontSize: 8 },
    columnStyles: { 1: { halign: 'right', cellWidth: 22 }, 2: { cellWidth: 100 } },
  });
  y = lastTableY();

  sectionHeading('Returns', `Planning estimate over ${PROJECTION_YEARS} years.`);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Figure', 'Value', 'Figure', 'Value']],
    body: [
      ['Revenue a year', money(financials.annualRevenue), 'Subsidy counted', money(financials.subsidyAmount)],
      ['Running cost a year', money(financials.annualOperatingCost), 'Net investment', money(financials.netInvestment)],
      ['Profit a year', money(financials.annualProfit), `${PROJECTION_YEARS}-year ROI`, financials.roi === null ? '-' : `${formatNumber(financials.roi * 100)}%`],
      [
        'Break-even price',
        financials.breakEvenPrice === null ? '-' : `Rs ${formatNumber(financials.breakEvenPrice)} ${layer ? 'an egg' : contract ? 'a kg (growing charge)' : 'a kg live'}`,
        'Margin a bird a batch',
        money(financials.marginPerBird),
      ],
    ],
    columnStyles: { 0: { textColor: MUTED }, 1: { halign: 'right' }, 2: { textColor: MUTED }, 3: { halign: 'right' } },
  });
  y = lastTableY();
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['', ...financials.cumulativeCashflow.map((_, year) => `Year ${year}`)]],
    body: [['Cumulative cash', ...financials.cumulativeCashflow.map((value) => money(value))]],
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

  const { loan } = data;
  const perPeriod = { monthly: 'a month', quarterly: 'a quarter', 'half-yearly': 'every 6 months' }[loan.terms.frequency];
  ensureSpace(70);
  sectionHeading(
    'Bank loan and repayment',
    `${formatNumber(loan.terms.loanSharePct)}% term loan at ${formatNumber(loan.terms.interestPct)}% a year over ${loan.terms.tenureYears} years` +
      (loan.terms.moratoriumMonths > 0 ? `, ${loan.terms.moratoriumMonths} months interest only` : '')
  );
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Means of finance', 'Amount', 'Repayment', 'Amount']],
    body: [
      ['Bank term loan', money(loan.loanAmount), 'Instalment', `${money(loan.installment)} ${perPeriod}`],
      ['Your margin', money(loan.margin), 'Interest during moratorium', loan.moratoriumPeriods > 0 ? `${money(loan.moratoriumPayment)} ${perPeriod}` : '-'],
      ['Subsidy in reserve', money(loan.subsidyInReserve), 'Total interest', money(loan.totalInterest)],
      ['Financed cost', money(loan.projectCost), 'Lowest / average DSCR', loan.minDscr === null ? '-' : `${formatNumber(loan.minDscr)} / ${formatNumber(loan.avgDscr ?? 0)}`],
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
      money(row.farmCash),
      money(row.debtService),
      row.subsidyReleased > 0 ? money(row.subsidyReleased) : '-',
      money(row.netCash),
      money(row.cumulative),
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
  paragraph('DSCR = farm cash / loan payments in the year; below 1.0 the farm does not earn enough that year to pay the bank. Default terms: NABARD model bank projects for poultry.', 8, MUTED);

  /* ============================== MANAGERIAL ============================== */
  partHeading('Part 3 - Managerial');
  sectionHeading('How the farm is run');
  bullets([
    contract
      ? 'Contract farming: the integrator supplies chicks, feed and medicines and buys every bird; the farmer provides the shed, labour, litter and power and is paid a growing charge on the live weight.'
      : 'Independent farm: the farmer buys chicks, feed and medicines and sells at the market.',
    layer
      ? `Labour: ${formatNumber(figures.labourInrPerMonth ?? 0)} rupees a month for each ${formatNumber(figures.labourBirdsPerWorker ?? 0)} birds.`
      : `Labour: ${formatNumber(figures.labourInrPerBird ?? 0)} rupees a bird a batch.`,
    'A tie-up with a reputed hatchery, a monthly veterinary visit and a written vaccination schedule (NABARD lending terms).',
    layer ? 'A firm marketing arrangement for the eggs (NABARD lending terms).' : 'A buyer or integrator agreement for the birds before the first placement.',
  ]);
  sectionHeading('Biosecurity', 'DAHD biosecurity guidelines and NABARD lending terms.');
  bullets(data.biosecurity);

  /* ============================== COMPLIANCE ============================== */
  sectionHeading('Siting and registration', `The rules that apply to ${formatNumber(result.flock.birds)} birds. Ticked on the Site step by the farmer.`);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Rule', 'Distance', 'Confirmed']],
    body: data.siting.map((rule) => [pdfText(rule.description), rule.distanceM === null ? '-' : `${formatNumber(rule.distanceM)} m`, rule.ticked ? 'Yes' : 'NOT CONFIRMED']),
    columnStyles: { 1: { halign: 'right', cellWidth: 22 }, 2: { cellWidth: 38 } },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 2 && !data.siting[hook.row.index].ticked) {
        hook.cell.styles.textColor = DANGER;
        hook.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = lastTableY();
  if (openRules > 0) paragraph(`Warning: ${openRules} item(s) not confirmed. Check them before applying for a loan or consent.`, 9, DANGER);

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
    sectionHeading('AI summary (AI-generated)', "Written by an open-source AI model from this project's figures and official documents. Verify before acting.");
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
    doc.text(pdfText(`${APP_NAME} - planning estimate, not a quotation. Confirm prices, schemes and siting locally.`), PAGE_MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 7, { align: 'right' });
  }

  return doc;
}

export async function exportPdfReport(data: ReportData): Promise<void> {
  const doc = await buildPdfReport(data);
  downloadBlob(doc.output('blob'), reportFileName(data, 'pdf'));
}
