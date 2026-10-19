import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/context/I18nContext';
import { AdvisorChat } from '@/components/advisor/AdvisorChat';
import { SummaryStep } from '@/components/workspace/SummaryStep';
import { ExportPanel } from '@/components/greenhouse/ExportPanel';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { defaultFinanceAssumptions } from '@/lib/finance';
import { DEFAULT_CONFIG, type CalculationResult, type GreenhouseConfig } from '@/types/greenhouse';
import * as aiService from '@/services/ai.service';

vi.mock('@/services/ai.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai.service')>();
  return {
    ...actual,
    getAiStatus: vi.fn(),
    requestAdvisorReport: vi.fn(),
    requestAiCrops: vi.fn(),
    streamChat: vi.fn(),
  };
});

const exportPdfReport = vi.fn();
const exportExcelReport = vi.fn();
vi.mock('@/lib/export/pdfReport', () => ({ exportPdfReport: (...args: unknown[]) => exportPdfReport(...args) }));
vi.mock('@/lib/export/excelReport', () => ({ exportExcelReport: (...args: unknown[]) => exportExcelReport(...args) }));
vi.mock('@/lib/modelSnapshot', () => ({ captureModelSnapshot: () => 'data:image/jpeg;base64,AAAA' }));

const mocked = vi.mocked(aiService);
const config: GreenhouseConfig = { ...DEFAULT_CONFIG, state: 'Goa', district: 'North Goa' };

const report: aiService.AdvisorReport = {
  summary: 'A viable project with humidity risk.',
  verdict: 'viable',
  strengths: ['Good market access'],
  risks: [{ title: 'Fungal disease', detail: 'Monsoon humidity', severity: 'high' }],
  recommendations: [{ title: 'Add insect net', detail: 'On vents', category: 'structure', impact: 'Saves ₹20k' }],
};

const exportResult = {
  area: 300,
  volume: 1500,
  climate: { climateZone: 'Tropical Coastal', avgTemperature: 27, humidity: 78, rainfall: 2900, climateFactor: 1.05, advisories: [] },
  cost: {
    structureCost: 1, coverCost: 1, ventilationCost: 1, foundationCost: 1, irrigationCost: 1,
    electricalCost: 0, laborCost: 1, miscCost: 1, totalCost: 495338, costPerSqm: 1651, climateAdjustment: 0.05,
  },
  crops: [],
  selectedCrop: null,
  irrigation: { system: 'drip', ratePerSqm: 55, notes: [] },
} as CalculationResult;

const onNavigate = vi.fn();

/** Mounts the real hook so the summary step, the chat and the export are tested with its actual state machine. */
function AdvisorHarness({ signedIn = true }: { signedIn?: boolean }) {
  const [current, setCurrent] = useState(config);
  // The workspace keeps this one setting for both the summary step and the export options.
  const [include, setInclude] = useState(true);
  const [draft, setDraft] = useState('');
  const ai = useAiAssistant({
    token: signedIn ? 'tok' : null,
    config: current,
    assumptions: defaultFinanceAssumptions(current.selectedCrop),
    financials: null,
    locale: 'en',
  });
  const shared = signedIn ? ai : undefined;
  return (
    <>
      <button type="button" onClick={() => setCurrent({ ...current, length: current.length + 1 })}>
        change-setup
      </button>
      <SummaryStep step="summary" onNavigate={onNavigate} ai={shared} includeAiSummary={include} onIncludeAiSummaryChange={setInclude} />
      <div data-testid="chat">
        <AdvisorChat ai={shared} ready suggestions={['How can I cut the project cost?']} draft={draft} onDraftChange={setDraft} />
      </div>
      <ExportPanel
        config={current}
        result={exportResult}
        assumptions={defaultFinanceAssumptions(current.selectedCrop)}
        ai={shared}
        includeAdvisor={include}
        onIncludeAdvisorChange={setInclude}
      />
    </>
  );
}

function renderWithI18n(ui: React.ReactElement) {
  window.localStorage.setItem('greenhouse.locale', 'en');
  return render(
    <MemoryRouter>
      <I18nProvider>{ui}</I18nProvider>
    </MemoryRouter>
  );
}

const includeSwitch = () => screen.getByRole('switch', { name: 'Include this summary in my report' });
const exportCheckbox = () => screen.getByRole('checkbox', { name: /AI summary \(AI-generated\)/ });

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAiStatus.mockResolvedValue({ enabled: true, model: 'Qwen3-1.7B-Q8_0' });
});

describe('AI summary step', () => {
  it('explains how to enable AI when the server has no model, and still lets you skip', async () => {
    mocked.getAiStatus.mockResolvedValue({ enabled: false, model: null });
    renderWithI18n(<AdvisorHarness />);
    expect((await screen.findAllByText("AI advisor isn't set up yet")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('summary-skip'));
    expect(onNavigate).toHaveBeenCalledWith('report');
  });

  it('asks a signed-out user to log in and lets them skip to the report', () => {
    renderWithI18n(<AdvisorHarness signedIn={false} />);
    const card = screen.getByTestId('summary-sign-in');
    expect(card).toHaveTextContent('Log in to get an AI summary');
    expect(within(card).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    fireEvent.click(within(card).getByRole('button', { name: 'Skip, go to the report' }));
    expect(onNavigate).toHaveBeenCalledWith('report');
  });

  it('generates a summary, includes it by default and leaves it out once it is stale', async () => {
    mocked.requestAdvisorReport.mockResolvedValue(report);
    renderWithI18n(<AdvisorHarness />);

    expect(includeSwitch()).toBeDisabled();
    expect(exportCheckbox()).toBeDisabled();
    expect(screen.getByTestId('summary-skip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }));
    expect(await screen.findByText('A viable project with humidity risk.')).toBeInTheDocument();
    expect(screen.getByText('Fungal disease')).toBeInTheDocument();
    expect(screen.getByText('Saves ₹20k')).toBeInTheDocument();
    expect(within(screen.getByTestId('summary-review')).getByText('AI-generated')).toBeInTheDocument();
    expect(mocked.requestAdvisorReport).toHaveBeenCalledWith('tok', expect.objectContaining({ locale: 'en' }));
    expect(includeSwitch()).toBeChecked();
    expect(exportCheckbox()).toBeChecked();
    expect(screen.getByTestId('in-short')).toHaveTextContent('will go into the report');
    expect(screen.queryByTestId('summary-skip')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'change-setup' }));
    expect(screen.getByTestId('summary-stale')).toHaveTextContent(/Your setup changed after this summary was written/);
    expect(includeSwitch()).toBeDisabled();
    expect(includeSwitch()).not.toBeChecked();
    expect(exportCheckbox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generate again' })).toBeEnabled();
  });

  it('keeps the step switch and the export option in step, and exports the summary only when included', async () => {
    mocked.requestAdvisorReport.mockResolvedValue(report);
    renderWithI18n(<AdvisorHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }));
    await screen.findByText('A viable project with humidity risk.');

    fireEvent.click(includeSwitch());
    expect(includeSwitch()).not.toBeChecked();
    expect(exportCheckbox()).not.toBeChecked();
    expect(screen.getByTestId('in-short')).toHaveTextContent('leave it out of the report');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    });
    await waitFor(() => expect(exportPdfReport).toHaveBeenCalledTimes(1));
    expect(exportPdfReport.mock.calls[0][0]).toMatchObject({ advisor: null });

    fireEvent.click(exportCheckbox());
    expect(includeSwitch()).toBeChecked();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    });
    await waitFor(() => expect(exportExcelReport).toHaveBeenCalledTimes(1));
    expect(exportExcelReport.mock.calls[0][0]).toMatchObject({ advisor: report });
  });

  it('shows a clear message when the AI request fails, and tries again', async () => {
    mocked.requestAdvisorReport.mockRejectedValueOnce(new aiService.AiRequestError('busy', 'RATE_LIMITED')).mockResolvedValueOnce(report);
    renderWithI18n(<AdvisorHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/reached the AI limit/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('A viable project with humidity risk.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Advisor chat', () => {
  it('streams a chat reply into the conversation', async () => {
    mocked.streamChat.mockImplementation(async (_token, _context, _messages, onText) => {
      onText('Use a gothic ');
      onText('Use a gothic roof.');
      return 'Use a gothic roof.';
    });
    renderWithI18n(<AdvisorHarness />);

    const box = await screen.findByLabelText(/Ask about your setup/);
    fireEvent.change(box, { target: { value: 'Which roof?' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await screen.findByText('Which roof?')).toBeInTheDocument();
    expect(await screen.findByText('Use a gothic roof.')).toBeInTheDocument();
    const sentHistory = mocked.streamChat.mock.calls[0][2];
    expect(sentHistory).toEqual([{ role: 'user', content: 'Which roof?' }]);
  });

  it('sends a suggested question with one click', async () => {
    mocked.streamChat.mockResolvedValue('Fine.');
    renderWithI18n(<AdvisorHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'How can I cut the project cost?' }));
    await waitFor(() => expect(mocked.streamChat).toHaveBeenCalled());
  });

  it('asks a signed-out user to log in', () => {
    renderWithI18n(<AdvisorHarness signedIn={false} />);
    expect(within(screen.getByTestId('chat')).getByText('Log in to use the AI advisor.')).toBeInTheDocument();
  });
});

describe('Export panel', () => {
  const result = exportResult;

  it('asks for a complete setup before exporting', () => {
    renderWithI18n(<ExportPanel config={config} result={null} assumptions={defaultFinanceAssumptions('tomato')} />);
    expect(screen.getByText('Complete the setup to export a report.')).toBeInTheDocument();
  });

  it('builds the PDF with the 3D snapshot and the Excel without it', async () => {
    renderWithI18n(<ExportPanel config={config} result={result} assumptions={defaultFinanceAssumptions('tomato')} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    });
    await waitFor(() => expect(exportPdfReport).toHaveBeenCalledTimes(1));
    expect(exportPdfReport.mock.calls[0][0]).toMatchObject({ snapshot: 'data:image/jpeg;base64,AAAA', advisor: null });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    });
    await waitFor(() => expect(exportExcelReport).toHaveBeenCalledTimes(1));
    expect(exportExcelReport.mock.calls[0][0]).toMatchObject({ snapshot: null });
  });

  it('disables AI sections until they have been generated', () => {
    renderWithI18n(<ExportPanel config={config} result={result} assumptions={defaultFinanceAssumptions('tomato')} />);
    expect(exportCheckbox()).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /3D model snapshot/ })).toBeEnabled();
  });
});
