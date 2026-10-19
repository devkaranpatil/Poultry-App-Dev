import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesignSidebar, type DesignTab } from '@/components/greenhouse/DesignSidebar';
import { I18nProvider } from '@/context/I18nContext';
import type { GreenhouseConfig, SetupSectionProgress } from '@/types/greenhouse';

const baseConfig: GreenhouseConfig = {
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
  selectedCrop: 'tomato',
  irrigationSystem: 'drip',
  state: 'Goa',
  district: 'North Goa',
};

/** The sidebar with the state the page would hold: the config, the filled-in fields and the open tab. */
function Harness({
  initial,
  initialTab = 'size',
  restoredConfigVersion = 0,
  onProgress,
  onValid,
  onPatch,
}: {
  initial: GreenhouseConfig;
  initialTab?: DesignTab;
  restoredConfigVersion?: number;
  onProgress?: (progress: SetupSectionProgress) => void;
  onValid?: (valid: boolean) => void;
  onPatch?: (patch: Partial<GreenhouseConfig>) => void;
}) {
  const [config, setConfig] = useState(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<DesignTab>(initialTab);
  return (
    <DesignSidebar
      config={config}
      onConfigChange={(patch) => {
        onPatch?.(patch);
        setConfig((current) => ({ ...current, ...patch }));
      }}
      onValidationChange={onValid ?? vi.fn()}
      onProgressChange={onProgress}
      restoredConfigVersion={restoredConfigVersion}
      touched={touched}
      onTouchedChange={setTouched}
      tab={tab}
      onTabChange={setTab}
    />
  );
}

function renderSidebar(props: Parameters<typeof Harness>[0]) {
  window.localStorage.setItem('greenhouse.locale', 'en');
  return render(
    <I18nProvider>
      <Harness {...props} />
    </I18nProvider>
  );
}

const tab = (name: string) => within(screen.getByRole('navigation', { name: /parts/i })).getByRole('button', { name });

describe('DesignSidebar', () => {
  it('shows one part at a time and switches with the tabs', () => {
    renderSidebar({ initial: baseConfig });
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'size');
    expect(screen.getByRole('spinbutton', { name: 'Length (m)' })).toHaveValue(30);

    fireEvent.click(tab('Crop'));
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'crop');
    expect(tab('Crop')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: 'Tomato' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('spinbutton', { name: 'Length (m)' })).not.toBeInTheDocument();
  });

  it('locks the cover, vents and door of a shade-net house', () => {
    const onPatch = vi.fn();
    renderSidebar({ initial: baseConfig, initialTab: 'type', onPatch });
    fireEvent.click(screen.getByRole('radio', { name: /Shade Net/i }));
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ greenhouseType: 'shade-net', coverMaterial: 'shade-net', sideVentilation: 'none', doorEntry: 'curtain' })
    );
    fireEvent.click(tab('Cover'));
    expect(screen.getByRole('radio', { name: /UV/i })).toBeDisabled();
  });

  it('sets the ridge to the gutter for a flat roof', () => {
    const onPatch = vi.fn();
    renderSidebar({ initial: baseConfig, initialTab: 'roof', onPatch });
    fireEvent.click(screen.getByRole('radio', { name: 'Flat' }));
    expect(onPatch).toHaveBeenLastCalledWith(expect.objectContaining({ roofType: 'flat', ridgeHeight: 4 }));
  });

  it('counts a restored setup as fully done so the 3D model builds completely', () => {
    const onProgress = vi.fn();
    renderSidebar({ initial: baseConfig, restoredConfigVersion: 1, onProgress });
    expect(onProgress).toHaveBeenLastCalledWith({
      baseDimensions: true,
      heights: true,
      typeAndRoof: true,
      materials: true,
      access: true,
      cultivation: true,
      location: true,
    });
    expect(screen.getByTestId('setup-progress')).toHaveTextContent('7 of 7');
  });

  it('"Use recommended" fills everything but the location, then opens the Location tab', () => {
    const onValid = vi.fn();
    renderSidebar({ initial: { ...baseConfig, length: 0, width: 0, state: '', district: '' }, onValid });
    fireEvent.click(screen.getByRole('button', { name: /Use recommended/i }));
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'location');
    expect(screen.getByTestId('setup-progress')).toHaveTextContent('6 of 7');
    expect(onValid).toHaveBeenLastCalledWith(false); // no location yet
    expect(screen.getByRole('combobox', { name: 'State' })).toBeInTheDocument();
  });

  it('clamps a typed size to the supported range', () => {
    const onPatch = vi.fn();
    renderSidebar({ initial: baseConfig, onPatch });
    const width = screen.getByRole('spinbutton', { name: 'Width (m)' });
    fireEvent.change(width, { target: { value: '500' } });
    fireEvent.blur(width);
    expect(onPatch).toHaveBeenLastCalledWith(expect.objectContaining({ width: 100 }));
  });

  it('marks a tab done once its part is chosen', () => {
    renderSidebar({ initial: baseConfig, initialTab: 'frame' });
    expect(tab('Frame')).toHaveAttribute('title', 'Frame');
    fireEvent.click(screen.getByRole('radio', { name: /Bamboo/i }));
    expect(tab('Frame').getAttribute('title')).toMatch(/Done/);
  });
});
