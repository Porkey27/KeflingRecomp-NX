// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

export const LANGUAGES = { en: 'English', es: 'Español' };

export const STRINGS = {
    en: {
        title:            'A World of Keflings — NX Installer',
        subtitle:         'Build your Switch package from your own copy of the game.',
        step1_title:      'Step 1 — Select your game files',
        step1_body:       'Choose the folder that contains <code>default.xex</code> and the <code>media/</code> directory. This is your extracted XBLA content — use Horizon or Xbox Backup Creator to extract from your console.',
        step2_title:      'Step 2 — Identify & verify',
        step2_body:       'The installer reads the XEX header to confirm this is the correct game and version.',
        step3_title:      'Step 3 — Build & download',
        step3_body:       'Your browser builds the ZIP locally — your game files never leave your computer.',
        btn_select_folder:'Select game folder',
        btn_select_iso:   'Select ISO / XISO',
        btn_build:        'Build package',
        btn_update:       'Update NRO only',
        label_or:         'or',
        status_idle:      'Waiting for files…',
        status_reading:   'Reading files…',
        status_identified:'Game identified.',
        status_building:  'Building package…',
        status_done:      'Download ready!',
        err_no_xex:       'Could not find default.xex. Make sure you selected the correct folder.',
        err_wrong_title:  'This does not appear to be A World of Keflings (title ID mismatch).',
        err_no_manifest:  'Could not load the release manifest. Check your internet connection.',
        err_no_build:     'No compatible release found for this XEX version.',
        err_stfs:         'This looks like an STFS container. Please extract your game files first using Horizon or Xbox Backup Creator, then select the extracted folder.',
        err_no_media:     'The <code>media/</code> directory is missing. Please make sure you have the full game folder.',
        warn_incomplete:  'Some files appear to be missing — the package may not work correctly.',
        info_hash:        'XEX hash: ',
        info_version:     'Build version: ',
        info_size:        'Package size: ',
    },
    es: {
        title:            'A World of Keflings — Instalador NX',
        subtitle:         'Crea tu paquete para Switch a partir de tu propia copia del juego.',
        step1_title:      'Paso 1 — Selecciona los archivos del juego',
        step1_body:       'Elige la carpeta que contiene <code>default.xex</code> y el directorio <code>media/</code>. Este es tu contenido XBLA extraído — usa Horizon o Xbox Backup Creator para extraerlo de tu consola.',
        step2_title:      'Paso 2 — Identificar y verificar',
        step2_body:       'El instalador lee la cabecera XEX para confirmar que este es el juego y la versión correctos.',
        step3_title:      'Paso 3 — Compilar y descargar',
        step3_body:       'Tu navegador construye el ZIP localmente — los archivos del juego nunca salen de tu ordenador.',
        btn_select_folder:'Seleccionar carpeta del juego',
        btn_select_iso:   'Seleccionar ISO / XISO',
        btn_build:        'Construir paquete',
        btn_update:       'Actualizar solo el NRO',
        label_or:         'o',
        status_idle:      'Esperando archivos…',
        status_reading:   'Leyendo archivos…',
        status_identified:'Juego identificado.',
        status_building:  'Construyendo paquete…',
        status_done:      '¡Descarga lista!',
        err_no_xex:       'No se encontró default.xex. Asegúrate de haber seleccionado la carpeta correcta.',
        err_wrong_title:  'Esto no parece ser A World of Keflings (el ID de título no coincide).',
        err_no_manifest:  'No se pudo cargar el manifiesto de versiones. Comprueba tu conexión a internet.',
        err_no_build:     'No se encontró ninguna versión compatible para esta versión de XEX.',
        err_stfs:         'Esto parece un contenedor STFS. Por favor extrae los archivos primero usando Horizon o Xbox Backup Creator, luego selecciona la carpeta extraída.',
        err_no_media:     'Falta el directorio <code>media/</code>. Asegúrate de tener la carpeta completa del juego.',
        warn_incomplete:  'Parece que faltan algunos archivos — es posible que el paquete no funcione correctamente.',
        info_hash:        'Hash XEX: ',
        info_version:     'Versión de compilación: ',
        info_size:        'Tamaño del paquete: ',
    },
};

let _lang = 'en';
export function setLanguage(lang) { if (STRINGS[lang]) _lang = lang; }
export function t(key) { return STRINGS[_lang][key] ?? STRINGS.en[key] ?? key; }

export function formatBytes(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
