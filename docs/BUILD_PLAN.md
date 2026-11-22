# KeflingRecomp-NX — Build Plan

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| CMake | ≥ 3.25 | |
| devkitA64 | latest | devkitPro, for Switch target |
| libnx | latest | devkitPro |
| ReXGlue SDK | latest | https://github.com/rexglue/rexglue-sdk |
| ffmpeg | any recent | audio conversion in `preparar-juego` |
| Python 3 | ≥ 3.8 | manifest validation |

## 1. Prepare game data

You need a legitimate copy of **A World of Keflings** (Xbox 360 XBLA,
Title ID `584109DE`).

```bash
# Linux / macOS
./tools/preparar-juego.sh /path/to/584109DE

# Windows (PowerShell)
.\tools\preparar-juego.ps1 -SourceDir "C:\path\to\584109DE"
```

This writes `game/` in the repo root with the XEX, media, converted audio,
and translated shaders.

## 2. Run the ReXGlue recompiler

```bash
rexglue recompile game/default.xex \
    --output src/game/generated/ \
    --platform switch
```

The `generated/` directory is not committed to the repo.

## 3. Build (Switch target)

```bash
cmake -B build-nx -DSWITCH=1 \
      -DCMAKE_TOOLCHAIN_FILE=$DEVKITPRO/cmake/Switch.cmake \
      -DCMAKE_BUILD_TYPE=Release
cmake --build build-nx -j$(nproc)
# Output: build-nx/keflings.nro
```

## 4. Build (desktop, for renderer development)

```bash
cmake -B build-desktop \
      -DKEFLINGS_NATIVE_RENDERER=ON \
      -DCMAKE_BUILD_TYPE=Release
cmake --build build-desktop -j$(nproc)
```

## 5. Deploy to Switch

```
sdmc:/keflings/
├── keflings.nro
├── keflings.toml          ← from release/keflings.toml
└── game/                  ← output of preparar-juego
    ├── default.xex
    ├── media/
    ├── audio_opus/
    └── shaders_spv/
```

Launch via homebrew menu (hbmenu / Tesla / nx-hbmenu).

## Known issues / TODO

- [ ] `audio_fix.cpp` — XMA2→Opus shim is a stub; needs ReXGlue audio vtable hook
- [ ] `native/renderer.cpp` — EGL/deko3d context not yet implemented
- [ ] `native/texture_cache.cpp` — Morton detile stub
- [ ] `native/shader_recompiler.cpp` — SPIR-V upload stub
- [ ] Save-data path mapping (`STFS` → `sdmc:/keflings/saves/`)
- [ ] XInput → HID-JoyCon button remap
- [ ] Touch support for menu navigation
