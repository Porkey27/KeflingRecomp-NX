// SPDX-License-Identifier: GPL-3.0-or-later
// Web Worker — runs in the background thread.
// Receives a build request from app.js, identifies the game, downloads the NRO,
// builds the ZIP via createPackage(), and streams chunks back through a
// MessageChannel port wired to the Service Worker.

'use strict';

import { listIsoFiles }                             from './lib/iso.js';
import { identifyGame, rootAtExecutable, programPath, createPackage, TITLE_ID } from './lib/installer.js';
import { formatBytes }                              from './lib/i18n.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg)          { self.postMessage({ type: 'log',      msg }); }
function progress(ratio)   { self.postMessage({ type: 'progress', ratio }); }
function error(msg, code)  { self.postMessage({ type: 'error',    msg, code }); }
function done()            { self.postMessage({ type: 'done' }); }

async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r.text();
}
async function fetchBytes(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return new Uint8Array(await r.arrayBuffer());
}
async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r.json();
}

// ── Build from folder FileSystemEntry list ────────────────────────────────────
function wrapEntry(entry, fullPath) {
    // entry is a FileSystemFileEntry
    return {
        path: fullPath,
        get size() { return this._size ?? 0; },
        read(offset, length) {
            return new Promise((res, rej) => {
                entry.file(file => {
                    this._size = file.size;
                    const slice = file.slice(offset, offset + length);
                    slice.arrayBuffer().then(ab => res(new Uint8Array(ab))).catch(rej);
                }, rej);
            });
        },
    };
}

async function collectEntries(dirEntry, prefix) {
    const results = [];
    await new Promise((res, rej) => {
        const reader = dirEntry.createReader();
        function readBatch() {
            reader.readEntries(async entries => {
                if (!entries.length) return res();
                for (const e of entries) {
                    const path = prefix ? `${prefix}/${e.name}` : e.name;
                    if (e.isDirectory) {
                        const sub = await collectEntries(e, path);
                        results.push(...sub);
                    } else {
                        results.push(wrapEntry(e, path));
                    }
                }
                readBatch();
            }, rej);
        }
        readBatch();
    });
    return results;
}

// ── Main message handler ──────────────────────────────────────────────────────
self.onmessage = async e => {
    const { source, onlyUpdate, swPort } = e.data;

    // swPort is the MessagePort end that feeds the Service Worker stream
    function sinkChunk(chunk) { swPort.postMessage({ type: 'CHUNK', chunk }, [chunk.buffer]); }
    function sinkDone()       { swPort.postMessage({ type: 'DONE' }); }
    function sinkError(msg)   { swPort.postMessage({ type: 'ERROR', message: msg }); }

    try {
        // ── Load manifest ─────────────────────────────────────────────────────
        log('Loading release manifest…');
        let manifest;
        try {
            manifest = await fetchJSON('release/manifest.json');
        } catch {
            error('Could not load the release manifest. Check your internet connection.', 'no_manifest');
            sinkError('manifest load failed');
            return;
        }

        // ── Collect file descriptors ──────────────────────────────────────────
        log('Reading game files…');
        self.postMessage({ type: 'status', key: 'status_reading' });

        let rawFiles;
        if (source.kind === 'iso') {
            rawFiles = await listIsoFiles(source.file);
        } else {
            // source.kind === 'folder', source.entries is Array<FileSystemEntry>
            rawFiles = [];
            for (const entry of source.entries) {
                if (entry.isDirectory) {
                    const sub = await collectEntries(entry, entry.name);
                    rawFiles.push(...sub);
                } else {
                    rawFiles.push(wrapEntry(entry, entry.name));
                }
            }
        }

        // Size-resolve folder entries (need a file() call)
        for (const f of rawFiles) {
            if (f._size === undefined) {
                await new Promise(res => {
                    // trigger a small read to populate _size
                    f.read(0, 1).then(() => res()).catch(() => res());
                });
            }
        }

        const files = rootAtExecutable(rawFiles);

        // ── Identify game ─────────────────────────────────────────────────────
        log('Identifying game…');
        let identity;
        try {
            identity = await identifyGame(files, manifest);
        } catch (err) {
            error(err.message ?? 'Failed to identify game.', err.code ?? 'identify');
            sinkError(err.message);
            return;
        }

        if (identity.titleId !== TITLE_ID) {
            error(`Title ID mismatch: got ${identity.titleId}, expected ${TITLE_ID}.`, 'wrong_title');
            sinkError('wrong title');
            return;
        }

        if (!identity.build) {
            error('No compatible release found for this XEX version.', 'no_build');
            sinkError('no build');
            return;
        }

        const { build, xexHash, complete } = identity;
        self.postMessage({ type: 'identified', xexHash, version: build.version, complete });

        if (!complete && !onlyUpdate) {
            // warn but continue — user may still want to try
            log('Warning: some game files appear to be missing.');
        }

        // ── Fetch NRO ─────────────────────────────────────────────────────────
        log(`Downloading ${build.version} NRO…`);
        const nroData = await fetchBytes(programPath(build));

        // ── Fetch toml + licenses ─────────────────────────────────────────────
        log('Fetching config and licenses…');
        const [tomlText, licenses] = await Promise.all([
            fetchText('release/keflings.toml'),
            fetchText('release/LICENSES.txt'),
        ]);

        // ── Create package, streaming via SW port ─────────────────────────────
        log('Building ZIP…');
        self.postMessage({ type: 'status', key: 'status_building' });

        await createPackage(
            files, nroData, tomlText, licenses, onlyUpdate,
            {
                log(msg)      { log(msg); },
                progress(r)   { progress(r); },
                size(bytes)   {
                    self.postMessage({ type: 'size', bytes, human: formatBytes(bytes) });
                },
            },
            async chunk => sinkChunk(chunk),
        );

        sinkDone();
        self.postMessage({ type: 'status', key: 'status_done' });
        done();

    } catch (err) {
        const msg = err?.message ?? String(err);
        log(`Error: ${msg}`);
        error(msg, 'unexpected');
        sinkError(msg);
    }
};
