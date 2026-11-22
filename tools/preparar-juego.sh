#!/usr/bin/env bash
# preparar-juego.sh — Prepare the game/ folder from your own copy of
# "A World of Keflings" (Xbox 360 XBLA, Title ID 584109DE).
#
# Usage:
#   ./tools/preparar-juego.sh /path/to/584109DE
#
# Requirements:
#   • rexglue      — in PATH (ReXGlue CLI, https://github.com/rexglue/rexglue-sdk)
#   • ffmpeg       — for XMA2 → Opus conversion
#   • python3      — for manifest validation
#
# Output layout written to ./game/:
#   game/default.xex
#   game/media/            (textures, assets copied verbatim)
#   game/audio_opus/       (XMA2 streams converted to Opus)
#   game/shaders_spv/      (Xenos shaders translated to SPIR-V)

set -euo pipefail

TITLE_ID="584109DE"
SRC="${1:-}"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GRN}[preparar]${NC} $*"; }
warn()  { echo -e "${YLW}[preparar]${NC} $*"; }
error() { echo -e "${RED}[preparar]${NC} $*" >&2; exit 1; }

# ── Argument check ────────────────────────────────────────────────────────────
[[ -z "$SRC" ]] && error "Usage: $0 /path/to/${TITLE_ID}"
[[ -d "$SRC" ]] || error "Source directory not found: $SRC"

# ── Dependency check ──────────────────────────────────────────────────────────
for dep in rexglue ffmpeg python3; do
    command -v "$dep" &>/dev/null || error "Required tool not found in PATH: $dep"
done

# ── Setup output directories ──────────────────────────────────────────────────
OUT="$(pwd)/game"
mkdir -p "$OUT"/{media,audio_opus,shaders_spv}

# ── 1. Extract / copy XEX ─────────────────────────────────────────────────────
info "Locating default.xex …"
XEX=$(find "$SRC" -maxdepth 3 -iname "default.xex" | head -1)
[[ -z "$XEX" ]] && error "Could not find default.xex under $SRC"
cp "$XEX" "$OUT/default.xex"
info "  → $OUT/default.xex"

# ── 2. Copy media assets ───────────────────────────────────────────────────────
info "Copying media assets …"
MEDIA_SRC=$(find "$SRC" -maxdepth 3 -type d -iname "media" | head -1)
if [[ -n "$MEDIA_SRC" ]]; then
    rsync -a --info=progress2 "$MEDIA_SRC/" "$OUT/media/"
else
    warn "No media/ directory found — the game may load assets from the XEX directly"
fi

# ── 3. Convert XMA2 audio → Opus ─────────────────────────────────────────────
info "Converting XMA2 audio streams to Opus …"
XMA_FILES=( $(find "$SRC" -iname "*.xma" -o -iname "*.xwb" 2>/dev/null) )
if [[ ${#XMA_FILES[@]} -eq 0 ]]; then
    warn "No .xma/.xwb files found — skipping audio conversion"
else
    for xma in "${XMA_FILES[@]}"; do
        base=$(basename "$xma" | sed 's/\.[^.]*$//')
        out_opus="$OUT/audio_opus/${base}.ogg"
        if [[ ! -f "$out_opus" ]]; then
            ffmpeg -v error -i "$xma" -c:a libopus -b:a 128k "$out_opus" \
                && info "  converted: $base.ogg" \
                || warn "  failed to convert: $xma (skipping)"
        else
            info "  already converted: $base.ogg"
        fi
    done
fi

# ── 4. Recompile shaders ──────────────────────────────────────────────────────
info "Recompiling Xenos shaders → SPIR-V …"
SHADER_FILES=( $(find "$SRC" -iname "*.xbx" -o -iname "*.xvs" -o -iname "*.xps" 2>/dev/null) )
if [[ ${#SHADER_FILES[@]} -eq 0 ]]; then
    warn "No shader blobs found — shaders will be translated at runtime (slow)"
else
    for shader in "${SHADER_FILES[@]}"; do
        base=$(basename "$shader" | sed 's/\.[^.]*$//')
        out_spv="$OUT/shaders_spv/${base}.spv"
        if [[ ! -f "$out_spv" ]]; then
            rexglue shader translate "$shader" -o "$out_spv" \
                && info "  compiled: $base.spv" \
                || warn "  failed: $shader (will fall back to runtime translate)"
        fi
    done
fi

# ── 5. Validate manifest ──────────────────────────────────────────────────────
info "Validating output manifest …"
python3 "$(dirname "$0")/validate_manifest.py" "$OUT" "$TITLE_ID"

info "Done!  Copy $OUT/ to sdmc:/keflings/game/ on your Switch SD card."
info "Also copy release/keflings.toml to sdmc:/keflings/keflings.toml"
