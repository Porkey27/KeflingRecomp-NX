# patches/

Patches to the ReXGlue SDK and system libraries applied at build time.

| File | Target | Purpose |
|------|--------|---------|
| _(none yet)_ | — | — |

## Expected patches (TODO)

- `horizon_xma.patch` — stub out XMA2 decoder in the Horizon SDK and redirect
  to Audren/Opus (until `audio_fix.cpp` is fully implemented)
- `nvn_viewport.patch` — fix 360→Switch viewport-flip convention mismatch
  (Y-axis is inverted between D3D9 and OpenGL)
