// SPDX-License-Identifier: GPL-3.0-or-later
// Web Worker — runs in the background thread.
// Receives a build request from app.js (raw File objects, not FileDescriptors),
// wraps them, identifies the game, downloads the NRO, builds the ZIP, and
// streams chunks back via a MessageChannel port wired to the Service Worker.

'use strict';

import { listIsoFiles }                from './lib/iso.js';
import {
    identifyGame, identifyDlc,
    rootAtExecutable, programPath,
    createPackage, TITLE_ID,
} from './lib/installer.js';
import { formatBytes }                 from './lib/i18n.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg)        { self.postMessage({ type: 'log',      msg }); }
function progress(ratio) { self.postMessage({ type: 'progress', ratio }); }
function error(msg, code){ self.postMessage({ type: 'error',    msg, code }); }
function done()          { self.postMessage({ type: 'done' }); }

async function fetchText(url)  {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
    return r.text();
}
async function fetchBytes(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
    return new Uint8Array(await r.arrayBuffer());
}
async function fetchJSON(url)  {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
    return r.json();
}

// ── FileDescriptor from raw { path, file } object ─────────────────────────────
function makeDescriptor({ path, file }) {
    return {
        path,
        size: file.size,
        read(offset, length) {
            return file.slice(offset, offset + length)
                       .arrayBuffer().then(ab => new Uint8Array(ab));
        },
    };
}

// ── SW port — provided in a second message after the main thread knows size ───
let _swPort = null;
const _swPortWaiters = [];

function waitForSwPort() {
    if (_swPort) return Promise.resolve(_swPort);
    return new Promise(res => _swPortWaiters.push(res));
}

function sinkChunk(chunk) { _swPort.postMessage({ type: 'CHUNK', chunk }, [chunk.buffer]); }
function sinkDone()       { _swPort.postMessage({ type: 'DONE' }); }
function sinkError(msg)   { _swPort?.postMessage({ type: 'ERROR', message: msg }); }

// ── Main message handler ──────────────────────────────────────────────────────
self.onmessage = async e => {
    const { type } = e.data;

    // Phase 2: main thread sends us the SW port after learning the ZIP size
    if (type === 'sw_port') {
        _swPort = e.data.port;
        for (const res of _swPortWaiters) res(_swPort);
        _swPortWaiters.length = 0;
        return;
    }

    // Phase 1: build request
    const { source, dlcSources, onlyUpdate } = e.data;

    try {
        // ── Load manifest ─────────────────────────────────────────────────────
        log('Loading release manifest…');
        let manifest;
        try {
            manifest = await fetchJSON('release/manifest.json');
        } catch (err) {
            error(`Could not load release manifest: ${err.message}`, 'no_manifest');
            return;
        }

        // ── Build game file descriptors ───────────────────────────────────────
        log('Reading game files…');
        let rawFiles;
        if (source.kind === 'iso') {
            rawFiles = await listIsoFiles(source.file);
        } else {
            // source.kind === 'files', source.raw = { path, file }[]
            rawFiles = source.raw.map(makeDescriptor);
        }
        const files = rootAtExecutable(rawFiles);

        // ── Build DLC descriptors ─────────────────────────────────────────────
        const dlcPacks = [];
        for (const dlcSrc of (dlcSources ?? [])) {
            const dlcRaw = dlcSrc.raw.map(makeDescriptor);
            const dlcFiles = rootAtExecutable(dlcRaw);
            try {
                // If slug/name already resolved by app.js, use them; else re-identify
                const pack = dlcSrc.slug
                    ? { slug: dlcSrc.slug, name: dlcSrc.name, files: dlcFiles }
                    : await identifyDlc(dlcFiles);
                dlcPacks.push(pack);
                log(`DLC: ${pack.name}`);
                self.postMessage({ type: 'dlc_identified', name: pack.name, slug: pack.slug });
            } catch (err) {
                log(`DLC warning: ${err.message} — skipping`);
            }
        }

        // ── Identify game ─────────────────────────────────────────────────────
        log('Identifying game…');
        let identity;
        try {
            identity = await identifyGame(files, manifest);
        } catch (err) {
            error(err.message ?? 'Failed to identify game.', err.code ?? 'identify');
            return;
        }

        if (!identity.build) {
            error(
                `No compatible release found for XEX hash ${identity.xexHash ?? '(STFS source)'}.\n` +
                'If you used a Package file, try an extracted folder instead.',
                'no_build'
            );
            return;
        }

        const { build, xexHash, complete } = identity;
        self.postMessage({ type: 'identified', xexHash, version: build.version, complete });

        if (!complete && !onlyUpdate) {
            log('⚠ Some game files appear to be missing — continuing anyway.');
        }

        // ── Fetch NRO & assets ────────────────────────────────────────────────
        log(`Downloading NRO (${build.version})…`);
        const nroData = await fetchBytes(programPath(build));

        log('Fetching config and licenses…');
        const [tomlText, licenses] = await Promise.all([
            fetchText('release/keflings.toml'),
            fetchText('release/LICENSES.txt'),
        ]);

        // ── Compute size, then wait for SW port ───────────────────────────────
        log('Building ZIP…');
        self.postMessage({ type: 'status', key: 'status_building' });

        // createPackage calls reportSize() which triggers app.js to set up the
        // download stream and send us the sw_port in a second message.
        // We await waitForSwPort() inside the sink to defer streaming until ready.
        let _sizeReported = false;

        await createPackage(
            files, dlcPacks, nroData, tomlText, licenses, onlyUpdate,
            {
                log(msg)    { log(msg); },
                progress(r) { progress(r); },
                size(bytes) {
                    _sizeReported = true;
                    self.postMessage({ type: 'size', bytes, human: formatBytes(bytes) });
                },
            },
            async chunk => {
                // Block until app.js sends the SW port
                if (!_swPort) await waitForSwPort();
                sinkChunk(chunk);
            },
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
