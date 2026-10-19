import type { Workbook, Worksheet } from 'exceljs';
import { CULTIVABLE_AREA_SHARE, PROJECTION_YEARS, subsidyBase } from '@/lib/finance';
import { downloadBlob, reportFileName, type ReportData } from './reportData';
import { APP_NAME } from '@/config/app';

/** Indian digit grouping (₹1,23,45,678) — Excel has no built-in lakh format. */
const INR_FORMAT = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"#,##0';
const PCT_FORMAT = '0.0%';
const BRAND = 'FF1F6F4A';
const BRAND_SOFT = 'FFE8F3ED';
const INPUT_FILL = 'FFFFF7E0';

function styleHeaderRow(sheet: Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle' };
  });
}

function sheetTitle(sheet: Worksheet, title: string, subtitle?: string) {
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 15, color: { argb: BRAND } };
  if (subtitle) {
    sheet.getCell('A2').value = subtitle;
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF68726D' } };
  }
}

/** Builds the workbook in memory (no download), so it can be tested. */
export async function buildExcelWorkbook(data: ReportData): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = data.generatedAt;

  const { config, labels, result, financials, assumptions } = data;

  // Sheets are created up front so they appear in this order.
  const summary = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: BRAND } } });
  const configSheet = workbook.addWorksheet('Configuration');
  const costSheet = workbook.addWorksheet('Cost breakdown');
  const returns = workbook.addWorksheet('Returns');
  const loanSheet = workbook.addWorksheet('Bank loan');
  const climate = workbook.addWorksheet('Climate & crops');

  /* --------------------------- Cost breakdown -------------------------- */
  sheetTitle(costSheet, 'Capital cost breakdown', 'Edit amounts in column B; totals and shares recalculate.');
  costSheet.columns = [{ width: 34 }, { width: 18 }, { width: 10 }];
  costSheet.getRow(4).values = ['Item', 'Amount', 'Share'];
  styleHeaderRow(costSheet, 4);
  const firstItemRow = 5;
  const lastItemRow = firstItemRow + data.costItems.length - 1;
  const subtotalRow = lastItemRow + 1;
  const factorRow = subtotalRow + 1;
  const totalRow = factorRow + 1;
  const subtotal = data.costItems.reduce((sum, item) => sum + item.amount, 0);
  data.costItems.forEach((item, index) => {
    const rowNumber = firstItemRow + index;
    costSheet.getCell(`A${rowNumber}`).value = item.label;
    costSheet.getCell(`B${rowNumber}`).value = item.amount;
    costSheet.getCell(`C${rowNumber}`).value = {
      formula: `IF($B$${subtotalRow}=0,0,B${rowNumber}/$B$${subtotalRow})`,
      result: item.share,
    };
  });
  costSheet.getCell(`A${subtotalRow}`).value = 'Subtotal';
  costSheet.getCell(`B${subtotalRow}`).value = { formula: `SUM(B${firstItemRow}:B${lastItemRow})`, result: subtotal };
  costSheet.getCell(`A${factorRow}`).value = 'Climate cost factor';
  costSheet.getCell(`B${factorRow}`).value = result.climate.climateFactor;
  costSheet.getCell(`A${totalRow}`).value = 'Total project cost';
  costSheet.getCell(`B${totalRow}`).value = {
    formula: `ROUND(B${subtotalRow}*B${factorRow},0)`,
    result: result.cost.totalCost,
  };
  for (let row = firstItemRow; row <= totalRow; row += 1) {
    if (row !== factorRow) costSheet.getCell(`B${row}`).numFmt = INR_FORMAT;
    costSheet.getCell(`C${row}`).numFmt = PCT_FORMAT;
  }
  costSheet.getCell(`B${factorRow}`).numFmt = '0.00';
  [subtotalRow, totalRow].forEach((row) => {
    costSheet.getRow(row).font = { bold: true };
  });
  costSheet.getRow(totalRow).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
  });
  const costTotalRef = `'Cost breakdown'!$B$${totalRow}`;

  /* ------------------------------ Returns ------------------------------ */
  sheetTitle(returns, 'Investment & returns', 'Yellow cells are assumptions; change them to model other scenarios.');
  returns.columns = [{ width: 34 }, { width: 20 }, { width: 4 }, { width: 10 }, { width: 22 }];
  const inputs: Array<[string, number | { formula: string; result: number }, string?]> = [
    ['Capital cost', { formula: costTotalRef, result: result.cost.totalCost }, INR_FORMAT],
    ['Floor area (m²)', result.area, '#,##0'],
    ['Capital subsidy', assumptions.subsidyPct / 100, PCT_FORMAT],
    // The cost the scheme recognises (build cost without irrigation, limited to the government norm).
    ['Cost the subsidy applies to', subsidyBase(result.cost.totalCost, result.area, result.subsidy), INR_FORMAT],
    ['Cultivable share of floor area', CULTIVABLE_AREA_SHARE, PCT_FORMAT],
    [`Yield (${data.unit}/m²/yr)`, assumptions.yieldPerSqm, '#,##0.0'],
    [`Farm-gate price (₹/${data.unit})`, assumptions.pricePerUnit, INR_FORMAT],
    ['Operating cost (share of revenue)', assumptions.operatingCostPct / 100, PCT_FORMAT],
  ];
  returns.getRow(4).values = ['Assumption', 'Value'];
  styleHeaderRow(returns, 4);
  inputs.forEach(([label, value, format], index) => {
    const rowNumber = 5 + index;
    returns.getCell(`A${rowNumber}`).value = label;
    const cell = returns.getCell(`B${rowNumber}`);
    cell.value = value;
    if (format) cell.numFmt = format;
    if (typeof value === 'number') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
    }
  });
  const [capital, area, subsidyPct, base, cultivable, yieldCell, price, opexPct] = [5, 6, 7, 8, 9, 10, 11, 12].map(
    (row) => `$B$${row}`
  );

  const outputsStart = 15;
  returns.getRow(outputsStart - 1).values = ['Result', 'Value'];
  styleHeaderRow(returns, outputsStart - 1);
  const outputs: Array<[string, string, number | string, string]> = [
    [
      'Subsidy amount',
      // Never more than the capital cost, nor than the scheme's per-project limit when it has one.
      `MIN(${base}*${subsidyPct},${result.subsidy?.capInr ? `${result.subsidy.capInr},` : ''}${capital})`,
      financials.subsidyAmount,
      INR_FORMAT,
    ],
    ['Net investment', `${capital}-B${outputsStart}`, financials.netInvestment, INR_FORMAT],
    ['Annual production', `${area}*${cultivable}*${yieldCell}`, financials.annualProduction, '#,##0'],
    ['Annual revenue', `B${outputsStart + 2}*${price}`, financials.annualRevenue, INR_FORMAT],
    ['Annual operating cost', `B${outputsStart + 3}*${opexPct}`, financials.annualOperatingCost, INR_FORMAT],
    ['Annual profit', `B${outputsStart + 3}-B${outputsStart + 4}`, financials.annualProfit, INR_FORMAT],
    [
      'Payback (years)',
      `IF(B${outputsStart + 5}>0,B${outputsStart + 1}/B${outputsStart + 5},"No payback")`,
      financials.paybackYears ?? 'No payback',
      '0.0',
    ],
    [
      `${PROJECTION_YEARS}-year ROI`,
      `IF(B${outputsStart + 1}>0,(B${outputsStart + 5}*${PROJECTION_YEARS}-B${outputsStart + 1})/B${outputsStart + 1},"-")`,
      financials.roi ?? '-',
      PCT_FORMAT,
    ],
  ];
  outputs.forEach(([label, formula, value, format], index) => {
    const rowNumber = outputsStart + index;
    returns.getCell(`A${rowNumber}`).value = label;
    const cell = returns.getCell(`B${rowNumber}`);
    cell.value = { formula, result: value };
    cell.numFmt = format;
    cell.font = { bold: index === 1 || index === 5 || index === 6 };
  });
  const netRef = `$B$${outputsStart + 1}`;
  const profitRef = `$B$${outputsStart + 5}`;

  returns.getRow(4).getCell(4).value = 'Year';
  returns.getRow(4).getCell(5).value = 'Cumulative cash';
  financials.cumulativeCashflow.forEach((value, year) => {
    const rowNumber = 5 + year;
    returns.getCell(`D${rowNumber}`).value = year;
    const cell = returns.getCell(`E${rowNumber}`);
    cell.value = { formula: `-${netRef}+${profitRef}*D${rowNumber}`, result: value };
    cell.numFmt = INR_FORMAT;
  });

  /* ----------------------------- Bank loan ----------------------------- */
  // Same rules as src/lib/loan.ts: interest only during the moratorium, then equal instalments; the subsidy
  // waits in a reserve account and closes the loan once the balance falls within it (NHB back-ended subsidy).
  const { loan } = data;
  sheetTitle(
    loanSheet,
    'Bank term loan and repayment schedule',
    'Edit the yellow cells; the schedule recalculates. Add rows below if you lengthen the loan.'
  );
  loanSheet.columns = [{ width: 30 }, { width: 18 }, { width: 4 }, { width: 9 }, { width: 8 }, { width: 15 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 15 }];
  loanSheet.getRow(4).values = ['Loan input / result', 'Value'];
  styleHeaderRow(loanSheet, 4);
  const L = (row: number) => `$B$${row}`;
  const loanRows: Array<[string, number | { formula: string; result: number }, string, boolean?]> = [
    ['Project cost', { formula: costTotalRef, result: loan.projectCost }, INR_FORMAT],
    ['Loan share (% of cost)', loan.terms.loanSharePct / 100, PCT_FORMAT, true],
    ['Interest (% a year)', loan.terms.interestPct / 100, '0.00%', true],
    ['Repayment years (with moratorium)', loan.terms.tenureYears, '0', true],
    ['Instalments a year (12, 4 or 2)', loan.periodsPerYear, '0', true],
    ['Moratorium (instalment periods)', loan.moratoriumPeriods, '0', true],
    ['Loan amount', { formula: `${L(5)}*${L(6)}`, result: loan.loanAmount }, INR_FORMAT],
    ['Your margin', { formula: `${L(5)}-${L(11)}`, result: loan.margin }, INR_FORMAT],
    ['Subsidy in reserve (capped at loan)', { formula: `MIN(Returns!$B$${outputsStart},${L(11)})`, result: loan.subsidyInReserve }, INR_FORMAT],
    [
      'Instalment after moratorium',
      { formula: `IF(${L(11)}<=0,0,PMT(${L(7)}/${L(9)},${L(8)}*${L(9)}-${L(10)},-${L(11)}))`, result: loan.installment },
      INR_FORMAT,
    ],
  ];
  loanRows.forEach(([label, value, format, isInput], index) => {
    const rowNumber = 5 + index;
    loanSheet.getCell(`A${rowNumber}`).value = label;
    const cell = loanSheet.getCell(`B${rowNumber}`);
    cell.value = value;
    cell.numFmt = format;
    if (isInput) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
  });
  const scheduleHead = 4;
  loanSheet.getRow(scheduleHead).getCell(4).value = 'Period';
  ['Month', 'Opening', 'Interest', 'Principal', 'You pay', 'Subsidy adjusted', 'Closing'].forEach((label, index) => {
    loanSheet.getRow(scheduleHead).getCell(5 + index).value = label;
  });
  ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((column) => {
    const cell = loanSheet.getCell(`${column}${scheduleHead}`);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });
  const totalPeriods = loan.terms.tenureYears * loan.periodsPerYear;
  for (let index = 0; index < totalPeriods; index++) {
    const r = scheduleHead + 1 + index;
    const row = loan.schedule[index];
    const set = (column: string, formula: string, value: number, format = INR_FORMAT) => {
      const cell = loanSheet.getCell(`${column}${r}`);
      cell.value = { formula, result: value };
      cell.numFmt = format;
    };
    loanSheet.getCell(`D${r}`).value = index + 1;
    set('E', `D${r}*12/${L(9)}`, (index + 1) * (12 / loan.periodsPerYear), '0');
    set('F', index === 0 ? L(11) : `K${r - 1}`, row?.opening ?? 0);
    set('G', `F${r}*${L(7)}/${L(9)}`, row?.interest ?? 0);
    set('H', `IF(D${r}<=${L(10)},0,MIN(F${r},${L(14)}-G${r}))`, row?.principal ?? 0);
    set('I', `G${r}+H${r}`, row?.payment ?? 0);
    set('J', `IF(AND(D${r}>${L(10)},F${r}-H${r}>0.005,F${r}-H${r}<=${L(13)}),F${r}-H${r},0)`, row?.subsidyAdjusted ?? 0);
    set('K', `F${r}-H${r}-J${r}`, row?.closing ?? 0);
  }
  const lastScheduleRow = scheduleHead + totalPeriods;
  const totalsRow = 5 + loanRows.length + 1;
  loanSheet.getCell(`A${totalsRow}`).value = 'Total interest';
  loanSheet.getCell(`B${totalsRow}`).value = { formula: `SUM(G${scheduleHead + 1}:G${lastScheduleRow})`, result: loan.totalInterest };
  loanSheet.getCell(`B${totalsRow}`).numFmt = INR_FORMAT;
  loanSheet.getCell(`A${totalsRow + 1}`).value = 'Total you pay the bank';
  loanSheet.getCell(`B${totalsRow + 1}`).value = { formula: `SUM(I${scheduleHead + 1}:I${lastScheduleRow})`, result: loan.totalPaidByFarmer };
  loanSheet.getCell(`B${totalsRow + 1}`).numFmt = INR_FORMAT;

  // Yearly cash flow, to the right of the schedule (columns M-S), as computed by the app.
  const yearColumns = ['M', 'N', 'O', 'P', 'Q', 'R', 'S'];
  ['Year', 'Farm cash', 'Loan payments', 'Subsidy released', 'Left over', 'Cumulative', 'DSCR'].forEach((label, index) => {
    const cell = loanSheet.getCell(`${yearColumns[index]}${scheduleHead}`);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });
  yearColumns.forEach((column, index) => {
    loanSheet.getColumn(column).width = index === 0 ? 7 : 15;
  });
  loan.years.forEach((row, index) => {
    const r = scheduleHead + 1 + index;
    const values = [row.year, row.farmCash, row.debtService, row.subsidyReleased, row.netCash, row.cumulative, row.dscr ?? '-'];
    values.forEach((value, column) => {
      const cell = loanSheet.getCell(`${yearColumns[column]}${r}`);
      cell.value = value;
      cell.numFmt = column === 0 ? '0' : column === 6 ? '0.00' : INR_FORMAT;
    });
  });
  const loanNoteRow = totalsRow + 3;
  loanSheet.getCell(`A${loanNoteRow}`).value =
    'DSCR = farm cash / loan payments in the year (below 1.0 the farm cannot pay the bank that year); farm income starts when the moratorium ends. ' +
    'Defaults: Central Bank of India poly house scheme (loan up to 80%, up to 7 years with a 3-12 month moratorium); Canara Bank agriculture term loans, one-year MCLR + 2.30% (18.08.2026); NHB back-ended subsidy.';
  loanSheet.getCell(`A${loanNoteRow}`).font = { italic: true, color: { argb: 'FF68726D' } };

  /* ------------------------------ Summary ------------------------------ */
  sheetTitle(summary, data.title, `${data.location || 'Location not set'} · ${data.generatedAt.toLocaleDateString('en-IN')}`);
  summary.columns = [{ width: 30 }, { width: 22 }];
  const summaryRows: Array<[string, { formula: string; result: number | string } | string, string?]> = [
    ['Total project cost', { formula: costTotalRef, result: result.cost.totalCost }, INR_FORMAT],
    ['Cost per m²', { formula: `${costTotalRef}/Returns!${area}`, result: result.cost.costPerSqm }, INR_FORMAT],
    ['Subsidy amount', { formula: `Returns!$B$${outputsStart}`, result: financials.subsidyAmount }, INR_FORMAT],
    ['Net investment', { formula: `Returns!${netRef}`, result: financials.netInvestment }, INR_FORMAT],
    ['Annual profit', { formula: `Returns!${profitRef}`, result: financials.annualProfit }, INR_FORMAT],
    [
      'Payback (years)',
      { formula: `Returns!$B$${outputsStart + 6}`, result: financials.paybackYears ?? 'No payback' },
      '0.0',
    ],
    ['Climate zone', result.climate.climateZone],
    ['Primary crop', labels.crop],
  ];
  summary.getRow(4).values = ['Metric', 'Value'];
  styleHeaderRow(summary, 4);
  summaryRows.forEach(([label, value, format], index) => {
    const rowNumber = 5 + index;
    summary.getCell(`A${rowNumber}`).value = label;
    const cell = summary.getCell(`B${rowNumber}`);
    cell.value = value;
    if (format) cell.numFmt = format;
  });
  const noteRow = 6 + summaryRows.length;
  summary.getCell(`A${noteRow}`).value = 'Planning estimate, not a quotation. Confirm prices and subsidy rates locally.';
  summary.getCell(`A${noteRow}`).font = { italic: true, color: { argb: 'FF68726D' } };

  /* ---------------------------- Configuration -------------------------- */
  sheetTitle(configSheet, 'Project configuration');
  configSheet.columns = [{ width: 28 }, { width: 30 }];
  configSheet.getRow(3).values = ['Parameter', 'Value'];
  styleHeaderRow(configSheet, 3);
  const configRows: Array<[string, string | number]> = [
    ['State', config.state],
    ['District', config.district],
    ['Length (m)', config.length],
    ['Width (m)', config.width],
    ['Floor area (m²)', result.area],
    ['Gutter height (m)', config.gutterHeight],
    ['Ridge height (m)', config.ridgeHeight],
    ['Volume (m³)', Math.round(result.volume)],
    ['Greenhouse type', labels.type],
    ['Roof', labels.roof],
    ['Frame', labels.structure],
    ['Cover', labels.cover],
    ['Side ventilation', labels.sideVentilation],
    ['Door', labels.door],
    ['Primary crop', labels.crop],
    ['Irrigation', labels.irrigation],
  ];
  configRows.forEach(([label, value], index) => {
    configSheet.getRow(4 + index).values = [label, value];
  });

  /* -------------------------- Climate & crops -------------------------- */
  sheetTitle(climate, 'Site climate & crop suggestions', data.location);
  climate.columns = [{ width: 24 }, { width: 14 }, { width: 20 }, { width: 20 }, { width: 70 }];
  climate.getRow(4).values = ['Climate zone', 'Temperature', 'Humidity', 'Annual rainfall', 'Advisories'];
  styleHeaderRow(climate, 4);
  climate.getRow(5).values = [
    result.climate.climateZone,
    `${result.climate.avgTemperature} °C`,
    `${result.climate.humidity}%`,
    `${result.climate.rainfall} mm`,
    result.climate.advisories.join(' '),
  ];
  climate.getRow(7).values = ['Crop', 'Suitability', 'Expected yield', 'Season', 'Notes'];
  styleHeaderRow(climate, 7);
  data.crops.forEach((crop, index) => {
    climate.getRow(8 + index).values = [crop.name, crop.suitability, crop.expectedYield, crop.season, crop.detail];
    climate.getRow(8 + index).getCell(5).alignment = { wrapText: true, vertical: 'top' };
  });

  /* -------------------- AI summary (only when chosen) ------------------- */
  // Excel renders every language, so the review is included as generated.
  if (data.advisor) {
    const advisor = workbook.addWorksheet('AI summary');
    sheetTitle(advisor, `AI summary (AI-generated) — verdict: ${data.advisor.verdict}`, 'Written by an open-source AI model from this project\'s figures and official documents. Verify before acting.');
    advisor.columns = [{ width: 32 }, { width: 14 }, { width: 70 }, { width: 32 }];
    advisor.getCell('A4').value = data.advisor.summary;
    advisor.mergeCells('A4:D4');
    advisor.getCell('A4').alignment = { wrapText: true, vertical: 'top' };
    advisor.getRow(4).height = 60;
    let row = 6;
    advisor.getRow(row).values = ['Strength'];
    styleHeaderRow(advisor, row);
    data.advisor.strengths.forEach((strength) => {
      row += 1;
      advisor.getCell(`A${row}`).value = strength;
      advisor.mergeCells(`A${row}:D${row}`);
    });
    row += 2;
    advisor.getRow(row).values = ['Risk', 'Severity', 'Detail'];
    styleHeaderRow(advisor, row);
    data.advisor.risks.forEach((risk) => {
      row += 1;
      advisor.getRow(row).values = [risk.title, risk.severity, risk.detail];
      advisor.getRow(row).getCell(3).alignment = { wrapText: true, vertical: 'top' };
    });
    row += 2;
    advisor.getRow(row).values = ['Recommendation', 'Area', 'Detail', 'Expected impact'];
    styleHeaderRow(advisor, row);
    data.advisor.recommendations.forEach((rec) => {
      row += 1;
      advisor.getRow(row).values = [rec.title, rec.category, rec.detail, rec.impact];
      advisor.getRow(row).getCell(3).alignment = { wrapText: true, vertical: 'top' };
    });
  }

  return workbook;
}

export async function exportExcelReport(data: ReportData): Promise<void> {
  const workbook = await buildExcelWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    reportFileName(data, 'xlsx')
  );
}
