import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from '@/components/farm/PropertiesPanel';
import { I18nProvider } from '@/context/I18nContext';
import { DEFAULT_CONFIG } from '@/types/farm';
import type { EditablePart } from '@/lib/sceneEdit';

/** The panel with its selection held as MiddlePanel holds it; `pickOnModel` stands in for a tap on the 3D view. */
function Harness({ compact, pickOnModel }: { compact: boolean; pickOnModel?: EditablePart }) {
  const [selected, setSelected] = useState<EditablePart | null>(null);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setSelected(pickOnModel ?? null)}>
        tap model
      </button>
      <PropertiesPanel config={DEFAULT_CONFIG} selected={selected} onSelect={setSelected} onChange={vi.fn()} compact={compact} open onOpenChange={vi.fn()} />
    </I18nProvider>
  );
}

describe('PropertiesPanel on a phone', () => {
  it('shows a part picked on the model as a slim bar that opens on request', () => {
    window.localStorage.setItem('farm.locale', 'en');
    render(<Harness compact pickOnModel="entry" />);
    fireEvent.click(screen.getByText('tap model'));

    const editor = screen.getByTestId('part-editor');
    expect(editor).toHaveAttribute('data-part', 'entry');
    expect(editor).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByTestId('parts-row')).toBeNull();

    fireEvent.click(screen.getByTestId('properties-expand'));
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByTestId('part-editor')).not.toHaveAttribute('data-collapsed');

    fireEvent.click(screen.getByTestId('properties-expand'));
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-collapsed', 'true');
  });

  it('opens the options of a part picked from the list', () => {
    window.localStorage.setItem('farm.locale', 'en');
    render(<Harness compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Roof' }));
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'roof');
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('always shows the full panel on a desktop', () => {
    window.localStorage.setItem('farm.locale', 'en');
    render(<Harness compact={false} pickOnModel="roof" />);
    fireEvent.click(screen.getByText('tap model'));
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.queryByTestId('properties-expand')).toBeNull();
  });
});
