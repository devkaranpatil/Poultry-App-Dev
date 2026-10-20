import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdvisorWidget } from '@/components/advisor/AdvisorWidget';
import { I18nProvider } from '@/context/I18nContext';
import type { AiAssistant } from '@/hooks/useAiAssistant';
import type { StepId } from '@/components/workspace/steps';

function fakeAi(overrides: Partial<AiAssistant> = {}): AiAssistant {
  return {
    status: { enabled: true, model: 'stub' },
    advisor: null,
    advisorStale: false,
    advisorLoading: false,
    advisorError: null,
    generateAdvisor: vi.fn(),
    crops: null,
    cropsStale: false,
    cropsLoading: false,
    cropsError: null,
    generateCrops: vi.fn(),
    messages: [],
    chatStreaming: false,
    chatError: null,
    sendChat: vi.fn(),
    stopChat: vi.fn(),
    resetChat: vi.fn(),
    ...overrides,
  } as AiAssistant;
}

function renderWidget(options: { ai?: AiAssistant; step?: StepId } = {}) {
  const ai = 'ai' in options ? options.ai : fakeAi();
  const step = options.step ?? 'cost';
  const onOpenSummary = vi.fn();
  window.localStorage.setItem('farm.locale', 'en');
  const ui = (props: { ai?: AiAssistant; step: StepId }) => (
    <MemoryRouter>
      <I18nProvider>
        <AdvisorWidget ai={props.ai} ready step={props.step} onOpenSummary={onOpenSummary} />
      </I18nProvider>
    </MemoryRouter>
  );
  const view = render(ui({ ai, step }));
  return {
    ...view,
    onOpenSummary,
    rerenderWith: (next: { ai?: AiAssistant; step?: StepId }) => view.rerender(ui({ ai: next.ai, step: next.step ?? step })),
  };
}

const launcher = () => screen.getByTestId('advisor-launcher');
const questionBox = () => screen.getByLabelText(/Ask about your shed/);

describe('Advisor widget', () => {
  it('opens a small chat window from the launcher and puts the cursor in the question box', async () => {
    renderWidget({ step: 'loan' });
    expect(launcher()).toHaveAccessibleName('Ask advisor');
    expect(launcher()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(launcher());
    const chat = screen.getByRole('dialog', { name: 'AI advisor' });
    expect(launcher()).toHaveAttribute('aria-expanded', 'true');
    expect(launcher()).toHaveAttribute('aria-controls', chat.id);
    // Example questions fit the step the user is on.
    expect(within(chat).getByRole('button', { name: 'What does debt cover (DSCR) mean for my loan?' })).toBeInTheDocument();
    await waitFor(() => expect(questionBox()).toHaveFocus());
  });

  it('closes on Escape and hands focus back to the launcher', async () => {
    renderWidget();
    fireEvent.click(launcher());
    await waitFor(() => expect(questionBox()).toHaveFocus());
    fireEvent.keyDown(questionBox(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('advisor-window')).not.toBeInTheDocument());
    expect(launcher()).toHaveFocus();
    expect(launcher()).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to full screen, where Escape steps back to the small window', async () => {
    renderWidget();
    fireEvent.click(launcher());
    fireEvent.click(screen.getByRole('button', { name: 'Open full screen' }));

    const full = await screen.findByTestId('advisor-fullscreen');
    expect(full).toHaveAttribute('role', 'dialog');
    expect(within(full).getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
    await waitFor(() => expect(within(full).getByLabelText(/Ask about your shed/)).toHaveFocus());

    fireEvent.keyDown(full, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('advisor-fullscreen')).not.toBeInTheDocument());
    expect(screen.getByTestId('advisor-window')).toBeInTheDocument();
  });

  it('minimising remembers full screen, closing starts small again, and the unsent question survives both', async () => {
    renderWidget();
    fireEvent.click(launcher());
    fireEvent.change(questionBox(), { target: { value: 'Half-typed question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open full screen' }));
    const full = await screen.findByTestId('advisor-fullscreen');
    expect(within(full).getByLabelText(/Ask about your shed/)).toHaveValue('Half-typed question');

    fireEvent.click(within(full).getByRole('button', { name: 'Minimize' }));
    await waitFor(() => expect(screen.queryByTestId('advisor-fullscreen')).not.toBeInTheDocument());
    fireEvent.click(launcher());
    expect(await screen.findByTestId('advisor-fullscreen')).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('advisor-fullscreen')).getByRole('button', { name: 'Close advisor' }));
    await waitFor(() => expect(screen.queryByTestId('advisor-fullscreen')).not.toBeInTheDocument());
    fireEvent.click(launcher());
    expect(screen.getByTestId('advisor-window')).toBeInTheDocument();
    expect(questionBox()).toHaveValue('Half-typed question');
  });

  it('shows the advisor typing while folded away, then a new-reply dot until it is opened', async () => {
    const { rerenderWith } = renderWidget({
      ai: fakeAi({
        chatStreaming: true,
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: '' },
        ],
      }),
    });
    expect(screen.getByTestId('advisor-typing')).toBeInTheDocument();
    expect(launcher()).toHaveAccessibleName('Ask advisor. The advisor is writing');

    rerenderWith({
      ai: fakeAi({
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello.' },
        ],
      }),
    });
    expect(screen.queryByTestId('advisor-typing')).not.toBeInTheDocument();
    expect(screen.getByTestId('advisor-unread')).toBeInTheDocument();
    expect(launcher()).toHaveAccessibleName('Ask advisor. New reply');

    fireEvent.click(launcher());
    expect(screen.queryByTestId('advisor-unread')).not.toBeInTheDocument();
    expect(screen.getByText('Hello.')).toBeInTheDocument();
  });

  it('links to the AI summary step, except on that step', () => {
    const { onOpenSummary, rerenderWith } = renderWidget();
    fireEvent.click(launcher());
    fireEvent.click(screen.getByRole('button', { name: 'See AI summary' }));
    expect(onOpenSummary).toHaveBeenCalledTimes(1);

    rerenderWith({ ai: fakeAi(), step: 'summary' });
    expect(screen.queryByRole('button', { name: 'See AI summary' })).not.toBeInTheDocument();
  });

  it('asks a signed-out user to log in', () => {
    renderWidget({ ai: undefined });
    fireEvent.click(launcher());
    const chat = screen.getByRole('dialog', { name: 'AI advisor' });
    expect(within(chat).getByText('Log in to use the AI advisor.')).toBeInTheDocument();
    expect(within(chat).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });
});
