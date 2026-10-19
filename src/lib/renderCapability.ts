// Detects WebGL that runs on the CPU (SwiftShader, llvmpipe, Microsoft Basic Render Driver).
// Headless browsers, virtual machines, CI runners and many low-end PCs without a GPU driver use it;
// there every shadow-mapped, antialiased frame blocks the main thread, so the scene must start in 'lite'.

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

/** True when the renderer string names a CPU (software) implementation of WebGL. */
export function isSoftwareRendererName(renderer: string | null | undefined): boolean {
  return Boolean(renderer && SOFTWARE_RENDERER.test(renderer));
}

let cached: boolean | undefined;

/** Asks a throwaway WebGL context which renderer it got. Cached: the answer cannot change in a session. */
export function hasSoftwareWebGL(): boolean {
  if (cached !== undefined) return cached;
  cached = false;
  if (typeof document === 'undefined') return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return cached;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    cached = isSoftwareRendererName(String(renderer ?? ''));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // No WebGL or a blocked extension: keep the device-based choice.
  }
  return cached;
}
