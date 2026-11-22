# KeflingRecomp-NX

Nintendo Switch port of **A World of Keflings** (Xbox 360 XBLA, 2011) via
static recompilation using the [ReXGlue SDK](https://github.com/rexglue/rexglue-sdk).

> **You must own a legitimate copy of A World of Keflings (Title ID `584109DE`)
> to use this.**  This project does not distribute any game assets.

---

## What is in here

| Path | Contents |
|------|----------|
| `src/game/` | Hooks, frame pacing, native renderer, Switch entry point, CMake files. Recompiler output goes in `src/game/generated/` and is not distributed. |
| `src/game/native/` | Native Switch renderer (EGL/deko3d) stubs — work in progress. |
| `patches/` | Patches to the ReXGlue SDK / Horizon system libraries. |
| `release/` | Example `keflings.toml` config to place on your SD card. |
| `tools/` | `preparar-juego.sh` / `.ps1` — extracts and converts your game copy. |
| `docs/` | `BUILD_PLAN.md` (how to build) · `BUILD_STATUS.md` (hardware test log). |

## Quick start

### 1. Prepare your game data

```bash
# Linux / macOS
./tools/preparar-juego.sh /path/to/584109DE

# Windows
.\tools\preparar-juego.ps1 -SourceDir "C:\path\to\584109DE"
```

### 2. Recompile

```bash
rexglue recompile game/default.xex \
    --output src/game/generated/ \
    --platform switch
```

### 3. Build

```bash
cmake -B build-nx -DSWITCH=1 \
      -DCMAKE_TOOLCHAIN_FILE=$DEVKITPRO/cmake/Switch.cmake \
      -DCMAKE_BUILD_TYPE=Release
cmake --build build-nx -j$(nproc)
```

### 4. Deploy

Copy to your SD card:
```
sdmc:/keflings/keflings.nro
sdmc:/keflings/keflings.toml
sdmc:/keflings/game/          ← output of preparar-juego
```

Launch from hbmenu.

---

## Status

Early development — the native renderer and audio shim are stubs.
See [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) for the full TODO list and
[`docs/BUILD_STATUS.md`](docs/BUILD_STATUS.md) for hardware test results.

## License

GPL-3.0-or-later.  See [LICENSE](LICENSE) and [NOTICE](NOTICE).
