// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

export const LANGS = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
};

// ── String tables ─────────────────────────────────────────────────────────────
const STRINGS = {
    en: {
        title: 'keflings-nx installer',

        // Header
        lead: 'Builds the <strong>Nintendo Switch</strong> package of <strong>A World of Keflings</strong> from your own <strong>Xbox 360</strong> copy (Xbox Live Arcade). Everything runs in <strong>this browser</strong>.',

        // Step 1
        step1:        '1. Choose your game',
        formatPackage:'Package file',
        formatFolder: 'Extracted folder',
        ownCopy:      'Requires a legally-owned copy of <em>A World of Keflings</em> (Xbox Live Arcade, Title ID <code>584109DB</code>).',
        formatHint:   'Pick the <strong>STFS package file</strong> (from your Xbox 360 hard drive via JRPC2 / Horizon) <em>or</em> an <strong>extracted folder</strong> containing <code>default.xex</code>.',

        // Detection
        status_reading:   'Reading…',
        status_identified:'Game identified ✓',
        err_identify:     'Not recognised',

        // Error keys (thrown by installer.js)
        wrong_title_id:    'Title ID mismatch — this is not A World of Keflings.',
        no_xex:            'No default.xex found. Select the extracted game folder.',
        no_stfs_and_no_xex:'Could not find the game — try the extracted folder instead.',
        dlc_unrecognised:  'DLC not recognised (no STFS header or default.xex).',

        // DLC section
        dlcTitle:     'DLC',
        dlcBody:      'Optionally include the DLC packs: <em>It Came From Outer Space</em>, <em>Sugar, Spice and Not So Nice</em>, and <em>The Curse of the Zombiesaurus</em>. Add each as a Package file or extracted folder.',
        dlcPackageBtn:'Package file(s)',
        dlcFolderBtn: 'Extracted folder',
        dlc_reading:  'Identifying DLC…',

        // Step 2
        step2:        '2. Create the package',
        step2First:   'First install — includes game data, NRO, and config:',
        step2Update:  'Already installed — NRO update only:',
        create:       'Create keflings-nx.zip',
        createUpdate: 'Create keflings-nx-update.zip',

        // Step 3
        step3:        '3. Copy it to the Switch',
        step3Extract: 'Extract the ZIP to the <strong>root of your SD card</strong>.',
        step3Start:   'Launch <strong>keflings-nx</strong> from the Homebrew Menu or Album applet.',
        step3First:   'On first launch, any included DLC is installed automatically.',

        // Build / done
        status_done:  'Download complete!',

        // Footer
        sourceCode: 'Source code on GitHub',
        signature:  'a Porkey27 project',
        legal:      'This installer runs entirely in your browser. Your game files are never uploaded anywhere. Requires a legally-owned copy of <em>A World of Keflings</em> (Xbox Live Arcade). Nintendo Switch is a trademark of Nintendo. Xbox is a trademark of Microsoft. This project is not affiliated with either company.',
    },

    es: {
        title: 'instalador keflings-nx',
        lead:  'Crea el paquete de <strong>Nintendo Switch</strong> de <strong>A World of Keflings</strong> a partir de tu propia copia de <strong>Xbox 360</strong> (Xbox Live Arcade). Todo se ejecuta en <strong>este navegador</strong>.',

        step1:        '1. Elige tu juego',
        formatPackage:'Archivo de paquete',
        formatFolder: 'Carpeta extraída',
        ownCopy:      'Requiere una copia de <em>A World of Keflings</em> (Xbox Live Arcade, ID <code>584109DB</code>).',
        formatHint:   'Elige el <strong>archivo STFS</strong> (de tu Xbox 360 con JRPC2/Horizon) <em>o</em> una <strong>carpeta extraída</strong> con <code>default.xex</code>.',

        status_reading:   'Leyendo…',
        status_identified:'Juego identificado ✓',
        err_identify:     'No reconocido',

        wrong_title_id:    'ID de título incorrecto — este no es A World of Keflings.',
        no_xex:            'No se encontró default.xex. Selecciona la carpeta extraída.',
        no_stfs_and_no_xex:'No se encontró el juego — prueba con la carpeta extraída.',
        dlc_unrecognised:  'DLC no reconocido.',

        dlcTitle:     'DLC',
        dlcBody:      'Incluye opcionalmente los DLC: <em>It Came From Outer Space</em>, <em>Sugar, Spice and Not So Nice</em> y <em>The Curse of the Zombiesaurus</em>.',
        dlcPackageBtn:'Archivo(s) de paquete',
        dlcFolderBtn: 'Carpeta extraída',
        dlc_reading:  'Identificando DLC…',

        step2:        '2. Crear el paquete',
        step2First:   'Primera instalación — incluye datos del juego, NRO y config:',
        step2Update:  'Ya instalado — solo actualizar el NRO:',
        create:       'Crear keflings-nx.zip',
        createUpdate: 'Crear keflings-nx-update.zip',

        step3:        '3. Copiarlo a la Switch',
        step3Extract: 'Extrae el ZIP en la <strong>raíz de tu tarjeta SD</strong>.',
        step3Start:   'Lanza <strong>keflings-nx</strong> desde el Homebrew Menu.',
        step3First:   'En el primer inicio, el DLC incluido se instala automáticamente.',

        status_done:  '¡Descarga completa!',

        sourceCode: 'Código fuente en GitHub',
        signature:  'un proyecto de Porkey27',
        legal:      'Este instalador se ejecuta por completo en tu navegador. Los archivos del juego nunca se envían a ningún servidor. Requiere una copia de <em>A World of Keflings</em> (Xbox Live Arcade). Nintendo Switch es marca registrada de Nintendo. Xbox es marca registrada de Microsoft. Este proyecto no tiene ninguna afiliación con ninguna de las dos empresas.',
    },

    fr: {
        title: 'installateur keflings-nx',
        lead:  'Crée le paquet <strong>Nintendo Switch</strong> de <strong>A World of Keflings</strong> à partir de votre propre copie <strong>Xbox 360</strong> (Xbox Live Arcade). Tout s\'exécute dans <strong>ce navigateur</strong>.',

        step1:        '1. Choisissez votre jeu',
        formatPackage:'Fichier paquet',
        formatFolder: 'Dossier extrait',
        ownCopy:      'Nécessite une copie légale de <em>A World of Keflings</em> (Xbox Live Arcade, ID <code>584109DB</code>).',
        formatHint:   'Choisissez le <strong>fichier STFS</strong> ou un <strong>dossier extrait</strong> contenant <code>default.xex</code>.',

        status_reading:   'Lecture…',
        status_identified:'Jeu identifié ✓',
        err_identify:     'Non reconnu',

        wrong_title_id:    'ID de titre incorrect.',
        no_xex:            'default.xex introuvable.',
        no_stfs_and_no_xex:'Jeu introuvable — essayez le dossier extrait.',
        dlc_unrecognised:  'DLC non reconnu.',

        dlcTitle:     'DLC',
        dlcBody:      'Ajoutez en option les DLC : <em>It Came From Outer Space</em>, <em>Sugar, Spice and Not So Nice</em>, <em>The Curse of the Zombiesaurus</em>.',
        dlcPackageBtn:'Fichier(s) paquet',
        dlcFolderBtn: 'Dossier extrait',
        dlc_reading:  'Identification du DLC…',

        step2:        '2. Créer le paquet',
        step2First:   'Première installation :',
        step2Update:  'Mise à jour NRO uniquement :',
        create:       'Créer keflings-nx.zip',
        createUpdate: 'Créer keflings-nx-update.zip',

        step3:        '3. Copier sur la Switch',
        step3Extract: 'Extrayez le ZIP à la <strong>racine de votre carte SD</strong>.',
        step3Start:   'Lancez <strong>keflings-nx</strong> depuis le Homebrew Menu.',
        step3First:   'Au premier démarrage, les DLC inclus sont installés automatiquement.',

        status_done:  'Téléchargement terminé !',
        sourceCode:   'Code source sur GitHub',
        signature:    'un projet Porkey27',
        legal:        'Cet installateur s\'exécute entièrement dans votre navigateur. Vos fichiers de jeu ne sont jamais envoyés. Nécessite une copie légale de <em>A World of Keflings</em>.',
    },

    de: {
        title: 'keflings-nx Installer',
        lead:  'Erstellt das <strong>Nintendo Switch</strong>-Paket von <strong>A World of Keflings</strong> aus deiner eigenen <strong>Xbox 360</strong>-Kopie (Xbox Live Arcade). Alles läuft in <strong>diesem Browser</strong>.',

        step1:        '1. Wähle dein Spiel',
        formatPackage:'Paketdatei',
        formatFolder: 'Extrahierter Ordner',
        ownCopy:      'Benötigt eine rechtmäßige Kopie von <em>A World of Keflings</em> (Xbox Live Arcade, ID <code>584109DB</code>).',
        formatHint:   'Wähle die <strong>STFS-Paketdatei</strong> oder einen <strong>extrahierten Ordner</strong> mit <code>default.xex</code>.',

        status_reading:   'Lesen…',
        status_identified:'Spiel erkannt ✓',
        err_identify:     'Nicht erkannt',

        wrong_title_id:    'Falsche Titel-ID.',
        no_xex:            'default.xex nicht gefunden.',
        no_stfs_and_no_xex:'Spiel nicht gefunden.',
        dlc_unrecognised:  'DLC nicht erkannt.',

        dlcTitle:     'DLC',
        dlcBody:      'Optional DLC hinzufügen: <em>It Came From Outer Space</em>, <em>Sugar, Spice and Not So Nice</em>, <em>The Curse of the Zombiesaurus</em>.',
        dlcPackageBtn:'Paketdatei(en)',
        dlcFolderBtn: 'Extrahierter Ordner',
        dlc_reading:  'DLC wird identifiziert…',

        step2:        '2. Paket erstellen',
        step2First:   'Erstinstallation:',
        step2Update:  'Nur NRO aktualisieren:',
        create:       'keflings-nx.zip erstellen',
        createUpdate: 'keflings-nx-update.zip erstellen',

        step3:        '3. Auf die Switch kopieren',
        step3Extract: 'ZIP in das <strong>Stammverzeichnis der SD-Karte</strong> entpacken.',
        step3Start:   '<strong>keflings-nx</strong> vom Homebrew-Menü starten.',
        step3First:   'Beim ersten Start wird das enthaltene DLC automatisch installiert.',

        status_done:  'Download abgeschlossen!',
        sourceCode:   'Quellcode auf GitHub',
        signature:    'ein Porkey27-Projekt',
        legal:        'Dieser Installer läuft vollständig in deinem Browser. Deine Spieldateien werden nie hochgeladen.',
    },

    ja: {
        title: 'keflings-nx インストーラー',
        lead:  '<strong>Nintendo Switch</strong>向け <strong>A World of Keflings</strong> パッケージを、あなたが所有する <strong>Xbox 360</strong> (Xbox Live Arcade) のコピーから作成します。すべて<strong>このブラウザ</strong>で実行されます。',

        step1:        '1. ゲームを選択',
        formatPackage:'パッケージファイル',
        formatFolder: '展開済みフォルダ',
        ownCopy:      '<em>A World of Keflings</em> (Xbox Live Arcade、タイトルID <code>584109DB</code>) の正規コピーが必要です。',
        formatHint:   '<strong>STFSパッケージファイル</strong>または <code>default.xex</code> を含む<strong>展開済みフォルダ</strong>を選択してください。',

        status_reading:   '読み込み中…',
        status_identified:'ゲームを確認 ✓',
        err_identify:     '認識できません',

        wrong_title_id:    'タイトルIDが一致しません。',
        no_xex:            'default.xexが見つかりません。',
        no_stfs_and_no_xex:'ゲームが見つかりません。',
        dlc_unrecognised:  'DLCを認識できません。',

        dlcTitle:     'DLC',
        dlcBody:      'DLCを追加できます: <em>It Came From Outer Space</em>、<em>Sugar, Spice and Not So Nice</em>、<em>The Curse of the Zombiesaurus</em>。',
        dlcPackageBtn:'パッケージファイル',
        dlcFolderBtn: '展開済みフォルダ',
        dlc_reading:  'DLCを識別中…',

        step2:        '2. パッケージを作成',
        step2First:   '初回インストール:',
        step2Update:  'NROのみ更新:',
        create:       'keflings-nx.zipを作成',
        createUpdate: 'keflings-nx-update.zipを作成',

        step3:        '3. Switchにコピー',
        step3Extract: 'ZIPを<strong>SDカードのルート</strong>に展開してください。',
        step3Start:   'ホームブリューメニューから <strong>keflings-nx</strong> を起動してください。',
        step3First:   '初回起動時にDLCが自動的にインストールされます。',

        status_done:  'ダウンロード完了！',
        sourceCode:   'GitHubのソースコード',
        signature:    'Porkey27 プロジェクト',
        legal:        'このインストーラーはすべてブラウザ内で動作します。ゲームファイルは一切アップロードされません。',
    },
};

// ── Runtime ───────────────────────────────────────────────────────────────────
let _lang = 'en';

export function setLanguage(lang) {
    if (STRINGS[lang]) { _lang = lang; t.__lang = lang; }
}

export function t(key) {
    return STRINGS[_lang]?.[key] ?? STRINGS.en[key] ?? key;
}
t.__lang = 'en';

/** Apply data-i18n (textContent) and data-i18n-html (innerHTML) to the DOM. */
export function applyStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.title = t('title');
    document.documentElement.lang = _lang;
}

export function formatBytes(b) {
    if (b < 1024)        return `${b} B`;
    if (b < 1024 ** 2)   return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3)   return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
