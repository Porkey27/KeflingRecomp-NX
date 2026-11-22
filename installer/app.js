// SPDX-License-Identifier: GPL-3.0-or-later
// Main UI controller for the KeflingRecomp-NX installer.

'use strict';

import { t, setLanguage, LANGUAGES } from './lib/i18n.js';

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const qs = s  => document.querySelector(s);

// ── State ─────────────────────────────────────────────────────────────────────
let _source    = null;   // { kind: 'folder'|'iso', file?, entries? }
let _worker    = null;
let _swReady   = false;

// ── Service Worker registration ───────────────────────────────────────────────
async function ensureSW() {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    _swReady = true;
    return true;
}

// ── Localisation ──────────────────────────────────────────────────────────────
function applyStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        el.innerHTML = t(key);
    });
    document.title = t('title');
}

function buildLangSwitcher() {
    const wrap = $('lang-switcher');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const [code, label] of Object.entries(LANGUAGES)) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.dataset.lang = code;
        btn.addEventListener('click', () => {
            setLanguage(code);
            applyStrings();
            buildLangSwitcher();
        });
        wrap.appendChild(btn);
    }
}

// ── File picker — folder ──────────────────────────────────────────────────────
function setupFolderPicker() {
    const input = $('folder-input');
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('multiple', '');
    input.addEventListener('change', () => {
        if (!input.files?.length) return;
        // Convert FileList to descriptor array
        const entries = Array.from(input.files).map(file => ({
            isDirectory: false,
            isFile:      true,
            name:        file.name,
            file(cb)    { cb(file); },
        }));
        // Reconstruct paths from webkitRelativePath
        const fileDescriptors = Array.from(input.files).map(file => ({
            path: file.webkitRelativePath || file.name,
            size: file.size,
            read(offset, length) {
                const slice = file.slice(offset, offset + length);
                return slice.arrayBuffer().then(ab => new Uint8Array(ab));
            },
        }));
        _source = { kind: 'folder', fileDescriptors };
        setStatus('status_reading');
        startIdentify();
    });
}

// ── File picker — ISO ─────────────────────────────────────────────────────────
function setupIsoPicker() {
    const input = $('iso-input');
    if (!input) return;
    input.accept = '.iso,.xiso';
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        _source = { kind: 'iso', file };
        setStatus('status_reading');
        startIdentify();
    });
}

// ── Status / log display ──────────────────────────────────────────────────────
function setStatus(key) {
    const el = $('status-text');
    if (el) el.innerHTML = t(key);
}

function appendLog(msg) {
    const el = $('build-log');
    if (!el) return;
    const line = document.createElement('div');
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
}

function setProgress(ratio) {
    const bar = $('progress-bar');
    if (bar) bar.style.width = `${Math.min(1, ratio) * 100}%`;
}

function showError(msg) {
    const el = $('error-box');
    if (!el) return;
    el.innerHTML = msg;
    el.hidden = false;
}

function hideError() {
    const el = $('error-box');
    if (el) el.hidden = true;
}

function showInfo(xexHash, version, size) {
    const el = $('game-info');
    if (!el) return;
    el.hidden = false;
    const hEl = $('info-hash');
    const vEl = $('info-version');
    const sEl = $('info-size');
    if (hEl) hEl.textContent = t('info_hash') + xexHash.slice(0, 16) + '…';
    if (vEl) vEl.textContent = t('info_version') + version;
    if (sEl && size) sEl.textContent = t('info_size') + size;
}

// ── Identification (quick pre-check before full build) ────────────────────────
async function startIdentify() {
    // We do identification inside the worker to keep the UI thread free.
    // Show the build panel once the source is set.
    const buildPanel = $('build-panel');
    if (buildPanel) buildPanel.hidden = false;
    hideError();
    setProgress(0);
}

// ── Trigger the browser download via Service Worker ───────────────────────────
function triggerDownload(filename, totalSize) {
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const sw = navigator.serviceWorker.controller;
        if (!sw) { reject(new Error('no SW controller')); return; }

        channel.port1.onmessage = msg => {
            if (msg.data.type === 'READY') resolve(channel.port2);
        };

        sw.postMessage({
            type:      'PREPARE_DOWNLOAD',
            filename,
            totalSize,
            port:      channel.port1,
        }, [channel.port1]);

        // Create an invisible <a> and click it
        const a    = document.createElement('a');
        a.href     = './keflings-download-stream';
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
}

// ── Build ─────────────────────────────────────────────────────────────────────
async function startBuild(onlyUpdate) {
    if (!_source) return;
    if (!_swReady) {
        const ok = await ensureSW();
        if (!ok) {
            showError('Service workers are not supported in this browser. Please use Chrome or Firefox.');
            return;
        }
    }

    const buildBtn  = $('btn-build');
    const updateBtn = $('btn-update');
    if (buildBtn)  buildBtn.disabled  = true;
    if (updateBtn) updateBtn.disabled = true;

    hideError();
    setStatus('status_building');
    setProgress(0);
    const log = $('build-log');
    if (log) log.innerHTML = '';

    // Terminate any previous worker
    if (_worker) { _worker.terminate(); _worker = null; }

    _worker = new Worker('./worker.js', { type: 'module' });

    // Wire SW port
    const swChannel = new MessageChannel();
    // port1 → worker, port2 → SW (sent later)
    let swPort2 = null;

    _worker.onmessage = async msg => {
        const { type } = msg.data;

        if (type === 'log')      { appendLog(msg.data.msg); }
        if (type === 'progress') { setProgress(msg.data.ratio); }
        if (type === 'status')   { setStatus(msg.data.key); }
        if (type === 'error')    {
            showError(msg.data.msg);
            if (buildBtn)  buildBtn.disabled  = false;
            if (updateBtn) updateBtn.disabled = false;
        }
        if (type === 'size') {
            const { bytes, human } = msg.data;
            const sEl = $('info-size');
            if (sEl) sEl.textContent = t('info_size') + human;
            // Now we know the size — register the download stream with the SW
            try {
                swPort2 = await triggerDownload('keflings-nx.zip', bytes);
                // Forward swPort2 to the worker so it can send chunks
                _worker.postMessage({ type: 'sw_port', port: swPort2 }, [swPort2]);
            } catch (e) {
                showError(`Failed to set up download: ${e.message}`);
            }
        }
        if (type === 'identified') {
            const { xexHash, version, complete } = msg.data;
            showInfo(xexHash, version, null);
            if (!complete) appendLog('Warning: some files may be missing.');
        }
        if (type === 'done') {
            setProgress(1);
            setStatus('status_done');
            if (buildBtn)  buildBtn.disabled  = false;
            if (updateBtn) updateBtn.disabled = false;
        }
    };

    _worker.onerror = err => {
        showError(`Worker error: ${err.message}`);
        if (buildBtn)  buildBtn.disabled  = false;
        if (updateBtn) updateBtn.disabled = false;
    };

    // Source data to pass to the worker
    // For 'folder' source: pass fileDescriptors directly (they hold File refs)
    // For 'iso' source: pass the File object
    const workerSource = _source.kind === 'iso'
        ? { kind: 'iso', file: _source.file }
        : { kind: 'folder', fileDescriptors: _source.fileDescriptors };

    // We use a two-phase approach:
    //  1. Worker sends 'size' message → main thread sets up SW → sends port back
    //  2. Worker then streams chunks through that port
    // So we DON'T send swPort1 upfront; worker waits for 'sw_port' message.
    _worker.postMessage({ source: workerSource, onlyUpdate });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Language switcher
    buildLangSwitcher();
    applyStrings();

    // File pickers
    setupFolderPicker();
    setupIsoPicker();

    // Build buttons
    const buildBtn  = $('btn-build');
    const updateBtn = $('btn-update');
    if (buildBtn)  buildBtn.addEventListener('click',  () => startBuild(false));
    if (updateBtn) updateBtn.addEventListener('click',  () => startBuild(true));

    // Folder picker button (label click proxy)
    const folderBtn = $('btn-select-folder');
    if (folderBtn) {
        folderBtn.addEventListener('click', () => $('folder-input')?.click());
        folderBtn.innerHTML = t('btn_select_folder');
    }
    const isoBtn = $('btn-select-iso');
    if (isoBtn) {
        isoBtn.addEventListener('click', () => $('iso-input')?.click());
        isoBtn.innerHTML = t('btn_select_iso');
    }

    // Pre-register SW
    ensureSW().catch(() => {});
});
