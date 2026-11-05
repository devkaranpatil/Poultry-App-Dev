/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { Workbook } from 'exceljs';
import { buildReportData, reportFileName } from '@/lib/export/reportData';
import { buildPdfReport, toPdfText } from '@/lib/export/pdfReport';
import { buildExcelWorkbook } from '@/lib/export/excelReport';
import { poultryLoanTerms } from '@/lib/loan';
import type { AdvisorReport } from '@/services/ai.service';
import { DEFAULT_CONFIG, type FarmConfig } from '@/types/farm';
import { SAMPLE_CONFIG, sampleResult } from './helpers/poultryResult';

// The backend's own calculation keeps the fixtures realistic.
const config = SAMPLE_CONFIG;
const result = sampleResult(config, { saleInrPerKg: 110 });
const layerConfig: FarmConfig = { ...DEFAULT_CONFIG, length: 40, width: 8, birdType: 'layer-cage', feedingSystem: 'trough', state: 'Maharashtra', district: 'Pune' };
const layerResult = sampleResult(layerConfig);
const contractConfig: FarmConfig = { ...config, farmingModel: 'contract' };
const contractResult = sampleResult(contractConfig);

const advisor: AdvisorReport = {
  summary: 'A viable broiler project; summer heat is the main risk.',
  verdict: 'viable',
  strengths: ['Close to the market', 'Moderate capital cost'],
  risks: [{ title: 'Heat stress', detail: 'Three hot months.', severity: 'high' }],
  recommendations: [{ title: 'Add foggers', detail: 'On the roof.', category: 'structure', impact: 'Saves ₹20k/yr in losses' }],
};

const baseInput = { config, result, generatedAt: new Date('2026-10-10T10:00:00Z') };

/**
 * Works out a workbook's formulas the way a spreadsheet would (only the functions the report uses: IF, MIN, PMT, SUM,
 * ROUND and arithmetic), so a test can check the live formulas give the app's own figures.
 */
function evaluator(workbook: Workbook) {
  const cache = new Map<string, number | string>();
  const valueOf = (sheetName: string, ref: string): number | string => {
    const key = `${sheetName}!${ref}`;
    if (cache.has(key)) return cache.get(key) as number | string;
    const cell = workbook.getWorksheet(sheetName)!.getCell(ref.replace(/\$/g, ''));
    const raw = cell.value as unknown;
    const value = raw && typeof raw === 'object' && 'formula' in (raw as object) ? run(sheetName, (raw as { formula: string }).formula) : (raw as number | string) ?? 0;
    cache.set(key, value);
    return value;
  };
  const range = (sheetName: string, from: string, to: string) => {
    const [, col, start] = from.match(/([A-Z]+)(\d+)/)!;
    const end = Number(to.match(/\d+/)![0]);
    const values: number[] = [];
    for (let row = Number(start); row <= end; row += 1) values.push(Number(valueOf(sheetName, `${col}${row}`)) || 0);
    return values;
  };
  const run = (sheetName: string, formula: string): number | string => {
    let js = formula.replace(/(?:'([^']+)'|([A-Za-z]+))?!?\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/g, (_, quoted, plain, c1, r1, c2, r2) =>
      `[${range(quoted ?? plain ?? sheetName, `${c1}${r1}`, `${c2}${r2}`).join(',')}]`
    );
    js = js.replace(/(?:'([^']+)'|\b([A-Za-z][A-Za-z ]*?))!\$?([A-Z]+)\$?(\d+)/g, (_, quoted, plain, col, row) => JSON.stringify(valueOf(quoted ?? plain, `${col}${row}`)));
    js = js.replace(/\$?\b([A-Z]{1,2})\$?(\d+)\b/g, (match, col, row) => (/^(IF|MIN|PMT|SUM|ROUND|AND)$/.test(col) ? match : JSON.stringify(valueOf(sheetName, `${col}${row}`))));
    js = js.replace(/(?<![<>!=])=(?!=)/g, '==').replace(/<>/g, '!=');
    const IF = (c: unknown, a: unknown, b: unknown) => (c ? a : b);
    const MIN = (...xs: number[]) => Math.min(...xs);
    const SUM = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    const ROUND = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
    const AND = (...xs: unknown[]) => xs.every(Boolean);
    const PMT = (rate: number, n: number, pv: number) => (rate === 0 ? -pv / n : (-pv * rate) / (1 - (1 + rate) ** -n));
    return new Function('IF', 'MIN', 'SUM', 'ROUND', 'AND', 'PMT', `return (${js});`)(IF, MIN, SUM, ROUND, AND, PMT) as number | string;
  };
  return { value: valueOf };
}

describe('report data', () => {
  it('uses English labels, cost shares that sum to 100% and the sources of the assumptions', () => {
    const data = buildReportData(baseInput);
    expect(data.labels.bird).toBe('Broiler');
    expect(data.labels.housing).toBe('Open-sided');
    expect(data.costItems.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1);
    expect(data.workingItems.map((item) => item.label)).toContain('Chicks (1,130)');
    expect(data.assumptionRows.find((row) => row.field === 'saleInrPerKg')).toMatchObject({ value: 110, verified: false });
    expect(data.assumptionRows.find((row) => row.field === 'fcr')).toMatchObject({ value: 1.8, verified: true });
    expect(data.biosecurity).toHaveLength(9);
    expect(reportFileName(data, 'pdf')).toBe('farm-nagpur-2026-10-10.pdf');
  });

  it("carries the loan plan, NABARD's terms for the bird unless the user changed them", () => {
    const defaults = buildReportData(baseInput).loan;
    expect(defaults.terms).toEqual(poultryLoanTerms('broiler'));
    expect(defaults.loanAmount).toBeCloseTo(result.financedCost * 0.75, 6);
    const custom = buildReportData({ ...baseInput, loanTerms: { ...poultryLoanTerms('broiler'), loanSharePct: 60, frequency: 'quarterly' } }).loan;
    expect(custom.loanAmount).toBeCloseTo(result.financedCost * 0.6, 6);
    expect(custom.periodsPerYear).toBe(4);
  });

  it('marks the siting rules the farmer has not confirmed', () => {
    const data = buildReportData({ ...baseInput, sitingTicks: { registration: true } });
    expect(data.siting.map((rule) => rule.ticked)).toEqual([false, true]);
  });
});

// Building documents loads large libraries (jsPDF, ExcelJS); allow for slow CI runners.
describe('PDF report', { timeout: 30_000 }, () => {
  it('normalises typography and flags unprintable scripts', () => {
    expect(toPdfText('Saves ₹20k – fast').text).toBe('Saves Rs 20k - fast');
    expect(toPdfText('सब्सिडी').printable).toBe(false);
  });

  it('builds the DPR in order: technical, financial, managerial, compliance', async () => {
    const doc = await buildPdfReport(buildReportData({ ...baseInput, advisor }));
    const raw = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    const order = ['PART 1 - TECHNICAL', 'The shed', 'Production', 'Site climate', 'PART 2 - FINANCIAL', 'Capital cost', 'Government schemes', 'Assumptions', 'Returns', 'Bank loan and repayment', 'PART 3 - MANAGERIAL', 'Biosecurity', 'Siting and registration', 'AI summary'];
    const positions = order.map((heading) => raw.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(raw).toContain('CONFIRMED');
    expect(raw).toContain('Rs 20k');
  });

  it('leaves the AI summary out entirely when it is not chosen', async () => {
    const raw = (await buildPdfReport(buildReportData({ ...baseInput, advisor: null }))).output();
    expect(raw).not.toContain('AI summary');
    expect(raw).not.toContain('AI-generated');
  });

  it('replaces an AI review it cannot render with a note instead of garbled text', async () => {
    const hindi: AdvisorReport = { ...advisor, summary: 'यह परियोजना व्यवहार्य है।' };
    const raw = (await buildPdfReport(buildReportData({ ...baseInput, advisor: hindi }))).output();
    expect(raw).toContain('Switch the app to English');
  });
});

describe('Excel report', { timeout: 30_000 }, () => {
  it('builds the sheets in order, with an AI sheet when chosen', async () => {
    const workbook = await buildExcelWorkbook(buildReportData({ ...baseInput, advisor }));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Shed',
      'Cost',
      'Production & returns',
      'Bank loan',
      'Schemes & compliance',
      'Climate',
      'AI summary',
    ]);
  });

  it.each([
    ['an independent broiler farm', config, result],
    ['a contract broiler farm', contractConfig, contractResult],
    ['a cage layer farm', layerConfig, layerResult],
  ])("gives the app's own figures from its live formulas for %s", async (_label, setup, calculation) => {
    const data = buildReportData({ config: setup, result: calculation });
    const workbook = await buildExcelWorkbook(data);
    const sheet = workbook.getWorksheet('Production & returns')!;
    const rowOf = (label: string) => {
      let found = 0;
      sheet.eachRow((row, number) => {
        if (row.getCell(1).value === label) found = number;
      });
      if (!found) throw new Error(`no row ${label}`);
      return `B${found}`;
    };
    const { value } = evaluator(workbook);
    const at = (label: string) => Number(value('Production & returns', rowOf(label)));
    expect(at('Revenue a year')).toBeCloseTo(calculation.returns.annualRevenue, 2);
    expect(at('Running cost a year')).toBeCloseTo(calculation.returns.annualOperatingCost, 2);
    expect(at('Profit a year')).toBeCloseTo(calculation.returns.annualProfit, 2);
    expect(at('Net investment')).toBeCloseTo(calculation.returns.netInvestment, 2);
    expect(Number(value('Cost', 'B' + (5 + data.costItems.length)))).toBe(calculation.cost.capitalCost);
  });

  it('builds a bank loan sheet whose formulas match the schedule in the app', async () => {
    const data = buildReportData({ config: layerConfig, result: layerResult });
    const workbook = await buildExcelWorkbook(data);
    const sheet = workbook.getWorksheet('Bank loan')!;
    const formula = (ref: string) => sheet.getCell(ref).value as { formula: string; result: number };
    expect(formula('B5').formula).toContain("'Production & returns'!");
    expect(formula('B11').formula).toBe('$B$5*$B$6');
    expect(formula('B14').formula).toBe('IF($B$11<=0,0,PMT($B$7/$B$9,$B$8*$B$9-$B$10,-$B$11))');
    const { value } = evaluator(workbook);
    expect(Number(value('Bank loan', 'B14'))).toBeCloseTo(data.loan.installment, 4);
    // First schedule row opens with the loan; the one after the moratorium starts repaying principal.
    expect(formula('F5').formula).toBe('$B$11');
    const firstRepayment = 5 + data.loan.moratoriumPeriods;
    expect(formula(`H${firstRepayment}`).result).toBeCloseTo(data.loan.schedule[data.loan.moratoriumPeriods].principal, 6);
    expect(formula(`H${firstRepayment}`).result).toBeGreaterThan(0);
    expect(sheet.getCell('M4').value).toBe('Year');
  });

  it('writes a valid .xlsx file that reloads', async () => {
    const workbook = await buildExcelWorkbook(buildReportData(baseInput));
    const buffer = await workbook.xlsx.writeBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    expect(reloaded.getWorksheet('Summary')!.getCell('A5').value).toBe('Birds');
    expect(reloaded.getWorksheet('AI summary')).toBeUndefined();
  });
});
