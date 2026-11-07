import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdvisorPanel, type AdvisorLayout } from '@/components/advisor/AdvisorPanel';
import { WorkspaceMenu } from '@/components/workspace/WorkspaceMenu';
import { MoneyAskBox } from '@/components/workspace/MoneyAskBox';
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

/** The panel as the workspace holds it: open state outside, closed to start. */
function Harness({ layout, step, onOpenSummary }: { layout: AdvisorLayout; step: StepId; onOpenSummary: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open advisor
      </button>
      <AdvisorPanel layout={layout} open={open} onOpenChange={setOpen} ai={fakeAi()} ready step={step} onOpenSummary={onOpenSummary} />
    </>
  );
}

function renderPanel(layout: AdvisorLayout, step: StepId = 'loan') {
  window.localStorage.setItem('farm.locale', 'en');
  const onOpenSummary = vi.fn();
  render(
    <MemoryRouter>
      <I18nProvider>
        <Harness layout={layout} step={step} onOpenSummary={onOpenSummary} />
      </I18nProvider>
    </MemoryRouter>
  );
  return { onOpenSummary, openIt: () => fireEvent.click(screen.getByRole('button', { name: 'open advisor' })) };
}

const questionBox = () => screen.getByLabelText(/Ask about your shed/);

describe('Advisor panel', () => {
  it('docks beside the step on a laptop, takes the cursor, and closes with Esc keeping the half-typed question', async () => {
    const { openIt } = renderPanel('dock');
    expect(screen.queryByLabelText(/Ask about your shed/)).not.toBeInTheDocument();

    openIt();
    const panel = await screen.findByRole('complementary', { name: 'AI advisor' });
    await waitFor(() => expect(questionBox()).toHaveFocus());

    fireEvent.change(questionBox(), { target: { value: 'Half-typed question' } });
    fireEvent.keyDown(questionBox(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText(/Ask about your shed/)).not.toBeInTheDocument());

    openIt();
    await waitFor(() => expect(questionBox()).toHaveValue('Half-typed question'));
  });

  it('opens as its own page on a phone, with a way back to the step', async () => {
    const { openIt } = renderPanel('page', 'earnings');
    openIt();
    const page = await screen.findByTestId('advisor-panel');
    expect(within(page).getByRole('heading', { name: 'AI advisor' })).toBeInTheDocument();

    fireEvent.click(within(page).getByRole('button', { name: 'Back to Earnings' }));
    await waitFor(() => expect(screen.queryByTestId('advisor-panel')).not.toBeInTheDocument());
  });

  it('offers the AI summary, except on that step, and steps aside for it on a tablet', async () => {
    const { openIt, onOpenSummary } = renderPanel('sheet', 'cost');
    openIt();
    const sheet = await screen.findByTestId('advisor-panel');
    fireEvent.click(within(sheet).getByRole('button', { name: /AI summary/ }));
    expect(onOpenSummary).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('advisor-panel')).not.toBeInTheDocument());
  });
});

describe('Workspace menu', () => {
  const renderMenu = (props: Partial<Parameters<typeof WorkspaceMenu>[0]> = {}) => {
    window.localStorage.setItem('farm.locale', 'en');
    render(
      <MemoryRouter>
        <I18nProvider>
          <WorkspaceMenu advisorUnread={false} onOpenGuide={vi.fn()} {...props} />
        </I18nProvider>
      </MemoryRouter>
    );
    const trigger = screen.getByTestId('workspace-menu');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    return trigger;
  };

  it('keeps the advisor out of the menu while designing the shed', async () => {
    renderMenu();
    expect(await screen.findByRole('menuitem', { name: /How it works/ })).toBeInTheDocument();
    expect(screen.queryByTestId('ask-advisor')).not.toBeInTheDocument();
  });

  it('marks a reply that came in while the advisor was closed', async () => {
    const onAskAdvisor = vi.fn();
    const trigger = renderMenu({ onAskAdvisor, advisorUnread: true });
    expect(trigger).toHaveAccessibleName('More options. Reply ready');
    expect(screen.getByTestId('advisor-unread')).toBeInTheDocument();
    const item = await screen.findByTestId('ask-advisor');
    expect(item).toHaveTextContent('Reply ready');
    fireEvent.click(item);
    expect(onAskAdvisor).toHaveBeenCalledTimes(1);
  });
});

describe('Ask box on the money steps', () => {
  const renderBox = (compact = false) => {
    window.localStorage.setItem('farm.locale', 'en');
    window.localStorage.removeItem('farm.askBoxFolded');
    const onAsk = vi.fn();
    render(
      <MemoryRouter>
        <I18nProvider>
          <MoneyAskBox step="earnings" onAsk={onAsk} unread={false} compact={compact} />
        </I18nProvider>
      </MemoryRouter>
    );
    return onAsk;
  };

  it('asks a typed question or the suggested one', () => {
    const onAsk = renderBox();
    const box = screen.getByRole('region', { name: 'Ask about these figures' });
    fireEvent.change(within(box).getByLabelText('Ask about these figures'), { target: { value: '  Why is my profit negative?  ' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Send' }));
    expect(onAsk).toHaveBeenLastCalledWith('Why is my profit negative?');

    const suggestion = within(box).getAllByRole('button').find((button) => button.textContent && button.textContent.length > 20)!;
    fireEvent.click(suggestion);
    expect(onAsk).toHaveBeenLastCalledWith(suggestion.textContent);
  });

  it('folds to a button and remembers it', () => {
    renderBox();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('region', { name: 'Ask about these figures' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('farm.askBoxFolded')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Ask advisor' }));
    expect(screen.getByRole('region', { name: 'Ask about these figures' })).toBeInTheDocument();
  });

  it('is only a button on a phone, which opens the advisor', () => {
    const onAsk = renderBox(true);
    expect(screen.queryByRole('region', { name: 'Ask about these figures' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask advisor' }));
    expect(onAsk).toHaveBeenCalledWith(undefined);
  });
});
