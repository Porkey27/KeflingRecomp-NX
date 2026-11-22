// SPDX-License-Identifier: GPL-3.0-or-later
// Core installer logic for KeflingRecomp-NX.
// Identifies the game and any DLC, normalises file paths, and builds the SD-card ZIP.

'use strict';

import { ZipWriter, estimateZipSize } from './zip.js';
import { isStfsMagic, readStfsHeader } from './stfs.js';

// Confirmed from STFS container headers extracted from actual game HDD dump.
// All DLC packages share the base game's title_id (standard Xbox 360 DLC layout).
export const TITLE_ID = '584109DB'; // A World of Keflings (Xbox 360 XBLA)

// Known DLC display names (from STFS header, UTF-16BE) → slug/name.
// Keyed by STFS display_name because all DLC packages share TITLE_ID with the base game.
export const DLC_IDS = {
    'It Came From Outer Space':     { name: 'It Came From Outer Space',      slug: 'it_came_from_outer_space'      }, // confirmed
    'Sugar, Spice and Not So Nice': { name: 'Sugar, Spice and Not So Nice',  slug: 'sugar_spice_and_not_so_nice'   }, // confirmed
    'The Curse of the Zombiesaurus':{ name: 'The Curse of the Zombiesaurus', slug: 'curse_of_the_zombiesaurus'      }, // unconfirmed name
};

const CHUNK = 16 * 1024 * 1024; // 16 MiB streaming chunks

// ── SHA-256 ───────────────────────────────────────────────────────────────────
export async function sha256(data) {
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function sha256File(fileEntry) {
    const chunks = [];
    let offset = 0;
    while (offset < fileEntry.size) {
        const len  = Math.min(CHUNK, fileEntry.size - offset);
        const data = await fileEntry.read(offset, len);
        chunks.push(data);
        offset += len;
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    return sha256(merged);
}

// ── XEX2 title-ID reader ──────────────────────────────────────────────────────
function readU32BE(buf, off) {
    return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}

export async function readTitleId(fileEntry) {
    const buf = await fileEntry.read(0, 4096);
    if (buf.length < 24) return null;
    const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    if (magic !== 'XEX2') return null;
    const headerCount = readU32BE(buf, 20);
    if (headerCount > 256) return null;
    for (let i = 0; i < headerCount; i++) {
        const off = 24 + i * 8;
        if (off + 8 > buf.length) break;
        const key = readU32BE(buf, off);
        if (key === 0x00040006) {
            const blockOffset = readU32BE(buf, off + 4);
            if (blockOffset + 16 <= buf.length) {
                return readU32BE(buf, blockOffset + 12).toString(16).toUpperCase().padStart(8, '0');
            }
            if (blockOffset + 16 <= fileEntry.size) {
                const extra = await fileEntry.read(blockOffset, 16);
                return readU32BE(extra, 12).toString(16).toUpperCase().padStart(8, '0');
            }
        }
    }
    return null;
}

// ── File filtering ────────────────────────────────────────────────────────────
export function isGameFile(path) {
    const lower = path.toLowerCase();
    if (lower.startsWith('$systemupdate/')) return false;
    if (lower.startsWith('$'))             return false;
    if (lower.endsWith('.xthumbnail'))     return false;
    if (lower.endsWith('.xbx'))            return false;
    return true;
}

// ── Path normalisation ────────────────────────────────────────────────────────
export function rootAtExecutable(files) {
    let minDepth = Infinity, prefix = '';
    for (const f of files) {
        const lower = f.path.toLowerCase();
        if (lower.endsWith('default.xex') || lower.endsWith('/default.xex')) {
            const depth = (f.path.match(/\//g) || []).length;
            if (depth < minDepth) {
                minDepth = depth;
                prefix   = f.path.slice(0, f.path.toLowerCase().lastIndexOf('default.xex'));
            }
        }
    }
    if (!prefix) return files;
    return files.map(f => ({
        ...f,
        path: f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path,
    }));
}

// ── Game identification ───────────────────────────────────────────────────────
/**
 * Identify game from either STFS container file(s) or extracted folder.
 * Pass manifest to also match a specific build (optional).
 *
 * @param {Array<{path,size,read}>} files
 * @param {object|null}             manifest  optional build manifest
 * @returns {{ titleId, displayName, xexHash?, build?, complete }}
 */
export async function identifyGame(files, manifest = null) {
    // ── Strategy 1: STFS container ────────────────────────────────────────────
    for (const f of files) {
        const headerBytes = await f.read(0, Math.min(0x600, f.size));
        if (!isStfsMagic(headerBytes)) continue;
        const hdr = readStfsHeader(headerBytes);
        if (!hdr) continue;
        // Validate title ID
        if (hdr.titleId !== TITLE_ID) {
            const err = new Error(`Wrong title ID: ${hdr.titleId} (expected ${TITLE_ID})`);
            err.code  = 'wrong_title_id';
            throw err;
        }
        return {
            titleId:     hdr.titleId,
            displayName: hdr.displayName || 'A World of Keflings',
            xexHash:     null,
            build:       null,
            complete:    true,
        };
    }

    // ── Strategy 2: extracted folder ─────────────────────────────────────────
    const normalised = rootAtExecutable(files);
    const xex = normalised.find(f => {
        const p = f.path.toLowerCase();
        return p === 'default.xex' || p.endsWith('/default.xex');
    });
    if (!xex) {
        const err = new Error('No STFS container or default.xex found');
        err.code  = 'no_stfs_and_no_xex';
        throw err;
    }

    const tasks = [readTitleId(xex)];
    if (manifest) tasks.push(sha256File(xex));
    const [titleId, xexHash] = await Promise.all(tasks);

    if (titleId && titleId !== TITLE_ID) {
        const err = new Error(`Wrong title ID: ${titleId} (expected ${TITLE_ID})`);
        err.code  = 'wrong_title_id';
        throw err;
    }

    const hasMedia = normalised.some(f => f.path.toLowerCase().startsWith('media/'));
    const builds   = manifest?.builds ?? [];
    const build    = xexHash ? (builds.find(b => b.xexHash === xexHash) ?? null) : null;

    return {
        titleId:     titleId ?? TITLE_ID,
        displayName: 'A World of Keflings',
        xexHash:     xexHash ?? null,
        build,
        complete:    hasMedia,
    };
}

// ── DLC identification ────────────────────────────────────────────────────────
/**
 * Identify one DLC source (STFS container file or extracted folder).
 *
 * Strategy:
 *  1. Look for a file with STFS magic (LIVE/PIRS/CON).
 *     Read its display_name from the metadata header and match to DLC_IDS.
 *  2. Fallback: look for default.xex with XEX2 title ID (extracted folder layout).
 *
 * @param {Array<{path,size,read}>} files
 * @returns {{ titleId: string, slug: string, name: string, files: Array }}
 */
export async function identifyDlc(files) {
    // ── Strategy 1: STFS container ────────────────────────────────────────────
    for (const f of files) {
        // Read just the first 0x600 bytes to check header
        const headerBytes = await f.read(0, Math.min(0x600, f.size));
        if (!isStfsMagic(headerBytes)) continue;

        const hdr = readStfsHeader(headerBytes);
        if (!hdr) continue;

        const info = DLC_IDS[hdr.displayName];
        return {
            titleId: hdr.titleId,
            slug:    info?.slug ?? `dlc_${hdr.displayName.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}`,
            name:    info?.name ?? hdr.displayName,
            files,
        };
    }

    // ── Strategy 2: extracted folder with default.xex ─────────────────────────
    const xex = files.find(f => f.path.toLowerCase() === 'default.xex'
                              || f.path.toLowerCase().endsWith('/default.xex'));
    if (xex) {
        const titleId = await readTitleId(xex);
        // For extracted DLC the title_id equals the base game — use path as fallback label
        const folderName = files[0]?.path.split('/')[0] ?? 'dlc';
        return {
            titleId: titleId ?? 'unknown',
            slug:    `dlc_${folderName.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}`,
            name:    folderName,
            files,
        };
    }

    const err = new Error('Could not identify DLC: no STFS header or default.xex found');
    err.code  = 'dlc_unrecognised';
    throw err;
}

// ── Download URL for the NRO ──────────────────────────────────────────────────
export function programPath(build) {
    return `release/programs/${build.nroHash}.nro`;
}

// ── Package builder ───────────────────────────────────────────────────────────
/**
 * @param {Array}    gameFiles   — normalised game file descriptors
 * @param {Array}    dlcPacks    — array of { slug, name, files } from identifyDlc()
 * @param {Uint8Array} nroData
 * @param {string}   tomlText
 * @param {string}   licenses
 * @param {boolean}  onlyUpdate
 * @param {object}   callbacks  — { log, progress, size }
 * @param {Function} sink       — async (Uint8Array) => void
 */
export async function createPackage(gameFiles, dlcPacks, nroData, tomlText,
                                    licenses, onlyUpdate, callbacks, sink) {
    const { log, progress, size: reportSize } = callbacks;

    const enc           = new TextEncoder();
    const tomlBytes     = enc.encode(tomlText);
    const licensesBytes = enc.encode(licenses);

    const zipEntries = [
        { name: 'switch/keflings/keflings.nro', size: nroData.length },
        { name: 'keflings/keflings.toml',        size: tomlBytes.length },
        { name: 'keflings/LICENSES.txt',          size: licensesBytes.length },
    ];

    let gameFiltered = [];
    let dlcFiltered  = []; // [ { zipPath, fileEntry } ]

    if (!onlyUpdate) {
        gameFiltered = gameFiles.filter(f => isGameFile(f.path));
        for (const f of gameFiltered)
            zipEntries.push({ name: `keflings/game/${f.path}`, size: f.size });

        for (const pack of (dlcPacks ?? [])) {
            const packFiles = pack.files.filter(f => isGameFile(f.path));
            for (const f of packFiles) {
                const zipPath = `keflings/game/dlc/${pack.slug}/${f.path}`;
                dlcFiltered.push({ zipPath, fileEntry: f });
                zipEntries.push({ name: zipPath, size: f.size });
            }
        }
    }

    const totalSize = estimateZipSize(zipEntries);
    reportSize(totalSize);

    const zip   = new ZipWriter(sink);
    const total = zipEntries.length;
    let   done  = 0;

    async function* singleChunk(data) { yield data; }
    async function* chunkedFile(fe) {
        let offset = 0;
        while (offset < fe.size) {
            const len  = Math.min(CHUNK, fe.size - offset);
            const data = await fe.read(offset, len);
            offset += data.length;
            yield data;
        }
    }

    log('Writing NRO …');
    await zip.addFile('switch/keflings/keflings.nro', nroData.length, () => singleChunk(nroData));
    progress(++done / total);

    log('Writing keflings.toml …');
    await zip.addFile('keflings/keflings.toml', tomlBytes.length, () => singleChunk(tomlBytes));
    progress(++done / total);

    log('Writing LICENSES.txt …');
    await zip.addFile('keflings/LICENSES.txt', licensesBytes.length, () => singleChunk(licensesBytes));
    progress(++done / total);

    if (!onlyUpdate) {
        for (const f of gameFiltered) {
            log(`Packing game/${f.path} …`);
            await zip.addFile(`keflings/game/${f.path}`, f.size, () => chunkedFile(f));
            progress(++done / total);
        }
        for (const { zipPath, fileEntry: f } of dlcFiltered) {
            log(`Packing DLC: ${f.path} …`);
            await zip.addFile(zipPath, f.size, () => chunkedFile(f));
            progress(++done / total);
        }
    }

    await zip.finish();
    log('ZIP finalised.');
}
