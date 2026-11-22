// SPDX-License-Identifier: GPL-3.0-or-later
// Service Worker — streams the ZIP download to the browser.
// The main thread posts a MessageChannel port; we receive zip chunks on that
// port and pipe them through a ReadableStream so the browser shows a native
// "Save As" dialog with a correct Content-Length.

'use strict';

const CACHE_NAME  = 'keflings-installer-v1';
const STREAM_PATH = '/keflings-download-stream';

// ── Install / Activate ────────────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// ── Pending download state ────────────────────────────────────────────────────
// { controller, totalSize, filename }  — only one download at a time
let pending = null;

// ── Message from main thread ──────────────────────────────────────────────────
self.addEventListener('message', e => {
    if (e.data?.type !== 'PREPARE_DOWNLOAD') return;

    const { filename, totalSize, port } = e.data;

    let _controller = null;
    const stream = new ReadableStream({
        start(c) { _controller = c; },
        cancel()  { port.postMessage({ type: 'CANCEL' }); },
    });

    pending = { stream, filename, totalSize };

    // Wire up the MessagePort → ReadableStream
    port.onmessage = msg => {
        if (!_controller) return;
        const { type, chunk } = msg.data;
        if (type === 'CHUNK') {
            _controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        } else if (type === 'DONE') {
            _controller.close();
            pending = null;
        } else if (type === 'ERROR') {
            _controller.error(new Error(msg.data.message ?? 'stream error'));
            pending = null;
        }
    };

    port.postMessage({ type: 'READY' });
});

// ── Intercept the trigger fetch ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname !== STREAM_PATH) return;

    if (!pending) {
        e.respondWith(new Response('no pending download', { status: 503 }));
        return;
    }

    const { stream, filename, totalSize } = pending;
    const headers = new Headers({
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(totalSize),
    });

    e.respondWith(new Response(stream, { headers }));
});
