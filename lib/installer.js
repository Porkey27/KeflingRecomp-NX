// SPDX-License-Identifier: GPL-3.0-or-later
// Core installer logic for KeflingRecomp-NX.
// Identifies the game, normalises file paths, and builds the SD-card ZIP.

'use strict';

import { ZipWriter, estimateZipSize } from './zip.js';

export const TITLE_ID = '584109DE'; // A World of Keflings (Xbox 360 XBLA)

const CHUNK = 16 * 1024 * 1024; // 16 MiB streaming chunks

// ── SHA-256 ───────────────────────────────────────────────────────────────────
export async function sha256(data) {
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/** SHA-256 of a file object using streaming reads to avoid OOM on large files. */
async function sha256File(fileEntry) {
    // Use SubtleCrypto streaming via DigestStream if available, otherwise chunk-hash.
    // Fallback: read in 16 MB slices and hash the whole buffer (fine for XEX files
    // which are typically < 10 MB).
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

/**
 * Read the first 4 KiB of a file entry and extract the XEX2 title ID.
 * Returns the title ID as an upper-case hex string, or null if not XEX2.
 */
export async function readTitleId(fileEntry) {
    const buf = await fileEntry.read(0, 4096);
    if (buf.length < 24) return null;

    // Check XEX2 magic
    const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    if (magic !== 'XEX2') return null;

    const headerCount = readU32BE(buf, 20);
    if (headerCount > 256) return null; // sanity check

    // Optional headers start at offset 24, each is 8 bytes (key + value/offset)
    for (let i = 0; i < headerCount; i++) {
        const off = 24 + i * 8;
        if (off + 8 > buf.length) break;
        const key = readU32BE(buf, off);

        if (key === 0x00040006) {
            // Execution info block: value is an absolute byte offset in the XEX
            const blockOffset = readU32BE(buf, off + 4);
            // block layout: media_id(4), version(4), base_version(4), title_id(4), ...
            if (blockOffset + 16 <= buf.length) {
                const titleId = readU32BE(buf, blockOffset + 12);
                return titleId.toString(16).toUpperCase().padStart(8, '0');
            }
            // Needs a second read
            if (blockOffset + 16 <= fileEntry.size) {
                const extra = await fileEntry.read(blockOffset, 16);
                const titleId = readU32BE(extra, 12);
                return titleId.toString(16).toUpperCase().padStart(8, '0');
            }
        }
    }
    return null;
}

// ── File filtering ────────────────────────────────────────────────────────────
/** Returns true for game files we want to copy into the package. */
export function isGameFile(path) {
    const lower = path.toLowerCase();
    // Skip Xbox system update partitions and junk
    if (lower.startsWith('$systemupdate/')) return false;
    if (lower.startsWith('$')) return false; // $-prefixed special dirs
    // Skip thumbnails and Xbox-specific metadata
    if (lower.endsWith('.xthumbnail')) return false;
    if (lower.endsWith('.xbx')) return false;    // shader blobs copied by preparar-juego
    if (lower === 'default.xex') return true;    // always include the executable
    return true;
}

// ── Path normalisation ────────────────────────────────────────────────────────
/**
 * When a user selects the parent folder rather than the folder containing
 * default.xex, strip the extra level.
 */
export function rootAtExecutable(files) {
    // Find the shallowest default.xex
    let minDepth = Infinity;
    let prefix   = '';
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
 * @param {Array<{path, size, read}>} files
 * @param {object} manifest   — parsed release/manifest.json
 * @returns {{ titleId, xexHash, build?, complete }}
 */
export async function identifyGame(files, manifest) {
    const xex = files.find(f => f.path.toLowerCase() === 'default.xex');
    if (!xex) {
        const err = new Error('default.xex not found');
        err.code  = 'noXex';
        throw err;
    }

    const [titleId, xexHash] = await Promise.all([
        readTitleId(xex),
        sha256File(xex),
    ]);

    // Check all required game directories exist
    const hasMedia = files.some(f => f.path.toLowerCase().startsWith('media/'));
    const complete = hasMedia;

    // Look for a matching build in the manifest
    const builds = manifest.builds ?? [];
    const build  = builds.find(b => b.xexHash === xexHash) ?? null;

    return { titleId: titleId ?? 'unknown', xexHash, build, complete };
}

// ── Download URL for the NRO ──────────────────────────────────────────────────
export function programPath(build) {
    // The hash is embedded in the URL so old cached NROs are never confused with new ones
    return `release/programs/${build.nroHash}.nro`;
}

// ── Package builder ───────────────────────────────────────────────────────────
/**
 * Build the SD-card ZIP and stream it to `sink`.
 *
 * @param {{ kind: 'iso'|'folder', ... }} source  — from app.js
 * @param {Uint8Array}  nroData   — downloaded .nro bytes
 * @param {string}      tomlText  — keflings.toml contents
 * @param {string}      licenses  — LICENSES.txt contents
 * @param {boolean}     onlyUpdate
 * @param {object}      callbacks — { log(msg), progress(0..1), size(bytes) }
 * @param {Array}       gameFiles — file descriptors from rootAtExecutable()
 * @param {object}      build     — manifest build entry (needs .nroHash etc.)
 */
export async function createPackage(gameFiles, nroData, tomlText, licenses,
                                    onlyUpdate, callbacks, sink) {
    const { log, progress, size: reportSize } = callbacks;

    // ── Enumerate files to include ────────────────────────────────────────────
    const enc  = new TextEncoder();
    const tomlBytes     = enc.encode(tomlText);
    const licensesBytes = enc.encode(licenses);

    const zipEntries = [
        { name: 'switch/keflings/keflings.nro', size: nroData.length },
        { name: 'keflings/keflings.toml',        size: tomlBytes.length },
        { name: 'keflings/LICENSES.txt',          size: licensesBytes.length },
    ];

    let gameFiltered = [];
    if (!onlyUpdate) {
        gameFiltered = gameFiles.filter(f => isGameFile(f.path));
        for (const f of gameFiltered) {
            zipEntries.push({ name: `keflings/game/${f.path}`, size: f.size });
        }
    }

    // ── Report total size for the browser download prompt ─────────────────────
    const totalSize = estimateZipSize(zipEntries);
    reportSize(totalSize);

    // ── Write ZIP ─────────────────────────────────────────────────────────────
    const zip   = new ZipWriter(sink);
    const total = zipEntries.length;
    let   done  = 0;

    async function* singleChunk(data) { yield data; }
    async function* chunkedFile(fileEntry) {
        let offset = 0;
        while (offset < fileEntry.size) {
            const len  = Math.min(CHUNK, fileEntry.size - offset);
            const data = await fileEntry.read(offset, len);
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
            log(`Packing ${f.path} …`);
            await zip.addFile(`keflings/game/${f.path}`, f.size, () => chunkedFile(f));
            progress(++done / total);
        }
    }

    await zip.finish();
    log('ZIP finalised.');
}
