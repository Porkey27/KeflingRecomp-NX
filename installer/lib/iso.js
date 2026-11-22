// SPDX-License-Identifier: GPL-3.0-or-later
// XDVDFS (Xbox Game Disc Format) reader.
// Reads an XISO image file and returns a flat list of file descriptors.

'use strict';

const SECTOR_SIZE   = 2048;
const MAGIC         = 'MICROSOFT*XBOX*MEDIA';
const VD_SECTOR     = 32;                    // volume descriptor at sector 32
const VD_OFFSET     = VD_SECTOR * SECTOR_SIZE; // = 0x10000

function readU16LE(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function readU32LE(buf, off) {
    return ((buf[off]) | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
}

async function readIsoBytes(file, offset, length) {
    if (offset + length > file.size) length = Math.max(0, file.size - offset);
    if (length <= 0) return new Uint8Array(0);
    return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}

async function findVolumeDescriptor(file) {
    // Try the standard location first (sector 32)
    const buf = await readIsoBytes(file, VD_OFFSET, 20);
    const magic = String.fromCharCode(...buf);
    if (magic === MAGIC) return VD_OFFSET;

    // Some tools add a 32-sector security zone at the front
    const alt = VD_OFFSET + 32 * SECTOR_SIZE;
    const buf2 = await readIsoBytes(file, alt, 20);
    const magic2 = String.fromCharCode(...buf2);
    if (magic2 === MAGIC) return alt;

    throw new Error(
        `Not a valid XDVDFS image — magic not found (got: ${JSON.stringify(magic)}). ` +
        `Make sure you selected an .iso ripped in XDVDFS format, not an STFS container. ` +
        `To use an STFS container, extract it first with Horizon or Xbox Backup Creator.`
    );
}

/**
 * Walk one XDVDFS directory table.
 * dwordIdx is the entry index (multiply by 4 for byte offset within tableData).
 */
async function walkDir(file, tableData, dwordIdx, prefix, out) {
    if (dwordIdx === 0xFFFF) return;
    const byteOff = dwordIdx * 4;
    if (byteOff + 14 > tableData.length) return;

    const left    = readU16LE(tableData, byteOff);
    const right   = readU16LE(tableData, byteOff + 2);
    const sector  = readU32LE(tableData, byteOff + 4);
    const size    = readU32LE(tableData, byteOff + 8);
    const attrs   = tableData[byteOff + 12];
    const nameLen = tableData[byteOff + 13];

    if (byteOff + 14 + nameLen > tableData.length) return;
    const name = new TextDecoder('ascii').decode(
        tableData.slice(byteOff + 14, byteOff + 14 + nameLen)
    );

    // In-order traversal: left → self → right
    if (left !== 0xFFFF) await walkDir(file, tableData, left, prefix, out);

    const path = prefix ? `${prefix}/${name}` : name;

    if (attrs & 0x10) {
        // Directory
        if (size > 0) {
            const roundedSize = ((size + SECTOR_SIZE - 1) & ~(SECTOR_SIZE - 1));
            const subData = await readIsoBytes(file, sector * SECTOR_SIZE, roundedSize);
            if (subData.length > 0) await walkDir(file, subData, 0, path, out);
        }
    } else {
        // File — capture sector/size for the read closure
        const s = sector, z = size;
        out.push({
            path,
            size:  z,
            read: (offset, length) => readIsoBytes(file, s * SECTOR_SIZE + offset, length),
        });
    }

    if (right !== 0xFFFF) await walkDir(file, tableData, right, prefix, out);
}

/**
 * List all files inside an XDVDFS .iso image.
 * Returns [ { path: string, size: number, read(offset, length): Promise<Uint8Array> } ]
 */
export async function listIsoFiles(file) {
    const vdOffset  = await findVolumeDescriptor(file);
    const vdData    = await readIsoBytes(file, vdOffset, SECTOR_SIZE);
    const rootSector = readU32LE(vdData, 20);
    const rootSize   = readU32LE(vdData, 24);

    if (rootSize === 0) throw new Error('XDVDFS root directory is empty');

    const roundedRoot = ((rootSize + SECTOR_SIZE - 1) & ~(SECTOR_SIZE - 1));
    const rootData    = await readIsoBytes(file, rootSector * SECTOR_SIZE, roundedRoot);

    const files = [];
    await walkDir(file, rootData, 0, '', files);
    return files;
}
