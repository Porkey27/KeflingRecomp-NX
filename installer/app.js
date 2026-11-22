// SPDX-License-Identifier: GPL-3.0-or-later
// KeflingRecomp-NX installer — main UI controller (SA2-NX style)

import { t, setLanguage, LANGS, applyStrings } from './lib/i18n.js';
import { identifyGame, identifyDlc, TITLE_ID }  from './lib/installer.js';

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
// Raw File objects are stored (structured-cloneable for postMessage to worker).
// FileDescriptors (with read()) are created on the fly for in-thread use.
let _rawGameFiles = null;   // { path: string, file: File }[]
let _dlcPacks     = [];     // { slug, name, raw: { path, file }[] }[]
let _identified   = false;
let _swReady      = false;
let _worker       = null;

// ── FileDescriptor from browser File ─────────────────────────────────────────
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

function rawFromInput(input) {
    return Array.from(input.files).map(f => ({
        path: f.webkitRelativePath || f.name,
        file: f,
    }));
}

// ── Language switcher ─────────────────────────────────────────────────────────
const FLAG_SVGS = {
    en: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">
           <rect width="60" height="40" fill="#012169"/>
           <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" stroke-width="8"/>
           <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" stroke-width="5"/>
           <path d="M30,0 V40 M0,20 H60" stroke="#fff" stroke-width="12"/>
           <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" stroke-width="8"/>
         </svg>`,
    es: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">
           <rect width="60" height="40" fill="#c60b1e"/>
           <rect y="10" width="60" height="20" fill="#ffc400"/>
         </svg>`,
    fr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">
           <rect width="20" height="40" fill="#002395"/>
           <rect x="20" width="20" height="40" fill="#fff"/>
           <rect x="40" width="20" height="40" fill="#ED2939"/>
         </svg>`,
    de: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">
           <rect width="60" height="40" fill="#000"/>
           <rect y="13.3" width="60" height="13.4" fill="#DD0000"/>
           <rect y="26.7" width="60" height="13.3" fill="#FFCE00"/>
         </svg>`,
    ja: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">
           <rect width="60" height="40" fill="#fff"/>
           <circle cx="30" cy="20" r="12" fill="#BC002D"/>
         </svg>`,
};

function buildLangSwitcher() {
    const nav = $('languages');
    if (!nav) return;
    nav.innerHTML = '';
    const current = t.__lang ?? 'en';
    for (const [code, label] of Object.entries(LANGS)) {
        const btn = document.createElement('button');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.setAttribute('aria-pressed', code === current ? 'true' : 'false');
        btn.innerHTML = FLAG_SVGS[code] ?? `<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#555"/></svg>`;
        btn.addEventListener('click', () => {
            setLanguage(code);
            applyStrings();
            buildLangSwitcher();
        });
        nav.appendChild(btn);
    }
}

// ── Detected box ──────────────────────────────────────────────────────────────
function showDetected(good, status, detail, fingerprint) {
    const box = $('detected');
    if (!box) return;
    box.hidden = false;
    box.classList.toggle('good', good);
    box.classList.toggle('bad',  !good);
    const st = $('det-status');
    const dt = $('det-detail');
    const fp = $('det-fingerprint');
    if (st) st.textContent = status;
    if (dt) dt.textContent = detail;
    if (fp) {
        if (fingerprint) { fp.textContent = fingerprint; fp.hidden = false; }
        else { fp.hidden = true; }
    }
}

function hideDetected() {
    const box = $('detected');
    if (box) { box.hidden = true; box.className = 'detected'; }
}

// ── Game file pickers ─────────────────────────────────────────────────────────
function setupGamePickers() {
    const pkg    = $('package');
    const folder = $('folder');
    if (!pkg && !folder) return;

    async function handleFiles(rawFiles) {
        if (!rawFiles.length) return;
        _rawGameFiles = rawFiles;
        _identified   = false;
        $('create').disabled = true;
        $('update').disabled = true;
        hideDetected();
        clearLog();

        const names   = rawFiles.map(r => r.path.split('/').pop()).join(', ');
        const chosen  = $('chosen');
        if (chosen) chosen.textContent = names.length > 60 ? names.slice(0, 57) + '…' : names;

        log(t('status_reading'));
        try {
            const fds  = rawFiles.map(makeDescriptor);
            const info = await identifyGame(fds);
            _identified = true;
            showDetected(
                true,
                t('status_identified'),
                info.displayName ?? 'A World of Keflings',
                `Title ID: ${info.titleId ?? TITLE_ID}`
            );
            $('create').disabled = false;
            $('update').disabled = false;
            log(t('status_identified'));
        } catch (err) {
            const msg = err.code ? (t(err.code) || err.message) : err.message;
            showDetected(false, t('err_identify'), msg);
            log('✗ ' + msg);
        }
    }

    if (pkg) {
        pkg.addEventListener('change', () => {
            if (!pkg.files?.length) return;
            handleFiles(rawFromInput(pkg));
            pkg.value = '';
        });
    }
    if (folder) {
        folder.addEventListener('change', () => {
            if (!folder.files?.length) return;
            handleFiles(rawFromInput(folder));
            folder.value = '';
        });
    }
}

// ── DLC pickers ───────────────────────────────────────────────────────────────
function setupDlcPickers() {
    const pkg    = $('dlc-package');
    const folder = $('dlc-folder');

    async function addDlcFiles(rawFiles) {
        if (!rawFiles.length) return;
        log(t('dlc_reading'));
        try {
            const fds  = rawFiles.map(makeDescriptor);
            const info = await identifyDlc(fds);
            if (_dlcPacks.find(p => p.slug === info.slug)) {
                log(`⚠ ${info.name} already added`);
                return;
            }
            _dlcPacks.push({ slug: info.slug, name: info.name, raw: rawFiles });
            renderDlcList();
            log(`✓ DLC: ${info.name}`);
        } catch (err) {
            const msg = err.code ? (t(err.code) || err.message) : err.message;
            log('✗ DLC: ' + msg);
        }
    }

    if (pkg) {
        pkg.addEventListener('change', () => {
            if (!pkg.files?.length) return;
            addDlcFiles(rawFromInput(pkg));
            pkg.value = '';
        });
    }
    if (folder) {
        folder.addEventListener('change', () => {
            if (!folder.files?.length) return;
            addDlcFiles(rawFromInput(folder));
            folder.value = '';
        });
    }
}

function renderDlcList() {
    const container = $('dlc-packs');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < _dlcPacks.length; i++) {
        const pack = _dlcPacks[i];
        const row = document.createElement('div');
        row.className = 'dlc-pack good';
        row.innerHTML = `
          <div style="flex:1">
            <div class="dlc-name">${escHtml(pack.name)}</div>
            <div class="dlc-sub">${escHtml(pack.slug)}</div>
          </div>
          <button class="remove" aria-label="Remove">✕</button>`;
        row.querySelector('.remove').addEventListener('click', () => {
            _dlcPacks.splice(i, 1);
            renderDlcList();
        });
        container.appendChild(row);
    }
}

// ── Progress / log ────────────────────────────────────────────────────────────
function setProgress(ratio, show = true) {
    const bar = $('bar');
    if (!bar) return;
    bar.hidden  = !show;
    bar.value   = Math.min(1, Math.max(0, ratio));
}

function log(msg, error = false) {
    const el = $('log');
    if (!el) return;
    const line = document.createElement('div');
    if (error) line.className = 'error';
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
}

function clearLog() {
    const el = $('log');
    if (el) el.innerHTML = '';
}

// ── Service Worker ────────────────────────────────────────────────────────────
async function ensureSW() {
    if (_swReady) return true;
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    _swReady = true;
    return true;
}

function triggerDownload(filename, totalSize) {
    return new Promise((resolve, reject) => {
        const sw = navigator.serviceWorker.controller;
        if (!sw) { reject(new Error('no SW controller')); return; }
        const ch = new MessageChannel();
        ch.port1.onmessage = e => { if (e.data.type === 'READY') resolve(ch.port2); };
        sw.postMessage({ type: 'PREPARE_DOWNLOAD', filename, totalSize, port: ch.port1 }, [ch.port1]);
        const a = Object.assign(document.createElement('a'), {
            href: './keflings-download-stream',
            download: filename,
            style: 'display:none',
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
}

// ── Build ─────────────────────────────────────────────────────────────────────
async function startBuild(onlyUpdate) {
    if (!_identified || !_rawGameFiles) return;

    const btnCreate = $('create');
    const btnUpdate = $('update');
    if (btnCreate) btnCreate.disabled = true;
    if (btnUpdate) btnUpdate.disabled = true;

    if (!await ensureSW()) {
        log('✗ Service workers required. Use Chrome or Firefox.', true);
        if (btnCreate) btnCreate.disabled = false;
        if (btnUpdate) btnUpdate.disabled = false;
        return;
    }

    clearLog();
    setProgress(0, true);
    if (_worker) { _worker.terminate(); _worker = null; }

    _worker = new Worker('./worker.js', { type: 'module' });

    _worker.onmessage = async e => {
        const { type } = e.data;
        if (type === 'log')      log(e.data.msg);
        if (type === 'progress') setProgress(e.data.ratio);
        if (type === 'error') {
            log('✗ ' + e.data.msg, true);
            setProgress(0, false);
            if (btnCreate) btnCreate.disabled = false;
            if (btnUpdate) btnUpdate.disabled = false;
        }
        if (type === 'size') {
            try {
                const filename = onlyUpdate ? 'keflings-nx-update.zip' : 'keflings-nx.zip';
                const port2 = await triggerDownload(filename, e.data.bytes);
                _worker.postMessage({ type: 'sw_port', port: port2 }, [port2]);
                log(`→ Streaming ${e.data.human}…`);
            } catch (err) {
                log('✗ Download setup failed: ' + err.message, true);
            }
        }
        if (type === 'done') {
            setProgress(1);
            log('✓ ' + t('status_done'));
            if (btnCreate) btnCreate.disabled = false;
            if (btnUpdate) btnUpdate.disabled = false;
        }
    };

    _worker.onerror = err => {
        log('✗ Worker: ' + err.message, true);
        setProgress(0, false);
        if (btnCreate) btnCreate.disabled = false;
        if (btnUpdate) btnUpdate.disabled = false;
    };

    // Pass raw File objects (structured-cloneable); worker wraps them into FDs.
    _worker.postMessage({
        source:     { kind: 'files', raw: _rawGameFiles },
        dlcSources: _dlcPacks.map(p => ({ slug: p.slug, name: p.name, raw: p.raw })),
        onlyUpdate,
    });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    buildLangSwitcher();
    applyStrings();
    setupGamePickers();
    setupDlcPickers();

    const btnCreate = $('create');
    const btnUpdate = $('update');
    if (btnCreate) btnCreate.addEventListener('click', () => startBuild(false));
    if (btnUpdate) btnUpdate.addEventListener('click', () => startBuild(true));

    ensureSW().catch(() => {});
});
