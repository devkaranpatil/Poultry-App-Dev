import { describe, expect, it } from 'vitest';
import { isSoftwareRendererName } from '@/lib/renderCapability';

describe('isSoftwareRendererName', () => {
  it('recognises CPU implementations of WebGL', () => {
    // What headless Chromium (Playwright, CI) reports.
    expect(isSoftwareRendererName('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRendererName('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRendererName('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)')).toBe(true);
  });

  it('leaves real GPUs alone', () => {
    expect(isSoftwareRendererName('ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isSoftwareRendererName('Adreno (TM) 610')).toBe(false);
    expect(isSoftwareRendererName('Mali-G57')).toBe(false);
    expect(isSoftwareRendererName('')).toBe(false);
    expect(isSoftwareRendererName(null)).toBe(false);
  });
});
