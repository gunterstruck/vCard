document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration and Constants ---
    const SCOPE = '/vCard/';

    /**
     * Application configuration constants
     * All timing values are in milliseconds unless otherwise specified
     * All size values are in bytes unless otherwise specified
     */
    const CONFIG = {
        // NFC Operation Timeouts
        COOLDOWN_DURATION: 2000,              // ms - Cooldown period between NFC operations to prevent rapid re-triggering
        WRITE_SUCCESS_GRACE_PERIOD: 2500,     // ms - Grace period after successful write before allowing new operations
        WRITE_RETRY_DELAY: 200,               // ms - Delay between write retry attempts
        NFC_WRITE_TIMEOUT: 5000,              // ms - Maximum time to wait for NFC write operation

        // NFC Chip Capacities (in bytes)
        MAX_PAYLOAD_SIZE: 880,                // bytes - Maximum vCard payload size (legacy, for reference)
        NTAG215_CAPACITY: 504,                // bytes - NTAG215 NFC chip usable capacity
        NTAG216_CAPACITY: 888,                // bytes - NTAG216 NFC chip usable capacity

        // Retry Configuration
        MAX_WRITE_RETRIES: 3,                 // number - Maximum number of write attempts before giving up

        // UI/UX Timings
        DEBOUNCE_DELAY: 300,                  // ms - Input debounce delay for form fields
        URL_REVOKE_DELAY: 100,                // ms - Delay before revoking blob URLs after download

        // Data Limits
        MAX_LOG_ENTRIES: 15,                  // number - Maximum number of log entries to keep in memory
        MAX_FIELD_LENGTH: 500,                // chars - Maximum length for individual contact fields

        // Layout
        SAFETY_BUFFER_PX: 10,                 // px - Safety buffer for UI calculations
    };

    // --- Application State ---
    const appState = {
        translations: {},
        isNfcActionActive: false,
        isCooldownActive: false,
        abortController: null,
        scannedDataObject: null,
        eventLog: [],
        nfcTimeoutId: null,
        gracePeriodTimeoutId: null,
        deferredPrompt: null,
        blobUrls: new Set(), // Track all created blob URLs for cleanup
    };

    /**
     * Blob URL Manager - Prevents memory leaks by tracking and cleaning up blob URLs
     */
    const BlobUrlManager = {
        /**
         * Creates a blob URL and tracks it for later cleanup
         * @param {Blob} blob - The blob to create a URL for
         * @returns {string} The blob URL
         */
        create(blob) {
            const url = URL.createObjectURL(blob);
            appState.blobUrls.add(url);
            return url;
        },

        /**
         * Revokes a specific blob URL and removes it from tracking
         * @param {string} url - The blob URL to revoke
         */
        revoke(url) {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
                appState.blobUrls.delete(url);
            }
        },

        /**
         * Revokes all tracked blob URLs (useful for cleanup on page unload)
         */
        revokeAll() {
            appState.blobUrls.forEach(url => {
                URL.revokeObjectURL(url);
            });
            appState.blobUrls.clear();
            console.log('[BlobUrlManager] All blob URLs revoked');
        }
    };

    // Cleanup blob URLs on page unload
    window.addEventListener('beforeunload', () => {
        BlobUrlManager.revokeAll();
    });

    // --- Design Templates ---
    const designs = {
        'vcard_standard': { appName: "vCard NFC Writer", short_name: "vCard", theme: "dark", lockTheme: false, icons: { icon192: "/vCard/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png", icon512: "/vCard/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png" }, brandColors: { primary: "#f04e37", secondary: "#6c6b66" } },
        'peterpohl': { appName: "vCard NFC Writer", short_name: "vCard", theme: "customer-brand", lockTheme: false, icons: { icon192: "/vCard/assets/PP-192x192.png", icon512: "/vCard/assets/PP-512x512.png" }, brandColors: { primary: "#00457D", secondary: "#FFEC00" } },
        'sigx': { appName: "vCard NFC Writer", short_name: "vCard", theme: "customer-brand", lockTheme: false, icons: { icon192: "/vCard/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png", icon512: "/vCard/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png" }, brandColors: { primary: "#5865F2", secondary: "#3d3d3d" } },
        'vcard': { appName: "vCard NFC Writer", short_name: "vCard", theme: "customer-brand", lockTheme: false, icons: { icon192: "/vCard/assets/icon-192.png", icon512: "/vCard/assets/icon-512.png" }, brandColors: { primary: "#d54b2a", secondary: "#6C6B66" } }
    };

    // --- DOM Element References ---
    const headerElement = document.querySelector('header');
    const tabsContainer = document.querySelector('.tabs');
    const tabContents = document.querySelectorAll('.tab-content');
    const nfcStatusBadge = document.getElementById('nfc-status-badge');
    const copyToFormBtn = document.getElementById('copy-to-form-btn');
    const saveVcfBtn = document.getElementById('save-vcf-btn');
    const loadVcfInput = document.getElementById('load-vcf-input');
    const loadVcfLabel = document.getElementById('load-vcf-label');
    const importContactBtn = document.getElementById('import-contact-btn');
    const saveScannedBtn = document.getElementById('save-scanned-btn');
    const nfcFallback = document.getElementById('nfc-fallback');
    const messageBanner = document.getElementById('message-banner');
    const form = document.getElementById('nfc-write-form');
    const payloadOutput = document.getElementById('payload-output');
    const payloadSize = document.getElementById('payload-size');
    const readResultContainer = document.getElementById('read-result');
    const contactCard = document.getElementById('contact-card');
    const rawDataOutput = document.getElementById('raw-data-output');
    const readActions = document.getElementById('read-actions');
    const themeSwitcher = document.querySelector('.theme-switcher');
    const legalInfoContainer = document.getElementById('legal-info');
    const eventLogOutput = document.getElementById('event-log-output');
    const updateBanner = document.getElementById('update-banner');
    const reloadButton = document.getElementById('reload-button');
    const checkForUpdateBtn = document.getElementById('check-for-update-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    const installBtn = document.getElementById('install-btn');

    // --- Utility Functions ---
    const debounce = (func, wait) => { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func.apply(this, args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // --- Internationalization (i18n) ---
    function t(key, options = {}) { let text = key.split('.').reduce((obj, i) => obj?.[i], appState.translations); if (!text) { console.warn(`Translation not found for key: ${key}`); return key; } if (options.replace) { for (const [placeholder, value] of Object.entries(options.replace)) { text = text.replace(`{${placeholder}}`, value); } } return text; }
    async function loadTranslations() { const lang = navigator.language.split('-')[0]; const supportedLangs = ['de', 'en', 'es', 'fr']; const selectedLang = supportedLangs.includes(lang) ? lang : 'de'; const path = `/vCard/lang/${selectedLang}.json`; try { const response = await fetch(path); if (!response.ok) throw new Error(`Language file for ${selectedLang} not found at ${path}`); appState.translations = await response.json(); document.documentElement.lang = selectedLang; } catch (error) { console.error('Could not load translations, falling back to German.', error); try { const fallbackPath = `/vCard/lang/de.json`; const response = await fetch(fallbackPath); appState.translations = await response.json(); document.documentElement.lang = 'de'; } catch (fallbackError) { console.error('Could not load fallback German translations.', fallbackError); } } }
    function applyTranslations() { document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); }); document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); }); document.title = t('appTitle'); }

    // --- Error Handling ---
    class ErrorHandler {
        static handle(error, context = 'General') {
            const readableError = this.getReadableError(error);
            console.error(`[${context}]`, error);
            showMessage(readableError, 'err');
            addLogEntry(`${context}: ${readableError}`, 'err');
            return readableError;
        }

        static getReadableError(error) {
            const errorMap = {
                'NotAllowedError': 'errors.NotAllowedError',
                'NotSupportedError': 'errors.NotSupportedError',
                'NotFoundError': 'errors.NotFoundError',
                'NotReadableError': 'errors.NotReadableError',
                'NetworkError': 'errors.NetworkError',
                'AbortError': 'errors.AbortError',
                'TimeoutError': 'errors.WriteTimeoutError'
            };

            if (errorMap[error.name]) {
                return t(errorMap[error.name]);
            }
            return error.message || t('errors.unknown');
        }

        static initGlobalHandlers() {
            window.addEventListener('error', (event) => {
                console.error('[Global Error]', event.error);
                if (event.error) {
                    ErrorHandler.handle(event.error, 'UncaughtError');
                }
                event.preventDefault();
            });

            window.addEventListener('unhandledrejection', (event) => {
                console.error('[Unhandled Promise Rejection]', event.reason);
                const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
                ErrorHandler.handle(error, 'UnhandledPromise');
                event.preventDefault();
            });
        }
    }

    // --- Seasonal Greeting ---
    /**
     * Zeigt einen saisonalen Splash-Screen an (01.12. - 24.12.)
     * Mit verzögertem "Weiter"-Button.
     * @param {Object} data - Das dekodierte Kontakt-Objekt (für den Namen des Absenders)
     */
    function showSeasonalGreeting(data) {
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-basiert (11 = Dezember)
        const currentDay = now.getDate();

        // Logik: Nur im Dezember (11) zwischen dem 1. und 24.
        const isChristmasTime = (currentMonth === 11 && currentDay >= 1 && currentDay <= 24);

        // const isChristmasTime = true; // Zum Testen einkommentieren

        if (!isChristmasTime) return;

        // Haupt-Container ausblenden
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.classList.add('hidden');

        // HTML erstellen
        const splash = document.createElement('div');
        splash.id = 'seasonal-splash';

        splash.innerHTML = `
            <div class="seasonal-content">
                <div class="seasonal-title">🎄 Liebe Weihnachtsgrüße 🎄</div>

                <div class="seasonal-message">
                    Wir wünschen eine schöne Weihnachtszeit<br>
                    und einen guten Rutsch ins neue Jahr! ✨
                    <br><br>
                    <div style="margin-top: 1.5rem; font-style: italic;">
                    
                    </div>
                </div>

                <button id="splash-continue-btn" class="splash-btn">
                    Weiter zu den Kontaktdaten ➔
                </button>
            </div>
        `;

        document.body.appendChild(splash);

        // Animiertes Lametta / Schnee - direkt an body anhängen, damit sie im Vordergrund bleiben
        const symbols = ['❄', '❅', '❆', '✨', '⭐'];
        for (let i = 0; i < 60; i++) {
            const flake = document.createElement('div');
            flake.className = 'snowflake';
            flake.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            flake.style.left = Math.random() * 100 + 'vw';
            flake.style.animationDuration = (Math.random() * 3 + 2) + 's';
            flake.style.opacity = Math.random();
            flake.style.fontSize = (Math.random() * 20 + 10) + 'px';
            document.body.appendChild(flake); // An body anhängen, nicht an splash
        }

        // Button verzögert einblenden
        setTimeout(() => {
            const btn = document.getElementById('splash-continue-btn');
            if (btn) {
                btn.classList.add('visible');
            }
        }, 4500);

        // Schließen und wiederherstellen
        const closeSplash = () => {
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.remove();
                if (mainContainer) {
                    mainContainer.classList.remove('hidden');
                    window.scrollTo(0, 0);
                }
            }, 800);
        };

        const btn = document.getElementById('splash-continue-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeSplash();
            });
        }
    }

    // --- App Initialization ---
    async function loadConfig() { try { const response = await fetch('/vCard/config.json'); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); return await response.json(); } catch (error) { console.warn('Config load failed, using default.', error); return { design: "default" }; } }

    async function main() {
        ErrorHandler.initGlobalHandlers();

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/vCard/sw.js', { scope: '/vCard/' })
                    .then(registration => {
                        console.log('Service Worker registered:', registration.scope);
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    updateBanner.classList.remove('hidden');
                                }
                            });
                        });
                    })
                    .catch(err => ErrorHandler.handle(err, 'ServiceWorkerRegistration'));

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                     window.location.reload();
                });
            });
        }

        // Handle PWA installation prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[App] beforeinstallprompt event fired');
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Store the event so it can be triggered later
            appState.deferredPrompt = e;
            // Show install button
            if (installBtn) {
                installBtn.classList.remove('hidden');
            }
        });

        // Handle successful installation
        window.addEventListener('appinstalled', () => {
            console.log('[App] PWA was installed');
            appState.deferredPrompt = null;
            // Hide install button
            if (installBtn) {
                installBtn.classList.add('hidden');
            }
            showMessage(t('messages.installSuccess') || 'App erfolgreich installiert!', 'ok');
        });

        await loadTranslations();
        applyTranslations();
        const config = await loadConfig();
        applyConfig(config);
        setupEventListeners();
        checkNfcSupport();
        initCollapsibles();

        // Check if contact data was passed via URL parameter (Link-Tree workflow)
        checkUrlParametersAndDisplay();

        // Only setup initial state if no URL data was loaded
        if (!appState.scannedDataObject) {
            setupReadTabInitialState();
        }
        switchTab('read-tab');
        if (readResultContainer) {
            autoExpandToFitScreen(readResultContainer);
            readResultContainer.classList.add('expanded');
            readResultContainer.style.maxHeight = '';
        }
    }
    main();

    // --- Event Handler Definitions ---
    const handleTabClick = (e) => { const tabLink = e.target.closest('.tab-link'); if (tabLink) switchTab(tabLink.dataset.tab); };
    const handleThemeChange = (e) => { const themeBtn = e.target.closest('.theme-btn'); if (themeBtn) applyTheme(themeBtn.dataset.theme); };
    const handleReloadClick = () => { navigator.serviceWorker.getRegistration().then(reg => { if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } }); };
    const debouncedUpdatePayload = debounce(updatePayloadOnChange, CONFIG.DEBOUNCE_DELAY);
    const handleCheckForUpdate = () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) {
                    reg.update().then(newReg => {
                        if (newReg.installing) {
                            showMessage(t('messages.updateChecking'), 'info');
                        } else if (newReg.waiting) {
                            updateBanner.classList.remove('hidden');
                        } else {
                            showMessage(t('messages.noUpdateFound'), 'ok');
                        }
                    });
                }
            });
        }
    };

    const handleClearCache = async () => {
        const confirmMessage = t('messages.cacheClearConfirm');
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            showMessage(t('messages.cacheClearing'), 'info');

            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                console.log('[App] All caches cleared:', cacheNames);
            }

            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(registration => registration.unregister()));
                console.log('[App] Service workers unregistered');
            }

            showMessage(t('messages.cacheClearSuccess'), 'ok');

            setTimeout(() => {
                window.location.reload(true);
            }, 1500);
        } catch (error) {
            console.error('[App] Error clearing cache:', error);
            showMessage('Error clearing cache: ' + error.message, 'err');
        }
    };

    function setupEventListeners() {
        if(tabsContainer) tabsContainer.addEventListener('click', handleTabClick);
        if(themeSwitcher) themeSwitcher.addEventListener('click', handleThemeChange);
        if(nfcStatusBadge) nfcStatusBadge.addEventListener('click', handleNfcAction);
        if(checkForUpdateBtn) checkForUpdateBtn.addEventListener('click', handleCheckForUpdate);
        if(clearCacheBtn) clearCacheBtn.addEventListener('click', handleClearCache);
        if(installBtn) installBtn.addEventListener('click', showInstallPrompt);

        if (!isIOS()) {
            if (copyToFormBtn) {
                copyToFormBtn.addEventListener('click', populateFormFromScan);
            }
            if(saveScannedBtn) saveScannedBtn.addEventListener('click', saveScannedDataAsVcf);
            if(saveVcfBtn) saveVcfBtn.addEventListener('click', saveFormAsVcf);
            if(loadVcfInput) loadVcfInput.addEventListener('change', loadVcfIntoForm);
            if (loadVcfLabel && loadVcfInput) {
                loadVcfLabel.addEventListener('click', () => {
                    loadVcfInput.click();
                });
            }
            if(importContactBtn) importContactBtn.addEventListener('click', importFromContacts);
        }

        if(form) {
            form.addEventListener('input', debouncedUpdatePayload);
            form.addEventListener('change', updatePayloadOnChange);
        }
        if(reloadButton) reloadButton.addEventListener('click', handleReloadClick);

        // Check Contact Picker API support
        checkContactPickerSupport();
    }

    // --- vCard Functions ---
    /**
     * Creates a vCard 3.0 formatted string from contact data
     * Optimized for UTF-8 compatibility (iOS, Android, Outlook)
     * @param {Object} data - Contact data object
     * @param {string} [data.fn] - First name
     * @param {string} [data.ln] - Last name
     * @param {string} [data.org] - Organization
     * @param {string} [data.title] - Job title
     * @param {string} [data.tel] - Mobile phone number
     * @param {string} [data.telWork] - Work phone number
     * @param {string} [data.email] - Email address
     * @param {string} [data.url] - Website URL
     * @param {string} [data.street] - Street address
     * @param {string} [data.city] - City
     * @param {string} [data.zip] - ZIP/Postal code
     * @param {string} [data.country] - Country
     * @returns {string} vCard 3.0 formatted string
     */
    function createVCardString(data) {
        const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

        // Helper function to escape special characters in vCard values
        const escapeVCardValue = (value) => {
            if (!value) return '';
            return String(value)
                .replace(/\\/g, '\\\\')  // Escape backslashes
                .replace(/;/g, '\\;')     // Escape semicolons
                .replace(/,/g, '\\,')     // Escape commas
                .replace(/\n/g, '\\n');   // Escape newlines
        };

        // Full name (FN) - required field with UTF-8 charset
        const fullName = [data.fn, data.ln].filter(Boolean).join(' ').trim();
        if (fullName) {
            lines.push(`FN;CHARSET=UTF-8:${escapeVCardValue(fullName)}`);
            // N field format: Last;First;Middle;Prefix;Suffix
            lines.push(`N;CHARSET=UTF-8:${escapeVCardValue(data.ln || '')};${escapeVCardValue(data.fn || '')};;;`);
        }

        // Organization with UTF-8 charset
        if (data.org) {
            lines.push(`ORG;CHARSET=UTF-8:${escapeVCardValue(data.org)}`);
        }

        // Title/Position with UTF-8 charset
        if (data.title) {
            lines.push(`TITLE;CHARSET=UTF-8:${escapeVCardValue(data.title)}`);
        }

        // Phone (Mobile) - no charset needed for numbers
        if (data.tel) {
            lines.push(`TEL;TYPE=CELL:${data.tel}`);
        }

        // Work Phone - no charset needed for numbers
        if (data.telWork) {
            lines.push(`TEL;TYPE=WORK,VOICE:${data.telWork}`);
        }

        // Email - no charset needed, email is ASCII-safe
        if (data.email) {
            lines.push(`EMAIL;TYPE=INTERNET:${data.email}`);
        }

        // Website - URLs are ASCII-safe
        if (data.url) {
            lines.push(`URL:${data.url}`);
        }

        // Address (Work) with UTF-8 charset - ADR format: ;;street;city;;zip;country
        if (data.street || data.city || data.zip || data.country) {
            const street = escapeVCardValue(data.street || '');
            const city = escapeVCardValue(data.city || '');
            const zip = escapeVCardValue(data.zip || '');
            const country = escapeVCardValue(data.country || '');
            lines.push(`ADR;TYPE=WORK;CHARSET=UTF-8:;;${street};${city};;${zip};${country}`);
        }

        lines.push('END:VCARD');
        return lines.join('\r\n');
    }

    /**
     * Parses a vCard string and extracts contact data
     * Includes input sanitization to prevent malicious data
     * @param {string} vcfString - vCard formatted string
     * @returns {Object} Parsed contact data
     * @throws {Error} If vCard format is invalid
     */
    function parseVCard(vcfString) {
        if (!vcfString || typeof vcfString !== 'string') {
            throw new Error('Invalid vCard: must be a non-empty string');
        }

        // Check for basic vCard structure
        if (!vcfString.includes('BEGIN:VCARD')) {
            throw new Error('Invalid vCard: missing BEGIN:VCARD');
        }
        if (!vcfString.includes('END:VCARD')) {
            throw new Error('Invalid vCard: missing END:VCARD');
        }

        const data = {};
        const lines = vcfString.split(/\r?\n/);

        // Helper to unescape vCard values
        const unescapeVCardValue = (value) => {
            if (!value) return '';
            return String(value)
                .replace(/\\n/g, '\n')
                .replace(/\\,/g, ',')
                .replace(/\\;/g, ';')
                .replace(/\\\\/g, '\\');
        };

        for (const line of lines) {
            // Skip empty lines and vCard structure lines
            if (!line.trim() || line.startsWith('BEGIN:') || line.startsWith('END:') || line.startsWith('VERSION:')) {
                continue;
            }

            // N - Structured Name (Last;First;Middle;Prefix;Suffix)
            // Process N field FIRST as it has structured data with correct order
            if (line.startsWith('N:') || line.startsWith('N;')) {
                const parts = line.substring(line.indexOf(':') + 1).split(';');
                if (parts[1]) data.fn = sanitizeValue(unescapeVCardValue(parts[1]));
                if (parts[0]) data.ln = sanitizeValue(unescapeVCardValue(parts[0]));
            }

            // FN - Full Name (fallback only if N field didn't provide the data)
            else if (line.startsWith('FN:') || line.startsWith('FN;')) {
                const fullName = sanitizeValue(unescapeVCardValue(line.substring(line.indexOf(':') + 1)));
                const parts = fullName.split(' ');
                if (parts.length >= 2) {
                    if (!data.fn) data.fn = parts[0];
                    if (!data.ln) data.ln = parts.slice(1).join(' ');
                } else {
                    if (!data.fn) data.fn = fullName;
                }
            }

            // ORG - Organization
            else if (line.startsWith('ORG:') || line.startsWith('ORG;')) {
                // VCF format is ORG:Company;Department;... - we only want the company name
                data.org = sanitizeValue(unescapeVCardValue(line.substring(line.indexOf(':') + 1)).split(';')[0]);
            }

            // TITLE - Job Title
            else if (line.startsWith('TITLE:') || line.startsWith('TITLE;')) {
                data.title = sanitizeValue(unescapeVCardValue(line.substring(line.indexOf(':') + 1)));
            }

            // TEL - Phone (distinguish between mobile and work)
            else if (line.startsWith('TEL')) {
                const tel = sanitizeValue(line.substring(line.indexOf(':') + 1));
                // Check if it's a work phone
                if (line.includes('TYPE=WORK') || line.includes('type=work')) {
                    data.telWork = tel;
                } else if (!data.tel) {
                    // Default to mobile if not specified
                    data.tel = tel;
                }
            }

            // EMAIL - Email
            else if (line.startsWith('EMAIL')) {
                const email = sanitizeValue(line.substring(line.indexOf(':') + 1));
                // Basic email validation
                if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    data.email = email;
                }
            }

            // URL - Website
            else if (line.startsWith('URL:') || line.startsWith('URL;')) {
                const url = sanitizeValue(line.substring(line.indexOf(':') + 1));
                // Basic URL validation
                try {
                    new URL(url);
                    data.url = url;
                } catch {
                    console.warn('Invalid URL in vCard:', url);
                }
            }

            // ADR - Address (format: ;;street;city;;zip;country)
            else if (line.startsWith('ADR')) {
                const adr = line.substring(line.indexOf(':') + 1);
                const parts = adr.split(';');
                // ADR format: POBox;ExtendedAddress;Street;City;Region;PostalCode;Country
                if (parts.length >= 7) {
                    data.street = sanitizeValue(unescapeVCardValue(parts[2] || ''));
                    data.city = sanitizeValue(unescapeVCardValue(parts[3] || ''));
                    data.zip = sanitizeValue(unescapeVCardValue(parts[5] || ''));
                    data.country = sanitizeValue(unescapeVCardValue(parts[6] || ''));
                }
            }
        }

        // Validate that we have at least some meaningful data
        if (!data.fn && !data.ln && !data.email && !data.tel) {
            throw new Error('Invalid vCard: no contact information found');
        }

        return data;
    }

    // --- URL-Based Contact Data Encoding/Decoding ---
    /**
     * Sanitizes a string value to prevent injection attacks
     * @param {string} value - The value to sanitize
     * @returns {string} Sanitized value
     */
    function sanitizeValue(value) {
        if (!value) return '';

        // Convert to string and trim
        let sanitized = String(value).trim();

        // Remove null bytes and control characters (except newlines for addresses)
        sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

        // Limit length to prevent DoS
        if (sanitized.length > CONFIG.MAX_FIELD_LENGTH) {
            sanitized = sanitized.substring(0, CONFIG.MAX_FIELD_LENGTH);
            console.warn(`Field truncated to ${CONFIG.MAX_FIELD_LENGTH} characters`);
        }

        return sanitized;
    }

    /**
     * Encodes contact data into a compact URL parameter
     * Uses short keys to minimize URL length for NFC chip capacity
     * Sanitizes all input data to prevent injection attacks
     * @param {Object} data - Contact data object
     * @returns {string} Base64-encoded JSON string
     * @throws {Error} If data is invalid or encoding fails
     */
    function encodeContactDataToUrl(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid contact data: must be an object');
        }

        // Map full field names to short keys (1-2 chars) to save space
        const shortKeys = {
            fn: 'n',      // First name
            ln: 'l',      // Last name
            org: 'o',     // Organization
            title: 't',   // Title
            tel: 'p',     // Phone (mobile)
            telWork: 'w', // Work phone
            email: 'e',   // Email
            url: 'u',     // URL
            street: 's',  // Street
            city: 'c',    // City
            zip: 'z',     // ZIP
            country: 'k'  // Country (k for Kontry to avoid confusion)
        };

        // Create compact object with only filled fields (with sanitization)
        const compactData = {};
        for (const [fullKey, value] of Object.entries(data)) {
            if (value && String(value).trim()) {
                const shortKey = shortKeys[fullKey] || fullKey;
                // Sanitize value before encoding
                compactData[shortKey] = sanitizeValue(value);
            }
        }

        // Validate that we have at least some data
        if (Object.keys(compactData).length === 0) {
            throw new Error('No valid contact data to encode');
        }

        try {
            // Convert to JSON and encode to Base64
            const json = JSON.stringify(compactData);
            const base64 = btoa(unescape(encodeURIComponent(json))); // UTF-8 safe encoding
            return base64;
        } catch (error) {
            console.error('Failed to encode contact data:', error);
            throw new Error('Failed to encode contact data: ' + error.message);
        }
    }

    /**
     * Decodes contact data from URL parameter
     * Converts short keys back to full field names
     * @param {string} encodedData - Base64-encoded data string
     * @returns {Object} Contact data object with full field names
     */
    function decodeContactDataFromUrl(encodedData) {
        try {
            // Decode Base64 to JSON
            const json = decodeURIComponent(escape(atob(encodedData))); // UTF-8 safe decoding
            const compactData = JSON.parse(json);

            // Map short keys back to full field names
            const fullKeys = {
                n: 'fn',      // First name
                l: 'ln',      // Last name
                o: 'org',     // Organization
                t: 'title',   // Title
                p: 'tel',     // Phone (mobile)
                w: 'telWork', // Work phone
                e: 'email',   // Email
                u: 'url',     // URL
                s: 'street',  // Street
                c: 'city',    // City
                z: 'zip',     // ZIP
                k: 'country'  // Country
            };

            const data = {};
            for (const [shortKey, value] of Object.entries(compactData)) {
                const fullKey = fullKeys[shortKey] || shortKey;
                data[fullKey] = value;
            }

            return data;
        } catch (error) {
            console.error('[URL Decode] Failed to decode contact data:', error);
            throw new Error(t('errors.invalidUrlData') || 'Ungültige URL-Daten');
        }
    }

    /**
     * Generates complete URL with contact data for NFC chip
     * Validates the resulting URL to ensure it's within NFC chip capacity limits
     * @param {Object} data - Contact data object
     * @returns {string} Complete URL with encoded data parameter
     * @throws {Error} If URL generation fails or exceeds size limits
     */
    function generateContactUrl(data) {
        try {
            const encodedData = encodeContactDataToUrl(data);
            const baseUrl = window.location.origin + window.location.pathname;
            const fullUrl = `${baseUrl}?d=${encodedData}`;

            // Validate URL format
            const urlObj = new URL(fullUrl);
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                throw new Error('Invalid URL protocol: must be http or https');
            }

            // Check URL length for NFC compatibility
            const urlByteSize = new TextEncoder().encode(fullUrl).length;

            if (urlByteSize > CONFIG.NTAG216_CAPACITY) {
                throw new Error(`URL too long (${urlByteSize} bytes). Maximum: ${CONFIG.NTAG216_CAPACITY} bytes. Please reduce contact data.`);
            }

            return fullUrl;
        } catch (error) {
            console.error('Failed to generate contact URL:', error);
            throw error;
        }
    }

    /**
     * Checks URL parameters for contact data and displays it
     * Called on app initialization to handle "Link-Tree" workflow
     * where contact data is passed via URL when NFC chip is scanned
     */
    function checkUrlParametersAndDisplay() {
        const urlParams = new URLSearchParams(window.location.search);
        const encodedData = urlParams.get('d');

        if (!encodedData) {
            // No URL data parameter, normal app mode
            return;
        }

        try {
            // Decode contact data from URL
            const contactData = decodeContactDataFromUrl(encodedData);
            console.log('[URL Read] Decoded contact data from URL:', contactData);

            // --- NEU: Weihnachts-Check hier einfügen ---
            showSeasonalGreeting(contactData);
            // ------------------------------------------

            // Store in app state
            appState.scannedDataObject = contactData;

            // Display contact card
            displayParsedData(contactData);

            // Show action buttons (Save as Contact)
            if (readActions) {
                readActions.classList.remove('hidden');
            }

            // Show raw data in debug section
            if (rawDataOutput) {
                const vcardString = createVCardString(contactData);
                rawDataOutput.value = vcardString;
            }

            // Switch to Read tab to show the contact
            switchTab('read-tab');

            // Show success message
            showMessage(t('messages.urlDataLoaded') || 'Kontaktdaten aus Link geladen', 'ok');
            addLogEntry('Kontaktdaten aus URL-Parameter geladen', 'info');

            // Clean URL (optional - removes the ?d=... parameter for cleaner appearance)
            // Uncomment the next line if you want to clean the URL after loading
            // window.history.replaceState({}, document.title, window.location.pathname);

        } catch (error) {
            console.error('[URL Read] Error decoding URL parameters:', error);
            showMessage(t('errors.invalidUrlData') || 'Fehler beim Laden der Kontaktdaten aus dem Link', 'err');
            addLogEntry('Fehler beim Dekodieren der URL-Parameter', 'err');
        }
    }

    // --- UI & Display Logic ---
    function createDataPair(label, value) {
        if (value === undefined || value === null || String(value).trim() === '') return null;
        const div = document.createElement('div');
        div.className = 'data-pair';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'data-pair-label';
        labelSpan.textContent = label;
        const valueSpan = document.createElement('span');
        valueSpan.className = 'data-pair-value';
        valueSpan.textContent = value;
        div.appendChild(labelSpan);
        div.appendChild(valueSpan);
        return div;
    }

    function displayParsedData(data) {
        contactCard.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const addPair = (labelKey, val) => {
            const el = createDataPair(t(labelKey), val);
            if (el) fragment.appendChild(el);
        };

        // Display contact data
        const fullName = [data.fn, data.ln].filter(Boolean).join(' ');
        if (fullName) {
            const nameHeader = document.createElement('h3');
            nameHeader.textContent = fullName;
            nameHeader.style.marginBottom = '1rem';
            fragment.appendChild(nameHeader);
        }

        addPair('org', data.org);
        addPair('title', data.title);
        addPair('tel', data.tel);
        addPair('telWork', data.telWork);
        addPair('email', data.email);
        addPair('url', data.url);

        // Display address if any field is present
        if (data.street || data.city || data.zip || data.country) {
            const addressParts = [
                data.street,
                [data.zip, data.city].filter(Boolean).join(' '),
                data.country
            ].filter(Boolean);
            if (addressParts.length > 0) {
                addPair('address', addressParts.join(', '));
            }
        }

        contactCard.appendChild(fragment);
    }

    function applyConfig(config) {
        const selectedDesign = designs[config.design] || designs['vcard_standard'];

        if (!isIOS()) {
            updateManifest(selectedDesign);
        }

        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme !== selectedDesign.theme) { applyTheme(selectedDesign.theme); }
        if (selectedDesign.lockTheme) { if (themeSwitcher) themeSwitcher.classList.add('hidden'); } else { if (themeSwitcher) themeSwitcher.classList.remove('hidden'); }
        const customerBtnImg = document.querySelector('.theme-btn[data-theme="customer-brand"] img');
        if (customerBtnImg && selectedDesign.icons?.icon512) { customerBtnImg.src = selectedDesign.icons.icon512; }
        if (selectedDesign.brandColors?.primary) { document.documentElement.style.setProperty('--primary-color-override', selectedDesign.brandColors.primary); }
        if (selectedDesign.brandColors?.secondary) { document.documentElement.style.setProperty('--secondary-color-override', selectedDesign.brandColors.secondary); }
    }

    // --- NFC Logic ---
    /**
     * Starts NFC scanning for reading vCard data from tags
     * Sets up event listeners for reading and error handling
     * @returns {Promise<void>}
     * @throws {Error} If NFC scanning fails to start
     */
    async function startScanning() {
        try {
            const ndef = new NDEFReader();

            // Start scanning
            await ndef.scan({ signal: appState.abortController.signal });
            setNfcBadge('scanning');
            showMessage(t('messages.scanToReadInfo'), 'info');
            addLogEntry('NFC Scanning started', 'info');

            // Handle reading events
            ndef.onreading = (event) => {
                try {
                    const message = event.message;
                    let vcardData = null;

                    // Iterate through all records to find vCard
                    for (const record of message.records) {
                        if (record.mediaType === "text/vcard") {
                            // Decode vCard data
                            const decoder = new TextDecoder();
                            const vcardString = decoder.decode(record.data);

                            // Parse vCard
                            vcardData = parseVCard(vcardString);

                            // Store in app state
                            appState.scannedDataObject = vcardData;

                            // Display parsed data
                            displayParsedData(vcardData);

                            // Show raw data
                            if (rawDataOutput) {
                                rawDataOutput.value = vcardString;
                            }

                            // Show action buttons
                            if (readActions) {
                                readActions.classList.remove('hidden');
                            }

                            // Expand read result container
                            if (readResultContainer) {
                                readResultContainer.classList.remove('expanded');
                                autoExpandToFitScreen(readResultContainer);
                            }

                            // Visual feedback
                            if ('vibrate' in navigator) {
                                navigator.vibrate(200);
                            }
                            setNfcBadge('success', t('status.success'));
                            showMessage(t('messages.readSuccess') || 'vCard erfolgreich gelesen!', 'ok');
                            addLogEntry('vCard successfully read from NFC tag', 'ok');

                            // Reset to scanning state after success
                            setTimeout(() => {
                                if (!appState.abortController?.signal.aborted) {
                                    setNfcBadge('scanning');
                                }
                            }, 2000);

                            break;
                        }
                    }

                    // If no vCard found
                    if (!vcardData) {
                        showMessage(t('errors.noVcardFound') || 'Kein vCard-Datensatz auf dem Tag gefunden', 'err');
                        addLogEntry('No vCard data found on NFC tag', 'err');
                    }
                } catch (readError) {
                    ErrorHandler.handle(readError, 'NFCRead');
                }
            };

            // Handle reading errors
            ndef.onreadingerror = (event) => {
                const error = new Error('Error reading NFC tag');
                ErrorHandler.handle(error, 'NFCReadError');
            };

        } catch (error) {
            if (error.name !== 'AbortError') {
                ErrorHandler.handle(error, 'NFCScan');
            }
            abortNfcAction();
            startCooldown();
        }
    }

    /**
     * Handles NFC action (read or write) with race condition protection
     * Uses a lock mechanism to prevent concurrent NFC operations
     * @returns {Promise<void>}
     */
    async function handleNfcAction() {
        // Race condition protection: Check and set atomically
        // If already active or in cooldown, exit immediately
        if (appState.isNfcActionActive || appState.isCooldownActive) {
            console.warn('[NFC] Operation already in progress or in cooldown');
            return;
        }

        // Set lock immediately to prevent race conditions
        appState.isNfcActionActive = true;

        // Double-check after setting (defense in depth)
        // Small delay to ensure any concurrent calls have set their flag
        await new Promise(resolve => setTimeout(resolve, 10));

        const writeTab = document.getElementById('write-tab');
        const isWriteMode = writeTab?.classList.contains('active') || false;

        appState.abortController = new AbortController();

        // Read Mode
        if (!isWriteMode) {
            await startScanning();
            return;
        }

        // Write Mode
        appState.nfcTimeoutId = setTimeout(() => {
            if (appState.abortController && !appState.abortController.signal.aborted) {
                appState.abortController.abort(new DOMException('NFC Operation Timed Out', 'TimeoutError'));
            }
        }, CONFIG.NFC_WRITE_TIMEOUT);

        try {
            const ndef = new NDEFReader();
            const validationErrors = validateForm();
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join('\n'));
            }

            setNfcBadge('writing');
            const formData = getFormData();

            // Generate URL with contact data for Link-Tree style workflow
            const contactUrl = generateContactUrl(formData);

            // Create NDEF message with URL record (auto-opens browser on scan)
            const message = {
                records: [{
                    recordType: "url",
                    data: contactUrl
                }]
            };

            // Log URL size for debugging
            console.log('[NFC Write] Generated URL:', contactUrl);
            console.log('[NFC Write] URL length:', contactUrl.length, 'bytes');
            addLogEntry(`URL-Länge: ${contactUrl.length} Bytes`, 'info');

            await writeWithRetries(ndef, message);
        } catch (error) {
            clearTimeout(appState.nfcTimeoutId);
            if (error.name !== 'AbortError') {
                ErrorHandler.handle(error, 'NFCAction');
            } else if (error.message === 'NFC Operation Timed Out') {
                const timeoutError = new DOMException('Write operation timed out.', 'TimeoutError');
                ErrorHandler.handle(timeoutError, 'NFCAction');
            }
            abortNfcAction();
            startCooldown();
        }
    }

    async function writeWithRetries(ndef, message) {
        for (let attempt = 1; attempt <= CONFIG.MAX_WRITE_RETRIES; attempt++) {
            try {
                showMessage(t('messages.writeAttempt', { replace: { attempt, total: CONFIG.MAX_WRITE_RETRIES } }), 'info', CONFIG.NFC_WRITE_TIMEOUT);
                await ndef.write(message, { signal: appState.abortController.signal });
                clearTimeout(appState.nfcTimeoutId);
                setNfcBadge('success', t('status.success'));
                showMessage(t('messages.writeSuccess'), 'ok');

                const timeoutId = setTimeout(() => {
                    if (appState.gracePeriodTimeoutId === timeoutId) {
                        abortNfcAction();
                        startCooldown();
                    }
                }, CONFIG.WRITE_SUCCESS_GRACE_PERIOD);
                appState.gracePeriodTimeoutId = timeoutId;

                return;
            } catch (error) {
                console.warn(`Write attempt ${attempt} failed:`, error);
                if (attempt === CONFIG.MAX_WRITE_RETRIES || ['TimeoutError', 'AbortError'].includes(error.name)) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, CONFIG.WRITE_RETRY_DELAY));
            }
        }
    }

    // --- Data Processing & Form Handling ---
    /**
     * Extracts and returns form data as a clean object
     * Only includes fields with non-empty values
     * @returns {Object} Contact data object with trimmed values
     */
    function getFormData() {
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            if (String(value).trim()) data[key] = String(value).trim();
        }
        return data;
    }

    function updatePayloadOnChange() {
        const writeTab = document.getElementById('write-tab');
        if (!writeTab?.classList.contains('active')) return;

        if (!payloadOutput || !payloadSize || !nfcStatusBadge) {
            console.warn('[Payload] Missing UI elements, skipping payload update');
            return;
        }

        const formData = getFormData();

        // Generate URL for NFC chip (Link-Tree workflow)
        const contactUrl = generateContactUrl(formData);

        // Show both vCard (for reference) and URL in payload output
        const vcardString = createVCardString(formData);
        payloadOutput.value = `URL (wird auf Chip geschrieben):\n${contactUrl}\n\n--- vCard (Referenz) ---\n${vcardString}`;

        // Calculate URL size (this is what actually gets written to the chip)
        const urlByteCount = new TextEncoder().encode(contactUrl).length;
        const vcardByteCount = new TextEncoder().encode(vcardString).length;

        // Display size info with chip recommendations
        payloadSize.textContent = `URL: ${urlByteCount} Bytes | vCard: ${vcardByteCount} Bytes | Empfohlen: NTAG215 (${CONFIG.NTAG215_CAPACITY}B) oder NTAG216 (${CONFIG.NTAG216_CAPACITY}B)`;

        // Warn if URL exceeds NTAG215 capacity
        const isOverLimit = urlByteCount > CONFIG.NTAG215_CAPACITY;
        payloadSize.classList.toggle('limit-exceeded', isOverLimit);
        nfcStatusBadge.disabled = isOverLimit;

        if (isOverLimit) {
            payloadSize.title = `Warnung: URL ist zu lang für NTAG215. Bitte NTAG216 verwenden oder Daten kürzen.`;
        } else {
            payloadSize.title = '';
        }
    }

    /**
     * Validates form data before NFC write operation
     * Checks for required fields, valid formats, and size constraints
     * @returns {string[]} Array of error messages (empty if valid)
     */
    function validateForm() {
        const errors = [];
        const formData = getFormData();

        // Check if at least a name is provided
        if (!formData.fn && !formData.ln) {
            errors.push(t('errors.missingName'));
        }

        // Validate email format
        const emailInput = form.elements['email'];
        if(emailInput && emailInput.value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailInput.value)) {
                errors.push(t('errors.invalidEmail'));
            }
        }

        // Validate URL format
        const urlInput = form.elements['url'];
        if(urlInput && urlInput.value) {
            try {
                new URL(urlInput.value);
            } catch {
                errors.push(t('errors.invalidUrl'));
            }
        }

        // Check URL payload size (for Link-Tree workflow)
        const contactUrl = generateContactUrl(formData);
        const urlByteSize = new TextEncoder().encode(contactUrl).length;

        if (urlByteSize > CONFIG.NTAG215_CAPACITY) {
            errors.push(`URL zu lang (${urlByteSize} Bytes). Max. ${CONFIG.NTAG215_CAPACITY} Bytes für NTAG215. Bitte Daten kürzen oder NTAG216 verwenden.`);
        }

        return errors;
    }

    // --- Helper & State Functions ---
    function startCooldown() { appState.isCooldownActive = true; setNfcBadge('cooldown'); setTimeout(() => { appState.isCooldownActive = false; if ('NDEFReader' in window) setNfcBadge('idle'); }, CONFIG.COOLDOWN_DURATION) }
    function abortNfcAction() { clearTimeout(appState.nfcTimeoutId); if (appState.gracePeriodTimeoutId) { clearTimeout(appState.gracePeriodTimeoutId); appState.gracePeriodTimeoutId = null; } if (appState.abortController && !appState.abortController.signal.aborted) { appState.abortController.abort(new DOMException('User aborted', 'AbortError')); } appState.abortController = null; appState.isNfcActionActive = false; }
    function addLogEntry(message, type = 'info') { const timestamp = new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); appState.eventLog.unshift({ timestamp, message, type }); if (appState.eventLog.length > CONFIG.MAX_LOG_ENTRIES) appState.eventLog.pop(); renderLog(); }
    function renderLog() { if (!eventLogOutput) return; eventLogOutput.innerHTML = ''; appState.eventLog.forEach(entry => { const div = document.createElement('div'); div.className = `log-entry ${entry.type}`; const timestamp = document.createElement('span'); timestamp.className = 'log-timestamp'; timestamp.textContent = entry.timestamp; const message = document.createTextNode(` ${entry.message}`); div.appendChild(timestamp); div.appendChild(message); eventLogOutput.appendChild(div); }); }

    // --- UI/UX Functions ---
    function updateManifest(design) {
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) return;

        // Revoke old blob URL if exists
        const oldHref = manifestLink.href;
        if (oldHref && oldHref.startsWith('blob:')) {
            BlobUrlManager.revoke(oldHref);
        }

        const newManifest = {
            name: design.appName,
            short_name: design.short_name,
            start_url: "/vCard/index.html",
            scope: "/vCard/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: design.brandColors.primary || "#f04e37",
            orientation: "portrait-primary",
            icons: [
                { src: design.icons.icon192, sizes: "192x192", type: "image/png" },
                { src: design.icons.icon512, sizes: "512x512", type: "image/png" }
            ]
        };

        const blob = new Blob([JSON.stringify(newManifest)], { type: 'application/json' });
        manifestLink.href = BlobUrlManager.create(blob); // Use BlobUrlManager instead of direct URL.createObjectURL
    }
    function applyTheme(themeName) { const themeButtons = document.querySelectorAll('.theme-btn'); document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('vcard-theme', themeName); themeButtons.forEach(btn => { btn.classList.toggle('active', btn.dataset.theme === themeName); }); const metaThemeColor = document.querySelector('meta[name="theme-color"]'); if (metaThemeColor) { const colors = { dark: '#0f172a', light: '#f8f9fa', 'customer-brand': '#FCFCFD' }; metaThemeColor.setAttribute('content', colors[themeName] || '#FCFCFD'); } }
    function setupReadTabInitialState() { contactCard.innerHTML = ''; const p = document.createElement('p'); p.className = 'placeholder-text'; p.textContent = t('placeholderRead'); contactCard.appendChild(p); if(readActions) readActions.classList.add('hidden'); }
    function initCollapsibles() { document.querySelectorAll('.collapsible').forEach(el => makeCollapsible(el)) }

    function checkNfcSupport() {
        if ('NDEFReader' in window) {
            setNfcBadge('idle');
        } else {
            if (isIOS()) {
                if(tabsContainer) tabsContainer.classList.add('hidden');
                if(copyToFormBtn) copyToFormBtn.classList.add('hidden');
                setNfcBadge('idle');
                if(nfcStatusBadge) nfcStatusBadge.disabled = true;
            } else {
                setNfcBadge('unsupported');
                if(nfcFallback) nfcFallback.classList.remove('hidden');
                if(nfcStatusBadge) nfcStatusBadge.disabled = true;
            }

            const writeTabLink = document.querySelector('.tab-link[data-tab="write-tab"]');
            if (writeTabLink) {
                writeTabLink.style.display = 'none';
            }
        }
    }

    function switchTab(tabId) {
        abortNfcAction();
        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        const activeTabLink = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
        if(activeTabLink) activeTabLink.classList.add('active');
        const activeTabContent = document.getElementById(tabId);
        if(activeTabContent) activeTabContent.classList.add('active');

        if (legalInfoContainer) {
            legalInfoContainer.classList.toggle('hidden', tabId !== 'read-tab');
        }

        if ('NDEFReader' in window || isIOS()) {
            setNfcBadge('idle');
        }

        if (tabId === 'write-tab') {
            updatePayloadOnChange();
            const writeFormContainer = document.getElementById('write-form-container');
            if (writeFormContainer) {
                writeFormContainer.classList.remove('expanded');
                autoExpandToFitScreen(writeFormContainer);
            }
        } else if (tabId === 'read-tab') {
            if (readResultContainer) {
                if (appState.scannedDataObject) {
                    readResultContainer.classList.remove('expanded');
                    autoExpandToFitScreen(readResultContainer);
                } else {
                    readResultContainer.classList.add('expanded');
                    readResultContainer.style.maxHeight = '';
                }
            }
        }
    }

    function showMessage(text, type = 'info', duration = 4000) { if(!messageBanner) return; messageBanner.textContent = text; messageBanner.className = 'message-banner'; messageBanner.classList.add(type); messageBanner.classList.remove('hidden'); setTimeout(() => messageBanner.classList.add('hidden'), duration); addLogEntry(text, type); }

    function setNfcBadge(state, message = '') {
        if(!nfcStatusBadge) return;
        const writeTab = document.getElementById('write-tab');
        const isWriteMode = writeTab?.classList.contains('active') || false;

        if (isIOS()) {
            nfcStatusBadge.textContent = t('status.iosRead');
            nfcStatusBadge.className = 'nfc-badge';
            nfcStatusBadge.classList.add('info');
            return;
        }

        const states = {
            unsupported: [t('status.unsupported'), 'err'],
            idle: [isWriteMode ? t('status.startWriting') : t('status.startReading'), 'info'],
            scanning: [t('status.scanning'), 'info'],
            writing: [t('status.writing'), 'info'],
            success: [message || t('status.success'), 'ok'],
            error: [message || t('status.error'), 'err'],
            cooldown: [t('status.cooldown'), 'info']
        };
        const [text, className] = states[state] || states['idle'];
        nfcStatusBadge.textContent = text;
        nfcStatusBadge.className = 'nfc-badge';
        nfcStatusBadge.classList.add(className);
    }

    function populateFormFromScan() {
        if (isIOS()) {
            showMessage(t('messages.noDataToCopy'), 'err');
            return;
        }

        if (!appState.scannedDataObject) {
            showMessage(t('messages.noDataToCopy'), 'err');
            return;
        }

        if(form) form.reset();

        for (const [key, value] of Object.entries(appState.scannedDataObject)) {
            if(!form) continue;

            try {
                const input = form.elements[key];
                if (!input) {
                    console.warn(`[populateFormFromScan] Element not found for key: "${key}"`);
                    continue;
                }
                input.value = value;
            } catch (fieldError) {
                console.error(`[populateFormFromScan] Error setting field "${key}":`, fieldError);
                addLogEntry(`Fehler beim Setzen von Feld "${key}"`, 'err');
            }
        }

        switchTab('write-tab');
        showMessage(t('messages.copySuccess'), 'ok');
    }

    function saveFormAsVcf() {
        // Validate form data before saving
        const data = getFormData();

        // Check if there's any data to save
        if (!data || Object.keys(data).length === 0) {
            showMessage(t('errors.noDataToSave') || 'Keine Daten zum Speichern vorhanden', 'err');
            addLogEntry('VCF-Speicherung blockiert: Keine Daten vorhanden', 'err');
            return;
        }

        // Validate form data (email format, URL format, etc.)
        const validationErrors = [];

        // Check if at least a name is provided
        if (!data.fn && !data.ln) {
            validationErrors.push(t('errors.missingName') || 'Mindestens Vor- oder Nachname erforderlich');
        }

        // Validate email format if provided
        if (data.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                validationErrors.push(t('errors.invalidEmail') || 'Ungültige E-Mail-Adresse');
            }
        }

        // Validate URL format if provided
        if (data.url) {
            try {
                new URL(data.url);
            } catch {
                validationErrors.push(t('errors.invalidUrl') || 'Ungültige URL');
            }
        }

        // If validation errors exist, block download and show errors
        if (validationErrors.length > 0) {
            const errorMessage = validationErrors.join('\n');
            showMessage(errorMessage, 'err', 6000);
            addLogEntry('VCF-Speicherung blockiert: Validierungsfehler', 'err');
            return;
        }

        // Generate vCard string
        const vcardString = createVCardString(data);
        const vcardByteSize = new TextEncoder().encode(vcardString).length;

        // Enforce payload size limits
        if (vcardByteSize > CONFIG.NTAG216_CAPACITY) {
            const errorMsg = `vCard zu groß (${vcardByteSize} Bytes). Maximum: ${CONFIG.NTAG216_CAPACITY} Bytes. Bitte Daten kürzen.`;
            showMessage(errorMsg, 'err', 6000);
            addLogEntry(`VCF-Speicherung blockiert: ${vcardByteSize} Bytes > ${CONFIG.NTAG216_CAPACITY} Bytes`, 'err');
            return;
        }

        // Log successful validation with size info
        addLogEntry(`VCF-Speicherung: ${vcardByteSize} Bytes (Limit: ${CONFIG.NTAG216_CAPACITY} Bytes)`, 'ok');

        // Proceed with download
        const blob = new Blob([vcardString], { type: 'text/vcard' });
        const url = BlobUrlManager.create(blob); // Use BlobUrlManager
        const a = document.createElement('a');
        a.href = url;
        let filename = [data.fn, data.ln].filter(Boolean).join('_') || 'contact';
        // Force .vcf extension
        if (!filename.toLowerCase().endsWith('.vcf')) {
            filename += '.vcf';
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
            BlobUrlManager.revoke(url); // Use BlobUrlManager for cleanup
        }, CONFIG.URL_REVOKE_DELAY);
        showMessage(t('messages.saveSuccess') + ` (${vcardByteSize} Bytes)`, 'ok');
    }

    function loadVcfIntoForm(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Strict VCF file validation
        const fileName = file.name.toLowerCase();
        const validExtensions = ['.vcf', '.vcard'];
        const validMimeTypes = ['text/vcard', 'text/x-vcard'];

        const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
        const hasValidMimeType = validMimeTypes.includes(file.type);

        if (!hasValidExtension && !hasValidMimeType) {
            showMessage(t('errors.invalidFileType'), 'err');
            if (event.target) event.target.value = null;
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const vcfContent = e.target.result;
                const data = parseVCard(vcfContent);
                appState.scannedDataObject = data;
                populateFormFromScan();
                showMessage(t('messages.loadSuccess'), 'ok')
            } catch (error) {
                const userMessage = 'Die vCard-Datei konnte nicht gelesen werden.';
                ErrorHandler.handle(new Error(userMessage), 'LoadVCF');
            } finally {
                if (event.target) event.target.value = null
            }
        };
        reader.readAsText(file)
    }

    function autoExpandToFitScreen(elementToExpand) {
        if (!elementToExpand) return;

        const container = document.querySelector('.container');
        if (!headerElement || !legalInfoContainer || !container) return;

        const headerHeight = headerElement.offsetHeight;
        const tabsHeight = (tabsContainer && !tabsContainer.classList.contains('hidden')) ? tabsContainer.offsetHeight : 0;

        const containerStyle = window.getComputedStyle(container);
        const containerPadding = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);

        const otherElementsHeight = headerHeight + tabsHeight + containerPadding;

        const viewportHeight = window.innerHeight;
        const availableHeight = viewportHeight - otherElementsHeight - CONFIG.SAFETY_BUFFER_PX;

        const titleElement = elementToExpand.querySelector('h2');
        const minRequiredHeight = titleElement ? titleElement.offsetHeight + 60 : 100;

        const targetHeight = Math.max(availableHeight, minRequiredHeight);

        elementToExpand.dataset.autoHeight = `${targetHeight}px`;
        elementToExpand.style.maxHeight = `${targetHeight}px`;
    }

    function makeCollapsible(el) {
        if (!el || el.dataset.collapsibleApplied) return;
        el.dataset.collapsibleApplied = 'true';

        const toggle = () => {
            const isFullyExpanded = el.classList.contains('expanded');

            if (isFullyExpanded) {
                el.classList.remove('expanded');
                if (el.dataset.autoHeight) {
                    el.style.maxHeight = el.dataset.autoHeight;
                } else {
                    el.style.maxHeight = '';
                }
            } else {
                el.style.maxHeight = '';
                el.classList.add('expanded');
            }
        };

        const overlay = el.querySelector('.collapsible-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                el.style.maxHeight = '';
                el.classList.add('expanded');
            });
        }

        el.addEventListener('click', (e) => {
            const interactiveTags = ['input', 'select', 'textarea', 'button', 'label', 'summary', 'details', 'a'];
            if (interactiveTags.includes(e.target.tagName.toLowerCase()) || e.target.closest('.collapsible-overlay')) {
                return;
            }
            toggle();
        });
    }

    // --- Contact Picker API Functions ---
    /**
     * Checks if Contact Picker API is supported and shows/hides import button
     */
    function checkContactPickerSupport() {
        if ('contacts' in navigator && 'ContactsManager' in window) {
            if (importContactBtn) {
                importContactBtn.classList.remove('hidden');
            }
        }
    }

    /**
     * Imports contact data from native device contacts using Contact Picker API
     */
    async function importFromContacts() {
        if (!('contacts' in navigator)) {
            showMessage(t('errors.contactPickerNotSupported'), 'err');
            return;
        }

        try {
            const props = ['name', 'email', 'tel', 'address'];
            const opts = { multiple: false };

            const contacts = await navigator.contacts.select(props, opts);

            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const data = {};

                // Map name
                if (contact.name && contact.name.length > 0) {
                    const nameParts = contact.name[0].split(' ');
                    if (nameParts.length >= 2) {
                        data.fn = nameParts[0];
                        data.ln = nameParts.slice(1).join(' ');
                    } else {
                        data.fn = contact.name[0];
                    }
                }

                // Map email
                if (contact.email && contact.email.length > 0) {
                    data.email = contact.email[0];
                }

                // Map phone numbers (try to distinguish mobile vs work)
                if (contact.tel && contact.tel.length > 0) {
                    // First number goes to mobile by default
                    data.tel = contact.tel[0];
                    // If there's a second number, use it for work phone
                    if (contact.tel.length > 1) {
                        data.telWork = contact.tel[1];
                    }
                }

                // Map address
                if (contact.address && contact.address.length > 0) {
                    const addr = contact.address[0];
                    if (typeof addr === 'object') {
                        data.street = addr.addressLine?.[0] || '';
                        data.city = addr.city || '';
                        data.zip = addr.postalCode || '';
                        data.country = addr.country || '';
                    }
                }

                // Populate form with imported data
                appState.scannedDataObject = data;
                populateFormFromScan();
                showMessage(t('messages.importSuccess'), 'ok');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                ErrorHandler.handle(error, 'ContactImport');
            }
        }
    }

    /**
     * Saves the currently scanned data as a VCF file
     */
    function saveScannedDataAsVcf() {
        // Check if scanned data exists
        if (!appState.scannedDataObject) {
            showMessage(t('messages.noDataToSave') || 'Keine Daten zum Speichern vorhanden', 'err');
            addLogEntry('VCF-Speicherung blockiert: Keine gescannten Daten vorhanden', 'err');
            return;
        }

        const data = appState.scannedDataObject;

        // Validate that we have meaningful data
        if (!data || Object.keys(data).length === 0) {
            showMessage(t('errors.noDataToSave') || 'Keine Daten zum Speichern vorhanden', 'err');
            addLogEntry('VCF-Speicherung blockiert: Gescannte Daten sind leer', 'err');
            return;
        }

        // Check if at least a name is provided
        if (!data.fn && !data.ln) {
            showMessage(t('errors.missingName') || 'Mindestens Vor- oder Nachname erforderlich', 'err');
            addLogEntry('VCF-Speicherung blockiert: Kein Name in gescannten Daten', 'err');
            return;
        }

        // Generate vCard string
        const vcardString = createVCardString(data);
        const vcardByteSize = new TextEncoder().encode(vcardString).length;

        // Enforce payload size limits
        if (vcardByteSize > CONFIG.NTAG216_CAPACITY) {
            const errorMsg = `vCard zu groß (${vcardByteSize} Bytes). Maximum: ${CONFIG.NTAG216_CAPACITY} Bytes. Bitte Daten kürzen.`;
            showMessage(errorMsg, 'err', 6000);
            addLogEntry(`VCF-Speicherung blockiert: ${vcardByteSize} Bytes > ${CONFIG.NTAG216_CAPACITY} Bytes`, 'err');
            return;
        }

        // Log successful validation with size info
        addLogEntry(`VCF-Speicherung (gescannt): ${vcardByteSize} Bytes (Limit: ${CONFIG.NTAG216_CAPACITY} Bytes)`, 'ok');

        // Proceed with download
        const blob = new Blob([vcardString], { type: 'text/vcard' });
        const url = BlobUrlManager.create(blob); // Use BlobUrlManager
        const a = document.createElement('a');
        a.href = url;

        let filename = [data.fn, data.ln].filter(Boolean).join('_') || 'scanned_contact';
        // Force .vcf extension
        if (!filename.toLowerCase().endsWith('.vcf')) {
            filename += '.vcf';
        }
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
            BlobUrlManager.revoke(url); // Use BlobUrlManager for cleanup
        }, CONFIG.URL_REVOKE_DELAY);
        showMessage(t('messages.saveSuccess') + ` (${vcardByteSize} Bytes)`, 'ok');
    }

    /**
     * Shows the PWA installation prompt
     */
    async function showInstallPrompt() {
        if (!appState.deferredPrompt) {
            console.log('[App] Install prompt not available');
            return;
        }

        try {
            // Show the install prompt
            appState.deferredPrompt.prompt();

            // Wait for the user to respond to the prompt
            const choiceResult = await appState.deferredPrompt.userChoice;

            if (choiceResult.outcome === 'accepted') {
                console.log('[App] User accepted the install prompt');
                showMessage(t('messages.installAccepted') || 'Installation wird vorbereitet...', 'ok');
            } else {
                console.log('[App] User dismissed the install prompt');
            }

            // Hide install button after prompt
            if (installBtn) {
                installBtn.classList.add('hidden');
            }

            // Clear the deferredPrompt since it can only be used once
            appState.deferredPrompt = null;
        } catch (error) {
            console.error('[App] Error showing install prompt:', error);
        }
    }
});


