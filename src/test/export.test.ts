/** @vitest-environment node */
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { buildReportData, reportFileName } from '@/lib/export/reportData';
import { buildPdfReport, toPdfText } from '@/lib/export/pdfReport';
import { buildExcelWorkbook } from '@/lib/export/excelReport';
import { defaultFinanceAssumptions } from '@/lib/finance';
import { DEFAULT_LOAN_TERMS } from '@/lib/loan';
import type { AdvisorReport } from '@/services/ai.service';
import type { CalculationResult, FarmConfig } from '@/types/farm';

const require = createRequire(import.meta.url);
const { runCalculation } = require('../../backend/routes/farm.js');

const config: FarmConfig = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  greenhouseType: 'naturally-ventilated',
  roofType: 'gable',
  structureMaterial: 'gi-steel',
  coverMaterial: 'uv-polyfilm',
  sideVentilation: 'manual-rollup',
  doorEntry: 'single-sliding',
  selectedCrop: 'capsicum',
  irrigationSystem: 'drip',
  state: 'Goa',
  district: 'North Goa',
};

// The backend's own calculation keeps this fixture realistic.
const { result } = runCalculation({ ...config, stateName: config.state, doorType: config.doorEntry }) as {
  result: CalculationResult;
};

const advisor: AdvisorReport = {
  summary: 'A viable capsicum project; humidity management is the main risk.',
  verdict: 'viable',
  strengths: ['Strong local demand', 'Moderate capital cost'],
  risks: [{ title: 'Fungal disease', detail: 'High humidity in monsoon.', severity: 'high' }],
  recommendations: [
    { title: 'Add insect net on vents', detail: 'Reduces pest entry.', category: 'structure', impact: 'Saves ₹20k/yr in sprays' },
  ],
};

const baseInput = {
  config,
  result,
  assumptions: defaultFinanceAssumptions('capsicum'),
  generatedAt: new Date('2026-10-10T10:00:00Z'),
};

describe('report data', () => {
  it('uses English labels and cost shares that sum to 100%', () => {
    const data = buildReportData(baseInput);
    expect(data.labels.type).toBe('Naturally Ventilated');
    expect(data.labels.crop).toBe('Capsicum');
    const share = data.costItems.reduce((sum, item) => sum + item.share, 0);
    expect(share).toBeCloseTo(1);
    expect(data.cropsSource).toBe('rules');
    expect(reportFileName(data, 'pdf')).toBe('farm-north-goa-2026-10-10.pdf');
  });

  it('carries the loan plan, with the published defaults unless the user changed them', () => {
    const defaults = buildReportData(baseInput).loan;
    expect(defaults.terms).toEqual(DEFAULT_LOAN_TERMS);
    expect(defaults.loanAmount).toBeCloseTo(result.cost.totalCost * 0.8, 6);
    const custom = buildReportData({ ...baseInput, loanTerms: { ...DEFAULT_LOAN_TERMS, loanSharePct: 60, frequency: 'quarterly' } }).loan;
    expect(custom.loanAmount).toBeCloseTo(result.cost.totalCost * 0.6, 6);
    expect(custom.periodsPerYear).toBe(4);
  });

  it('prefers AI crop suggestions when available', () => {
    const data = buildReportData({
      ...baseInput,
      aiCrops: {
        note: '',
        crops: [{ name: 'Cucumber', suitability: 'excellent', reason: 'Humid', expectedYield: '200 t/ha', season: 'All year', marketNote: 'Hotels' }],
      },
    });
    expect(data.cropsSource).toBe('ai');
    expect(data.crops[0].detail).toBe('Humid Hotels');
  });
});

// Building documents loads large libraries (jsPDF, ExcelJS); allow for slow CI runners.
describe('PDF report', { timeout: 30_000 }, () => {
  it('normalises typography and flags unprintable scripts', () => {
    expect(toPdfText('Saves ₹20k – fast').text).toBe('Saves Rs 20k - fast');
    expect(toPdfText('सब्सिडी').printable).toBe(false);
  });

  it('builds a multi-page report with every section', async () => {
    const doc = await buildPdfReport(buildReportData({ ...baseInput, advisor }));
    const raw = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    for (const heading of ['Project configuration', 'Capital cost breakdown', 'Investment & returns', 'Bank loan and repayment', 'Site climate', 'AI summary', 'AI-generated']) {
      expect(raw).toContain(heading);
    }
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
  it('builds linked sheets with live formulas and an AI sheet', async () => {
    const workbook = await buildExcelWorkbook(buildReportData({ ...baseInput, advisor }));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Configuration',
      'Cost breakdown',
      'Returns',
      'Bank loan',
      'Climate & crops',
      'AI summary',
    ]);

    const returns = workbook.getWorksheet('Returns')!;
    const subsidy = returns.getCell('B15').value as { formula: string };
    // Subsidy % of the cost the scheme recognises (B8), never more than the capital cost (B5).
    expect(subsidy.formula).toBe('MIN($B$8*$B$7,$B$5)');
    expect((returns.getCell('B5').value as { formula: string }).formula).toContain("'Cost breakdown'!");

    const cost = workbook.getWorksheet('Cost breakdown')!;
    const total = cost.getCell('B15').value as { formula: string; result: number };
    expect(total.formula).toBe('ROUND(B13*B14,0)');
    expect(total.result).toBe(result.cost.totalCost);
  });

  it('builds a bank loan sheet whose formulas match the schedule in the app', async () => {
    const data = buildReportData(baseInput);
    const sheet = (await buildExcelWorkbook(data)).getWorksheet('Bank loan')!;
    const formula = (ref: string) => sheet.getCell(ref).value as { formula: string; result: number };
    expect(formula('B5').formula).toContain("'Cost breakdown'!");
    expect(formula('B11').formula).toBe('$B$5*$B$6');
    expect(formula('B13').formula).toBe('MIN(Returns!$B$15,$B$11)');
    expect(formula('B14').formula).toBe('IF($B$11<=0,0,PMT($B$7/$B$9,$B$8*$B$9-$B$10,-$B$11))');
    expect(formula('B14').result).toBeCloseTo(data.loan.installment, 6);
    // First schedule row opens with the loan; the one after the moratorium starts repaying principal.
    expect(formula('F5').formula).toBe('$B$11');
    const firstRepayment = 5 + data.loan.moratoriumPeriods;
    expect(formula(`H${firstRepayment}`).result).toBeCloseTo(data.loan.schedule[data.loan.moratoriumPeriods].principal, 6);
    expect(formula(`H${firstRepayment}`).result).toBeGreaterThan(0);
    // The yearly cash flow sits beside it.
    expect(sheet.getCell('M4').value).toBe('Year');
    expect(sheet.getCell('N6').value).toBeCloseTo(data.loan.years[1].farmCash, 6);
  });

  it('writes a valid .xlsx file that reloads', async () => {
    const workbook = await buildExcelWorkbook(buildReportData(baseInput));
    const buffer = await workbook.xlsx.writeBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    expect(reloaded.getWorksheet('Summary')!.getCell('A5').value).toBe('Total project cost');
    expect(reloaded.getWorksheet('AI summary')).toBeUndefined();
  });
});
