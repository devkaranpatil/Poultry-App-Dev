import type { Workbook, Worksheet } from 'exceljs';
import { PROJECTION_YEARS, RUNNING_COST_CYCLE_DAYS } from '@/lib/poultryFinance';
import { downloadBlob, reportFileName, type ReportData } from './reportData';
import { APP_NAME } from '@/config/app';

/** Indian digit grouping (₹1,23,45,678) — Excel has no built-in lakh format. */
const INR_FORMAT = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"#,##0';
const PCT_FORMAT = '0.0%';
const NUMBER_FORMAT = '#,##0';
const DECIMAL_FORMAT = '#,##0.00';
const BRAND = 'FF1F6F4A';
const BRAND_SOFT = 'FFE8F3ED';
const INPUT_FILL = 'FFFFF7E0';
const MUTED = 'FF68726D';

type Cell = number | string | { formula: string; result: number | string };

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
    sheet.getCell('A2').font = { italic: true, color: { argb: MUTED } };
  }
}

/** Writes label / value rows from `startRow`; inputs are yellow. Returns the row of each key. */
function writeRows(sheet: Worksheet, startRow: number, rows: Array<{ key: string; label: string; value: Cell; format?: string; input?: boolean }>) {
  const at: Record<string, number> = {};
  rows.forEach((row, index) => {
    const r = startRow + index;
    at[row.key] = r;
    sheet.getCell(`A${r}`).value = row.label;
    const cell = sheet.getCell(`B${r}`);
    cell.value = row.value;
    if (row.format) cell.numFmt = row.format;
    if (row.input) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
  });
  return at;
}

/** Builds the workbook in memory (no download), so it can be tested. */
export async function buildExcelWorkbook(data: ReportData): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = data.generatedAt;

  const { config, labels, result, financials } = data;
  const a = data.assumptions as unknown as Record<string, number>;
  const layer = financials.product === 'eggs';
  const contract = config.farmingModel === 'contract';
  const birds = result.flock.birds;

  // Sheets are created up front so they appear in this order.
  const summary = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: BRAND } } });
  const shedSheet = workbook.addWorksheet('Shed');
  const costSheet = workbook.addWorksheet('Cost');
  const returns = workbook.addWorksheet('Production & returns');
  const loanSheet = workbook.addWorksheet('Bank loan');
  const compliance = workbook.addWorksheet('Schemes & compliance');
  const climate = workbook.addWorksheet('Climate');

  /* -------------------------------- Cost ------------------------------- */
  sheetTitle(costSheet, 'Capital cost and the first batch', 'Edit amounts in column B; the totals recalculate.');
  costSheet.columns = [{ width: 40 }, { width: 18 }, { width: 10 }];
  costSheet.getRow(4).values = ['Item', 'Amount', 'Share'];
  styleHeaderRow(costSheet, 4);
  const firstItemRow = 5;
  const lastItemRow = firstItemRow + data.costItems.length - 1;
  const capitalRow = lastItemRow + 1;
  data.costItems.forEach((item, index) => {
    const r = firstItemRow + index;
    costSheet.getCell(`A${r}`).value = item.label;
    costSheet.getCell(`B${r}`).value = item.amount;
    costSheet.getCell(`B${r}`).numFmt = INR_FORMAT;
    costSheet.getCell(`C${r}`).value = { formula: `IF($B$${capitalRow}=0,0,B${r}/$B$${capitalRow})`, result: item.share };
    costSheet.getCell(`C${r}`).numFmt = PCT_FORMAT;
  });
  costSheet.getCell(`A${capitalRow}`).value = 'Capital cost';
  costSheet.getCell(`B${capitalRow}`).value = { formula: `SUM(B${firstItemRow}:B${lastItemRow})`, result: result.cost.capitalCost };
  const wcHead = capitalRow + 2;
  costSheet.getRow(wcHead).values = ['First batch (working capital)', 'Amount'];
  styleHeaderRow(costSheet, wcHead);
  const firstWcRow = wcHead + 1;
  data.workingItems.forEach((item, index) => {
    const r = firstWcRow + index;
    costSheet.getCell(`A${r}`).value = item.label;
    costSheet.getCell(`B${r}`).value = item.amount;
    costSheet.getCell(`B${r}`).numFmt = INR_FORMAT;
  });
  const lastWcRow = firstWcRow + Math.max(data.workingItems.length, 1) - 1;
  const wcRow = lastWcRow + 1;
  const projectRow = wcRow + 1;
  costSheet.getCell(`A${wcRow}`).value = 'Working capital';
  costSheet.getCell(`B${wcRow}`).value = { formula: `SUM(B${firstWcRow}:B${lastWcRow})`, result: result.cost.workingCapital.total };
  costSheet.getCell(`A${projectRow}`).value = 'Project cost (capital + first batch)';
  costSheet.getCell(`B${projectRow}`).value = { formula: `B${capitalRow}+B${wcRow}`, result: result.cost.projectCost };
  [capitalRow, wcRow, projectRow].forEach((r) => {
    costSheet.getCell(`B${r}`).numFmt = INR_FORMAT;
    costSheet.getRow(r).font = { bold: true };
  });
  costSheet.getRow(projectRow).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
  });
  if (result.nabard) {
    const n = result.nabard;
    costSheet.getCell(`A${projectRow + 2}`).value = `NABARD unit cost (${n.state} ${n.year}) for this flock`;
    costSheet.getCell(`B${projectRow + 2}`).value = n.normCostInr;
    costSheet.getCell(`B${projectRow + 2}`).numFmt = INR_FORMAT;
    costSheet.getCell(`A${projectRow + 3}`).value = `${n.source.document}: ${n.unitBirds} birds for Rs ${n.unitCostInr}`;
    costSheet.getCell(`A${projectRow + 3}`).font = { italic: true, color: { argb: MUTED } };
  }
  const financedRef = `Cost!$B$${contract ? capitalRow : projectRow}`;

  /* -------------------------- Production & returns -------------------------- */
  // The same arithmetic as src/lib/poultryFinance.ts, as live formulas: change a yellow cell and everything follows.
  sheetTitle(returns, 'Production and returns', 'Yellow cells are assumptions; change them to model other scenarios.');
  returns.columns = [{ width: 40 }, { width: 18 }, { width: 4 }, { width: 10 }, { width: 22 }];
  returns.getRow(4).values = ['Assumption', 'Value'];
  styleHeaderRow(returns, 4);
  const base = [
    { key: 'birds', label: 'Birds housed', value: birds, format: NUMBER_FORMAT, input: true },
    { key: 'financed', label: contract ? 'Financed cost (shed only, contract)' : 'Financed cost (capital + first batch)', value: { formula: financedRef, result: financials.capitalCost }, format: INR_FORMAT },
    { key: 'subsidy', label: 'Subsidy counted', value: a.subsidyInr, format: INR_FORMAT, input: true },
  ];
  let inp: Record<string, number>;
  let out: Record<string, number>;
  const ref = (key: string) => `$B$${inp[key] ?? out[key]}`;
  if (layer) {
    inp = writeRows(returns, 5, [
      ...base,
      { key: 'growerWeeks', label: 'Grower weeks', value: a.growerWeeks, format: NUMBER_FORMAT, input: true },
      { key: 'layingWeeks', label: 'Laying weeks', value: a.layingWeeks, format: NUMBER_FORMAT, input: true },
      { key: 'cleaningDays', label: 'Cleaning days', value: a.cleaningDays, format: NUMBER_FORMAT, input: true },
      { key: 'chicksPerHen', label: 'Chicks bought per hen housed', value: a.chicksPerLayerHoused, format: DECIMAL_FORMAT, input: true },
      { key: 'mortality', label: 'Laying mortality', value: a.layingMortalityPct / 100, format: PCT_FORMAT, input: true },
      { key: 'eggsPerHen', label: 'Eggs a hen', value: a.eggsPerHen, format: NUMBER_FORMAT, input: true },
      { key: 'growerFeed', label: 'Grower feed a chick (kg)', value: a.growerFeedKgPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'layingFeed', label: 'Laying feed a hen (kg)', value: a.layingFeedKgPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'growerManure', label: 'Manure a chick a week (kg)', value: a.growerManureKgPerWeek, format: DECIMAL_FORMAT, input: true },
      { key: 'layerManure', label: 'Manure a hen a week (kg)', value: a.layerManureKgPerWeek, format: DECIMAL_FORMAT, input: true },
      { key: 'chick', label: 'Chick price (₹)', value: a.chickInr, format: INR_FORMAT, input: true },
      { key: 'feed', label: 'Feed price (₹/kg)', value: a.feedInrPerKg, format: DECIMAL_FORMAT, input: true },
      { key: 'vaccine', label: 'Vaccines and medicines a hen (₹)', value: a.vaccineInrPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'insurance', label: 'Bird insurance (share of chick cost)', value: a.insurancePctOfChickCost / 100, format: PCT_FORMAT, input: true },
      { key: 'labour', label: 'Labour a month (₹)', value: a.labourInrPerMonth, format: INR_FORMAT, input: true },
      { key: 'perWorker', label: 'Birds a worker', value: a.labourBirdsPerWorker, format: NUMBER_FORMAT, input: true },
      { key: 'other', label: `Litter, power and other costs a hen per ${RUNNING_COST_CYCLE_DAYS} days (₹)`, value: a.otherCostInrPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'egg', label: 'Egg price (₹)', value: a.eggInr, format: DECIMAL_FORMAT, input: true },
      { key: 'cull', label: 'Culled hen price (₹)', value: a.culledBirdInr, format: INR_FORMAT, input: true },
      { key: 'manure', label: 'Manure price (₹/tonne)', value: a.manureInrPerTonne, format: INR_FORMAT, input: true },
    ]);
    const start = 5 + Object.keys(inp).length + 2;
    returns.getRow(start - 1).values = ['Result', 'Value'];
    styleHeaderRow(returns, start - 1);
    out = {};
    const cycle = financials.cycleDays;
    const rows: Array<{ key: string; label: string; formula: string; result: number | string; format: string }> = [];
    const add = (key: string, label: string, formula: string, value: number | string, format: string) => rows.push({ key, label, formula, result: value, format });
    // Formulas refer to rows by key; the keys are resolved after placing all rows.
    add('cycleDays', 'Days a flock (with cleaning)', '(@growerWeeks+@layingWeeks)*7+@cleaningDays', cycle, NUMBER_FORMAT);
    add('cycles', 'Flocks a year', 'IF(@cycleDays>0,365/@cycleDays,0)', financials.cyclesPerYear, DECIMAL_FORMAT);
    add('chicks', 'Chicks a flock', '@birds*@chicksPerHen', birds * a.chicksPerLayerHoused, NUMBER_FORMAT);
    add('eggs', 'Eggs a flock', '@birds*(1-@mortality/2)*@eggsPerHen', financials.eggsPerYear / (financials.cyclesPerYear || 1), NUMBER_FORMAT);
    add('culled', 'Hens culled a flock', '@birds*(1-@mortality)', financials.birdsSoldPerYear / (financials.cyclesPerYear || 1), NUMBER_FORMAT);
    add('feedKg', 'Feed a flock (kg)', '@chicks*@growerFeed+@birds*@layingFeed', financials.feedKgPerYear / (financials.cyclesPerYear || 1), NUMBER_FORMAT);
    add(
      'manureKg',
      'Manure a flock (kg)',
      '@chicks*@growerManure*@growerWeeks+@birds*@layerManure*@layingWeeks',
      birds * a.chicksPerLayerHoused * a.growerManureKgPerWeek * a.growerWeeks + birds * a.layerManureKgPerWeek * a.layingWeeks,
      NUMBER_FORMAT
    );
    add('revenueCycle', 'Revenue a flock', '@eggs*@egg+@culled*@cull+@manureKg/1000*@manure', financials.revenuePerCycle, INR_FORMAT);
    add(
      'costCycle',
      'Running cost a flock',
      `@chicks*@chick*(1+@insurance)+@feedKg*@feed+@birds*@vaccine+IF(@perWorker>0,@birds/@perWorker,0)*@labour*(@cycleDays/(365/12))+@birds*@other*(@cycleDays/${RUNNING_COST_CYCLE_DAYS})`,
      financials.costPerCycle,
      INR_FORMAT
    );
    add('revenue', 'Revenue a year', '@revenueCycle*@cycles', financials.annualRevenue, INR_FORMAT);
    add('cost', 'Running cost a year', '@costCycle*@cycles', financials.annualOperatingCost, INR_FORMAT);
    add('profit', 'Profit a year', '@revenue-@cost', financials.annualProfit, INR_FORMAT);
    add('net', 'Net investment', '@financed-MIN(@subsidy,@financed)', financials.netInvestment, INR_FORMAT);
    add('payback', 'Payback (years)', 'IF(@profit>0,@net/@profit,"No payback")', financials.paybackYears ?? 'No payback', '0.0');
    add('roi', `${PROJECTION_YEARS}-year ROI`, `IF(@net>0,(@profit*${PROJECTION_YEARS}-@net)/@net,"-")`, financials.roi ?? '-', PCT_FORMAT);
    add('breakEven', 'Break-even egg price (₹)', 'IF(@eggs>0,(@costCycle-(@revenueCycle-@eggs*@egg))/@eggs,"-")', financials.breakEvenPrice ?? '-', DECIMAL_FORMAT);
    rows.forEach((row, index) => {
      out[row.key] = start + index;
    });
    rows.forEach((row) => {
      const r = out[row.key];
      returns.getCell(`A${r}`).value = row.label;
      const formula = row.formula.replace(/@([a-zA-Z]+)/g, (_, key: string) => ref(key));
      returns.getCell(`B${r}`).value = { formula, result: row.result };
      returns.getCell(`B${r}`).numFmt = row.format;
    });
  } else {
    inp = writeRows(returns, 5, [
      ...base,
      { key: 'contract', label: 'Contract farming (1 = yes, 0 = no)', value: contract ? 1 : 0, format: '0', input: true },
      { key: 'rearing', label: 'Rearing days', value: a.rearingDays, format: NUMBER_FORMAT, input: true },
      { key: 'cleaning', label: 'Cleaning days', value: a.cleaningDays, format: NUMBER_FORMAT, input: true },
      { key: 'mortality', label: 'Mortality', value: a.mortalityPct / 100, format: PCT_FORMAT, input: true },
      { key: 'weight', label: 'Sale weight (kg)', value: a.saleWeightKg, format: DECIMAL_FORMAT, input: true },
      { key: 'fcr', label: 'Feed conversion ratio', value: a.fcr, format: DECIMAL_FORMAT, input: true },
      {
        key: 'price',
        label: contract ? 'Growing charge (₹/kg)' : 'Live-bird price (₹/kg)',
        value: contract ? a.growingChargeInrPerKg : a.saleInrPerKg,
        format: DECIMAL_FORMAT,
        input: true,
      },
      { key: 'chick', label: 'Chick price (₹)', value: a.chickInr, format: INR_FORMAT, input: true },
      { key: 'feed', label: 'Feed price (₹/kg)', value: a.feedInrPerKg, format: DECIMAL_FORMAT, input: true },
      { key: 'vaccine', label: 'Vaccines and medicines a bird (₹)', value: a.vaccineInrPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'insurance', label: 'Bird insurance (share of chick cost)', value: a.insurancePctOfChickCost / 100, format: PCT_FORMAT, input: true },
      { key: 'labour', label: 'Labour a bird a batch (₹)', value: a.labourInrPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'other', label: 'Litter, power and other costs a bird a batch (₹)', value: a.otherCostInrPerBird, format: DECIMAL_FORMAT, input: true },
      { key: 'byProducts', label: 'Manure and empty bags a bird (₹)', value: a.manureInrPerBird + a.gunnyBagsInrPerBird, format: DECIMAL_FORMAT, input: true },
    ]);
    const start = 5 + Object.keys(inp).length + 2;
    returns.getRow(start - 1).values = ['Result', 'Value'];
    styleHeaderRow(returns, start - 1);
    out = {};
    const batches = financials.cyclesPerYear || 1;
    const rows: Array<{ key: string; label: string; formula: string; result: number | string; format: string }> = [];
    const add = (key: string, label: string, formula: string, value: number | string, format: string) => rows.push({ key, label, formula, result: value, format });
    add('cycles', 'Batches a year', 'IF(@rearing+@cleaning>0,365/(@rearing+@cleaning),0)', financials.cyclesPerYear, DECIMAL_FORMAT);
    add('sold', 'Birds sold a batch', '@birds*(1-@mortality)', financials.birdsSoldPerYear / batches, NUMBER_FORMAT);
    add('kg', 'Live weight sold a batch (kg)', '@sold*@weight', financials.kgSoldPerYear / batches, NUMBER_FORMAT);
    add('feedKg', 'Feed a batch (kg)', '@kg*@fcr', financials.feedKgPerYear / batches, NUMBER_FORMAT);
    add('revenueCycle', 'Revenue a batch', '@kg*@price+@birds*@byProducts', financials.revenuePerCycle, INR_FORMAT);
    add(
      'costCycle',
      'Running cost a batch',
      '@birds*(@labour+@other)+IF(@contract=1,0,@birds*@chick*(1+@insurance)+@feedKg*@feed+@birds*@vaccine)',
      financials.costPerCycle,
      INR_FORMAT
    );
    add('revenue', 'Revenue a year', '@revenueCycle*@cycles', financials.annualRevenue, INR_FORMAT);
    add('cost', 'Running cost a year', '@costCycle*@cycles', financials.annualOperatingCost, INR_FORMAT);
    add('profit', 'Profit a year', '@revenue-@cost', financials.annualProfit, INR_FORMAT);
    add('net', 'Net investment', '@financed-MIN(@subsidy,@financed)', financials.netInvestment, INR_FORMAT);
    add('payback', 'Payback (years)', 'IF(@profit>0,@net/@profit,"No payback")', financials.paybackYears ?? 'No payback', '0.0');
    add('roi', `${PROJECTION_YEARS}-year ROI`, `IF(@net>0,(@profit*${PROJECTION_YEARS}-@net)/@net,"-")`, financials.roi ?? '-', PCT_FORMAT);
    add('breakEven', contract ? 'Break-even growing charge (₹/kg)' : 'Break-even live-bird price (₹/kg)', 'IF(@kg>0,(@costCycle-@birds*@byProducts)/@kg,"-")', financials.breakEvenPrice ?? '-', DECIMAL_FORMAT);
    rows.forEach((row, index) => {
      out[row.key] = start + index;
    });
    rows.forEach((row) => {
      const r = out[row.key];
      returns.getCell(`A${r}`).value = row.label;
      const formula = row.formula.replace(/@([a-zA-Z]+)/g, (_, key: string) => ref(key));
      returns.getCell(`B${r}`).value = { formula, result: row.result };
      returns.getCell(`B${r}`).numFmt = row.format;
    });
  }
  [out.profit, out.net, out.payback].forEach((r) => {
    returns.getCell(`B${r}`).font = { bold: true };
  });
  const sheetRef = (key: string) => `'Production & returns'!$B$${inp[key] ?? out[key]}`;

  returns.getRow(4).getCell(4).value = 'Year';
  returns.getRow(4).getCell(5).value = 'Cumulative cash';
  financials.cumulativeCashflow.forEach((value, year) => {
    const r = 5 + year;
    returns.getCell(`D${r}`).value = year;
    returns.getCell(`E${r}`).value = { formula: `-${ref('net')}+${ref('profit')}*D${r}`, result: value };
    returns.getCell(`E${r}`).numFmt = INR_FORMAT;
  });

  /* ----------------------------- Bank loan ----------------------------- */
  // Same rules as src/lib/loan.ts: interest only during the moratorium, then equal instalments; the subsidy waits in
  // reserve and closes the loan once the balance falls within it (back-ended subsidy).
  const { loan } = data;
  sheetTitle(loanSheet, 'Bank term loan and repayment schedule', 'Edit the yellow cells; the schedule recalculates. Add rows below if you lengthen the loan.');
  loanSheet.columns = [{ width: 32 }, { width: 18 }, { width: 4 }, { width: 9 }, { width: 8 }, { width: 15 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 15 }];
  loanSheet.getRow(4).values = ['Loan input / result', 'Value'];
  styleHeaderRow(loanSheet, 4);
  const L = (row: number) => `$B$${row}`;
  const loanRows: Array<[string, Cell, string, boolean?]> = [
    ['Financed cost', { formula: sheetRef('financed'), result: loan.projectCost }, INR_FORMAT],
    ['Loan share (% of cost)', loan.terms.loanSharePct / 100, PCT_FORMAT, true],
    ['Interest (% a year)', loan.terms.interestPct / 100, '0.00%', true],
    ['Repayment years (with moratorium)', loan.terms.tenureYears, '0', true],
    ['Instalments a year (12, 4 or 2)', loan.periodsPerYear, '0', true],
    ['Moratorium (instalment periods)', loan.moratoriumPeriods, '0', true],
    ['Loan amount', { formula: `${L(5)}*${L(6)}`, result: loan.loanAmount }, INR_FORMAT],
    ['Your margin', { formula: `${L(5)}-${L(11)}`, result: loan.margin }, INR_FORMAT],
    ['Subsidy in reserve (capped at loan)', { formula: `MIN(${sheetRef('subsidy')},${L(5)},${L(11)})`, result: loan.subsidyInReserve }, INR_FORMAT],
    ['Instalment after moratorium', { formula: `IF(${L(11)}<=0,0,PMT(${L(7)}/${L(9)},${L(8)}*${L(9)}-${L(10)},-${L(11)}))`, result: loan.installment }, INR_FORMAT],
  ];
  loanRows.forEach(([label, value, format, isInput], index) => {
    const r = 5 + index;
    loanSheet.getCell(`A${r}`).value = label;
    const cell = loanSheet.getCell(`B${r}`);
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
  loanSheet.getCell(`A${totalsRow + 3}`).value =
    'DSCR = farm cash / loan payments in the year (below 1.0 the farm cannot pay the bank that year). Default terms: NABARD model bank projects for poultry.';
  loanSheet.getCell(`A${totalsRow + 3}`).font = { italic: true, color: { argb: MUTED } };

  /* ------------------------------ Summary ------------------------------ */
  sheetTitle(summary, data.title, `${data.location || 'Location not set'} · ${data.generatedAt.toLocaleDateString('en-IN')}`);
  summary.columns = [{ width: 32 }, { width: 24 }];
  summary.getRow(4).values = ['Metric', 'Value'];
  styleHeaderRow(summary, 4);
  writeRows(summary, 5, [
    { key: 'bird', label: 'Birds', value: `${labels.bird}: ${birds.toLocaleString('en-IN')}` },
    { key: 'capital', label: 'Capital cost', value: { formula: `Cost!$B$${capitalRow}`, result: result.cost.capitalCost }, format: INR_FORMAT },
    { key: 'project', label: 'Project cost (with the first batch)', value: { formula: `Cost!$B$${projectRow}`, result: result.cost.projectCost }, format: INR_FORMAT },
    { key: 'net', label: 'Net investment', value: { formula: sheetRef('net'), result: financials.netInvestment }, format: INR_FORMAT },
    { key: 'profit', label: 'Profit a year', value: { formula: sheetRef('profit'), result: financials.annualProfit }, format: INR_FORMAT },
    { key: 'payback', label: 'Payback (years)', value: { formula: sheetRef('payback'), result: financials.paybackYears ?? 'No payback' }, format: '0.0' },
    { key: 'schemes', label: 'Schemes', value: result.schemes.noneApplies ? 'None applies: bank loan only' : `Up to Rs ${result.schemes.bestAmountInr.toLocaleString('en-IN')} (check the verdicts)` },
    { key: 'siting', label: 'Siting items not confirmed', value: data.siting.filter((rule) => !rule.ticked).length, format: '0' },
  ]);
  summary.getCell('A14').value = 'Planning estimate, not a quotation. Confirm prices, schemes and siting locally.';
  summary.getCell('A14').font = { italic: true, color: { argb: MUTED } };

  /* -------------------------------- Shed ------------------------------- */
  sheetTitle(shedSheet, 'The shed and the birds');
  shedSheet.columns = [{ width: 30 }, { width: 34 }];
  shedSheet.getRow(3).values = ['Parameter', 'Value'];
  styleHeaderRow(shedSheet, 3);
  const shedRows: Array<[string, string | number]> = [
    ['State', config.state],
    ['District', config.district],
    ['Length (m)', config.length],
    ['Width (m)', config.width],
    ['Floor area (m²)', result.area],
    ['Floor area (sq ft)', result.areaSqft],
    ['Eaves height (m)', config.eavesHeight],
    ['Ridge height (m)', config.ridgeHeight],
    ['Housing', labels.housing],
    ['Roof', labels.roof],
    ['Frame', labels.frame],
    ['Roof sheet', labels.roofSheet],
    ['Side walls', labels.sideWalls],
    ['Entry', labels.entry],
    ['Birds', labels.bird],
    ['Birds housed', birds],
    ['Floor space a bird (sq ft)', result.flock.sqftPerBird ?? '-'],
    ['Feeding', labels.feeding],
    ['Farming model', labels.farmingModel],
    ['Beneficiary category', labels.category],
  ];
  shedRows.forEach(([label, value], index) => {
    shedSheet.getRow(4 + index).values = [label, value];
  });
  const calendarStart = 4 + shedRows.length + 2;
  shedSheet.getRow(calendarStart).values = [layer ? 'Flock' : 'Batch', 'Placed / sold / ready (day)'];
  styleHeaderRow(shedSheet, calendarStart);
  result.calendar.forEach((batch, index) => {
    shedSheet.getRow(calendarStart + 1 + index).values = [batch.batch, `${batch.placeDay} / ${batch.saleDay} / ${batch.readyDay}`];
  });

  /* ------------------------ Schemes & compliance ------------------------ */
  sheetTitle(compliance, 'Schemes, siting and biosecurity');
  compliance.columns = [{ width: 52 }, { width: 16 }, { width: 22 }, { width: 70 }];
  compliance.getRow(3).values = ['Scheme', 'Verdict', 'Support', 'Why'];
  styleHeaderRow(compliance, 3);
  result.schemes.schemes.forEach((scheme, index) => {
    compliance.getRow(4 + index).values = [
      scheme.name,
      scheme.status,
      scheme.status === 'not-eligible' ? '-' : scheme.interestSubventionPct !== null ? `${scheme.interestSubventionPct}% subvention` : scheme.amountInr,
      [...scheme.reasons, scheme.verified ? '' : 'Unverified rules.'].filter(Boolean).join(' '),
    ];
    compliance.getRow(4 + index).getCell(4).alignment = { wrapText: true, vertical: 'top' };
  });
  let row = 4 + result.schemes.schemes.length + 1;
  compliance.getRow(row).values = ['Siting or registration rule', 'Distance (m)', 'Confirmed'];
  styleHeaderRow(compliance, row);
  data.siting.forEach((rule) => {
    row += 1;
    compliance.getRow(row).values = [rule.description, rule.distanceM ?? '-', rule.ticked ? 'Yes' : 'NOT CONFIRMED'];
    if (!rule.ticked) compliance.getRow(row).getCell(3).font = { bold: true, color: { argb: 'FFBE4034' } };
  });
  row += 2;
  compliance.getRow(row).values = ['Biosecurity'];
  styleHeaderRow(compliance, row);
  data.biosecurity.forEach((item) => {
    row += 1;
    compliance.getCell(`A${row}`).value = item;
  });
  row += 2;
  compliance.getRow(row).values = ['Assumption', 'Value', 'Verified', 'Source'];
  styleHeaderRow(compliance, row);
  data.assumptionRows.forEach((item) => {
    row += 1;
    compliance.getRow(row).values = [item.label, item.value, item.source ? (item.verified ? 'Yes' : 'Verify') : 'Your figure', item.source ?? ''];
  });

  /* ------------------------------ Climate ------------------------------ */
  sheetTitle(climate, 'Site climate and heat stress', data.location);
  climate.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 70 }];
  climate.getRow(4).values = ['Climate zone', 'Temperature', 'Humidity', 'Annual rainfall', 'Advice'];
  styleHeaderRow(climate, 4);
  climate.getRow(5).values = [
    result.climate.climateZone,
    `${result.climate.avgTemperature} °C`,
    `${result.climate.humidity}%`,
    `${result.climate.rainfall} mm`,
    result.climate.advisories.join(' '),
  ];
  climate.getRow(5).getCell(5).alignment = { wrapText: true, vertical: 'top' };
  const heat = result.climate.heatStress;
  if (heat) {
    climate.getRow(7).values = ['Month', 'THI', 'Severe (above threshold)'];
    styleHeaderRow(climate, 7);
    heat.thiByMonth.forEach((month, index) => {
      climate.getRow(8 + index).values = [month.month, month.thi, month.thi > heat.threshold ? 'Yes' : ''];
    });
  }

  /* -------------------- AI summary (only when chosen) ------------------- */
  // Excel renders every language, so the review is included as generated.
  if (data.advisor) {
    const advisor = workbook.addWorksheet('AI summary');
    sheetTitle(advisor, `AI summary (AI-generated) — verdict: ${data.advisor.verdict}`, "Written by an open-source AI model from this project's figures and official documents. Verify before acting.");
    advisor.columns = [{ width: 32 }, { width: 14 }, { width: 70 }, { width: 32 }];
    advisor.getCell('A4').value = data.advisor.summary;
    advisor.mergeCells('A4:D4');
    advisor.getCell('A4').alignment = { wrapText: true, vertical: 'top' };
    advisor.getRow(4).height = 60;
    let r = 6;
    advisor.getRow(r).values = ['Strength'];
    styleHeaderRow(advisor, r);
    data.advisor.strengths.forEach((strength) => {
      r += 1;
      advisor.getCell(`A${r}`).value = strength;
      advisor.mergeCells(`A${r}:D${r}`);
    });
    r += 2;
    advisor.getRow(r).values = ['Risk', 'Severity', 'Detail'];
    styleHeaderRow(advisor, r);
    data.advisor.risks.forEach((risk) => {
      r += 1;
      advisor.getRow(r).values = [risk.title, risk.severity, risk.detail];
      advisor.getRow(r).getCell(3).alignment = { wrapText: true, vertical: 'top' };
    });
    r += 2;
    advisor.getRow(r).values = ['Recommendation', 'Area', 'Detail', 'Expected impact'];
    styleHeaderRow(advisor, r);
    data.advisor.recommendations.forEach((rec) => {
      r += 1;
      advisor.getRow(r).values = [rec.title, rec.category, rec.detail, rec.impact];
      advisor.getRow(r).getCell(3).alignment = { wrapText: true, vertical: 'top' };
    });
  }

  return workbook;
}

export async function exportExcelReport(data: ReportData): Promise<void> {
  const workbook = await buildExcelWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFileName(data, 'xlsx'));
}
