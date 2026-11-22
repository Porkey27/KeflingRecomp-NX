// SPDX-License-Identifier: GPL-3.0-or-later
// Streaming ZIP64 writer (store/no-compression).
// Uses data descriptors so CRC32 is computed while streaming rather than upfront.

'use strict';

// ── CRC-32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c >>> 0;
    }
    return t;
})();

function crc32Update(crc, data) {
    crc ^= 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++)
        crc = (CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function dv(buf) { return new DataView(buf.buffer ?? buf); }

function u16le(n) { const b = new Uint8Array(2); dv(b).setUint16(0, n, true); return b; }
function u32le(n) { const b = new Uint8Array(4); dv(b).setUint32(0, n >>> 0, true); return b; }
function u64le(n) {
    const b = new Uint8Array(8);
    dv(b).setBigUint64(0, BigInt(n), true);
    return b;
}
function concat(...chunks) {
    const len = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

// ── Size calculator (no I/O) ──────────────────────────────────────────────────
// Compute total zip size without streaming.  Used to tell the SW how big the
// download will be so it can set Content-Length.
export function estimateZipSize(entries) {
    // entries: [ { name: string, size: number } ]
    const ENC = new TextEncoder();
    let total = 0n;
    const cdEntries = [];

    for (const { name, size } of entries) {
        const nb = ENC.encode(name);
        // local file header
        total += BigInt(30 + nb.length + 20);   // 20 = ZIP64 extra
        total += BigInt(size);
        total += BigInt(24);                     // data descriptor
        cdEntries.push(nb);
    }
    // central directory
    for (const nb of cdEntries) total += BigInt(46 + nb.length + 28); // 28 = ZIP64 extra
    total += BigInt(56); // ZIP64 EOCD
    total += BigInt(20); // ZIP64 locator
    total += BigInt(22); // EOCD
    return total;
}

// ── Streaming ZIP writer ───────────────────────────────────────────────────────
export class ZipWriter {
    /** @param {(chunk: Uint8Array) => Promise<void>} sink */
    constructor(sink) {
        this._sink   = sink;
        this._offset = 0n;
        this._cd     = []; // central directory records
    }

    async _write(chunk) {
        await this._sink(chunk);
        this._offset += BigInt(chunk.length);
    }

    /**
     * Add a file to the ZIP.
     * @param {string} name  — ZIP path (use '/' separators)
     * @param {number} size  — exact byte count
     * @param {() => AsyncIterable<Uint8Array>} readChunks
     */
    async addFile(name, size, readChunks) {
        const nb = new TextEncoder().encode(name);
        const localOffset = this._offset;

        // ── ZIP64 extra for local header ──────────────────────────────────────
        const lhExtra = concat(
            u16le(0x0001),         // ZIP64 tag
            u16le(16),             // data size (2 × uint64)
            u64le(size),           // uncompressed size
            u64le(size),           // compressed size
        );

        // ── Local file header ─────────────────────────────────────────────────
        // Flags: 0x0808 = data-descriptor (bit 3) + UTF-8 filename (bit 11)
        const lh = concat(
            u32le(0x04034b50),    // sig
            u16le(45),            // version needed (4.5 = ZIP64)
            u16le(0x0808),        // flags
            u16le(0),             // compression: store
            u16le(0), u16le(0),   // mod time, mod date
            u32le(0),             // CRC32 placeholder
            u32le(0xFFFFFFFF),    // compressed size  → ZIP64
            u32le(0xFFFFFFFF),    // uncompressed size → ZIP64
            u16le(nb.length),
            u16le(lhExtra.length),
            nb,
            lhExtra,
        );
        await this._write(lh);

        // ── File data ─────────────────────────────────────────────────────────
        let crc    = 0;
        let written = 0n;
        for await (const chunk of readChunks()) {
            crc = crc32Update(crc, chunk);
            written += BigInt(chunk.length);
            await this._write(chunk);
        }

        // ── Data descriptor ───────────────────────────────────────────────────
        const dd = concat(
            u32le(0x08074b50), // sig
            u32le(crc),        // CRC32
            u64le(written),    // compressed size (ZIP64)
            u64le(written),    // uncompressed size (ZIP64)
        );
        await this._write(dd);

        // ── Record for central directory ──────────────────────────────────────
        this._cd.push({ nb, crc, size: written, offset: localOffset });
    }

    /** Flush central directory and EOCD.  Call after all addFile() calls. */
    async finish() {
        const cdStart = this._offset;

        for (const { nb, crc, size, offset } of this._cd) {
            const cdExtra = concat(
                u16le(0x0001),   // ZIP64 tag
                u16le(24),       // 3 × uint64
                u64le(size),     // uncompressed
                u64le(size),     // compressed
                u64le(offset),   // local header offset
            );
            const cde = concat(
                u32le(0x02014b50),  // sig
                u16le(0x031e),      // version made by: Unix / ZIP 3.0
                u16le(45),          // version needed
                u16le(0x0800),      // UTF-8 flag
                u16le(0),           // compression
                u16le(0), u16le(0), // mod time, date
                u32le(crc),
                u32le(0xFFFFFFFF),  // compressed → ZIP64
                u32le(0xFFFFFFFF),  // uncompressed → ZIP64
                u16le(nb.length),
                u16le(cdExtra.length),
                u16le(0),           // comment
                u16le(0xFFFF),      // disk start → ZIP64
                u16le(0),           // internal attrs
                u32le(0),           // external attrs
                u32le(0xFFFFFFFF),  // local offset → ZIP64
                nb,
                cdExtra,
            );
            await this._write(cde);
        }

        const cdSize  = this._offset - cdStart;
        const count   = BigInt(this._cd.length);

        // ZIP64 end of central directory record
        const zip64eocd = concat(
            u32le(0x06064b50),  // sig
            u64le(44),          // size of this record minus 12
            u16le(0x031e),      // version made by
            u16le(45),          // version needed
            u32le(0),           // this disk
            u32le(0),           // CD start disk
            u64le(count),       // entries on this disk
            u64le(count),       // total entries
            u64le(cdSize),      // size of CD
            u64le(cdStart),     // offset of CD
        );
        await this._write(zip64eocd);

        // ZIP64 locator
        const zip64loc = concat(
            u32le(0x07064b50),
            u32le(0),
            u64le(this._offset - BigInt(56)),
            u32le(1),
        );
        await this._write(zip64loc);

        // End of central directory
        const eocd = concat(
            u32le(0x06054b50),
            u16le(0xFFFF), u16le(0xFFFF),  // disk numbers → ZIP64
            u16le(0xFFFF), u16le(0xFFFF),  // entry counts → ZIP64
            u32le(0xFFFFFFFF),              // CD size → ZIP64
            u32le(0xFFFFFFFF),              // CD offset → ZIP64
            u16le(0),                       // comment
        );
        await this._write(eocd);
    }
}
