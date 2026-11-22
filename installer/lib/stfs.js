// SPDX-License-Identifier: GPL-3.0-or-later
// Minimal STFS (Xbox 360 LIVE/PIRS/CON) header reader.
// Only reads the unencrypted metadata header; does NOT attempt to extract files.
// Used by the installer to identify DLC packages by their display name.

'use strict';

function u32be(buf, off) {
    return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}

/**
 * Returns true if the first bytes look like an STFS container
 * (magic LIVE, PIRS, or CON\x00).
 * @param {Uint8Array} buf
 */
export function isStfsMagic(buf) {
    if (buf.length < 4) return false;
    // LIVE = 0x4C495645
    if (buf[0]===0x4C && buf[1]===0x49 && buf[2]===0x56 && buf[3]===0x45) return true;
    // PIRS = 0x50495253
    if (buf[0]===0x50 && buf[1]===0x49 && buf[2]===0x52 && buf[3]===0x53) return true;
    // CON  = 0x434F4E00
    if (buf[0]===0x43 && buf[1]===0x4F && buf[2]===0x4E) return true;
    return false;
}

/**
 * Read the display name and other metadata from an STFS header.
 * Requires at least 0x519 bytes (header fields go up to 0x411 + 128 = 0x491).
 *
 * Layout (big-endian throughout):
 *   0x000  magic (4 bytes)
 *   0x344  content_type (4 bytes)
 *   0x360  title_id (4 bytes)
 *   0x411  display_name (128 bytes, UTF-16BE, 64 code-units, null-terminated)
 *
 * @param {Uint8Array} buf — first 0x600 bytes of the STFS container
 * @returns {{ titleId: string, contentType: number, displayName: string }|null}
 */
export function readStfsHeader(buf) {
    if (!isStfsMagic(buf)) return null;
    if (buf.length < 0x491) return null;

    const titleId     = u32be(buf, 0x360).toString(16).toUpperCase().padStart(8, '0');
    const contentType = u32be(buf, 0x344);

    // display_name is UTF-16BE (Xbox 360 is big-endian)
    let displayName = '';
    for (let i = 0; i < 64; i++) {
        const off  = 0x411 + i * 2;
        const code = (buf[off] << 8) | buf[off + 1];
        if (code === 0) break;
        displayName += String.fromCharCode(code);
    }

    return { titleId, contentType, displayName: displayName.trim() };
}

// Content type constants
export const CT_MARKETPLACE = 0x00000002; // DLC / marketplace content
export const CT_INSTALLED   = 0x000D0000; // installed game
export const CT_SAVEGAME    = 0x00000001;
