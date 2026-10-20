import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesignSidebar, type DesignTab } from '@/components/farm/DesignSidebar';
import { I18nProvider } from '@/context/I18nContext';
import { DEFAULT_CONFIG, normalizeFarmConfig, type FarmConfig, type SetupSectionProgress } from '@/types/farm';

/** A 20 m by 5 m open broiler shed in Nagpur: 1,076 birds. */
const baseConfig: FarmConfig = { ...DEFAULT_CONFIG, length: 20, width: 5, state: 'Maharashtra', district: 'Nagpur' };

/** The sidebar with the state the page would hold; changes go through normalizeFarmConfig, as on the page. */
function Harness({
  initial,
  initialTab = 'size',
  restoredConfigVersion = 0,
  onProgress,
  onValid,
  onPatch,
}: {
  initial: FarmConfig;
  initialTab?: DesignTab;
  restoredConfigVersion?: number;
  onProgress?: (progress: SetupSectionProgress) => void;
  onValid?: (valid: boolean) => void;
  onPatch?: (patch: Partial<FarmConfig>) => void;
}) {
  const [config, setConfig] = useState(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<DesignTab>(initialTab);
  return (
    <DesignSidebar
      config={config}
      onConfigChange={(patch) => {
        onPatch?.(patch);
        setConfig((current) => normalizeFarmConfig({ ...current, ...patch }));
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
  window.localStorage.setItem('farm.locale', 'en');
  return render(
    <I18nProvider>
      <Harness {...props} />
    </I18nProvider>
  );
}

const tab = (name: string) => within(screen.getByRole('navigation', { name: /parts/i })).getByRole('button', { name });
const option = (name: string | RegExp) => screen.getByRole('radio', { name });

describe('DesignSidebar', () => {
  it('shows one part at a time and switches with the tabs', () => {
    renderSidebar({ initial: baseConfig });
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'size');
    expect(screen.getByRole('spinbutton', { name: 'Length (m)' })).toHaveValue(20);
    expect(screen.getByRole('spinbutton', { name: 'Flock size' })).toHaveValue(1076);

    fireEvent.click(tab('Birds'));
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'birds');
    expect(tab('Birds')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Broiler')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('spinbutton', { name: 'Length (m)' })).not.toBeInTheDocument();
  });

  it('shows choices that do not fit the bird, but does not let them be picked', () => {
    renderSidebar({ initial: baseConfig, initialTab: 'housing' });
    expect(option('Backyard')).toBeDisabled();
    fireEvent.click(tab('Birds'));
    fireEvent.click(option('Improved desi'));
    fireEvent.click(tab('Shed'));
    expect(option('Environment-controlled')).toBeDisabled();
    fireEvent.click(option('Backyard'));
    fireEvent.click(tab('Frame'));
    // A backyard shed is built of bamboo or wood: the frame followed, and the steel truss cannot be picked.
    expect(option('Bamboo or wood')).toHaveAttribute('aria-checked', 'true');
    expect(option('Steel truss')).toBeDisabled();
  });

  it('closes the walls of an environment-controlled shed', () => {
    renderSidebar({ initial: baseConfig, initialTab: 'housing' });
    fireEvent.click(option('Environment-controlled'));
    fireEvent.click(tab('Side walls'));
    expect(option('Closed, tunnel fans')).toHaveAttribute('aria-checked', 'true');
    expect(option('Mesh and curtains')).toBeDisabled();
  });

  it('feeds caged layers from troughs, keeps them off contract and offers cage tiers', () => {
    renderSidebar({ initial: baseConfig, initialTab: 'birds' });
    fireEvent.click(option('Layers in cages'));
    expect(option('Contract')).toBeDisabled();
    expect(option('3 tiers')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(tab('Feeding'));
    expect(option('Troughs')).toHaveAttribute('aria-checked', 'true');
    expect(option('Manual')).toBeDisabled();
  });

  it('lengthens the shed to hold the flock the farmer types', () => {
    const onPatch = vi.fn();
    renderSidebar({ initial: baseConfig, onPatch });
    const flock = screen.getByRole('spinbutton', { name: 'Flock size' });
    fireEvent.change(flock, { target: { value: '5000' } });
    fireEvent.blur(flock);
    // 5,000 broilers at 1 sq ft need 464.5 m2: 93 m of a 5 m wide shed.
    expect(onPatch).toHaveBeenLastCalledWith({ length: 93 });
  });

  it('takes the farmer’s own stocking density and goes back to the norm', () => {
    renderSidebar({ initial: baseConfig });
    const density = screen.getByRole('spinbutton', { name: 'Floor space a bird' });
    fireEvent.change(density, { target: { value: '1.2' } });
    fireEvent.blur(density);
    expect(screen.getByRole('spinbutton', { name: 'Flock size' })).toHaveValue(896);
    fireEvent.click(screen.getByRole('button', { name: /Use the norm/ }));
    expect(screen.getByRole('spinbutton', { name: 'Flock size' })).toHaveValue(1076);
  });

  it('counts a restored setup as fully done so the 3D model builds completely', () => {
    const onProgress = vi.fn();
    renderSidebar({ initial: baseConfig, restoredConfigVersion: 1, onProgress });
    expect(onProgress).toHaveBeenLastCalledWith({ size: true, shed: true, birds: true, location: true });
    expect(screen.getByTestId('setup-progress')).toHaveTextContent('4 of 4');
  });

  it('"Use recommended" fills everything but the location, then opens the Location tab', () => {
    const onValid = vi.fn();
    renderSidebar({ initial: { ...baseConfig, length: 0, width: 0, state: '', district: '' }, onValid });
    fireEvent.click(screen.getByRole('button', { name: /Use recommended/i }));
    expect(screen.getByTestId('part-editor')).toHaveAttribute('data-part', 'location');
    expect(screen.getByTestId('setup-progress')).toHaveTextContent('3 of 4');
    expect(onValid).toHaveBeenLastCalledWith(false); // no location yet
    expect(screen.getByRole('combobox', { name: 'State' })).toBeInTheDocument();
    expect(option('SC/ST')).toBeInTheDocument();
  });

  it('clamps a typed size to the supported range and warns about a wide open shed', () => {
    const onPatch = vi.fn();
    renderSidebar({ initial: baseConfig, onPatch });
    const width = screen.getByRole('spinbutton', { name: 'Width (m)' });
    fireEvent.change(width, { target: { value: '500' } });
    fireEvent.blur(width);
    expect(onPatch).toHaveBeenLastCalledWith({ width: 18 });
    expect(screen.getByText(/wider than 12 m ventilates poorly/)).toBeInTheDocument();
  });

  it('marks a tab done once its part is chosen', () => {
    renderSidebar({ initial: baseConfig, initialTab: 'frame' });
    expect(tab('Frame')).toHaveAttribute('title', 'Frame');
    fireEvent.click(option('RCC pillars'));
    expect(tab('Frame').getAttribute('title')).toMatch(/Done/);
  });
});
