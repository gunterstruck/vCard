document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration and Constants ---
    const SCOPE = '/vCard/';
    const CONFIG = {
        COOLDOWN_DURATION: 2000,
        WRITE_SUCCESS_GRACE_PERIOD: 2500,
        WRITE_RETRY_DELAY: 200,
        MAX_PAYLOAD_SIZE: 880,
        DEBOUNCE_DELAY: 300,
        MAX_LOG_ENTRIES: 15,
        NFC_WRITE_TIMEOUT: 5000,
        MAX_WRITE_RETRIES: 3,
        SAFETY_BUFFER_PX: 10,
        URL_REVOKE_DELAY: 100
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
    };

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
            // Show install prompt automatically
            showInstallPrompt();
        });

        // Handle successful installation
        window.addEventListener('appinstalled', () => {
            console.log('[App] PWA was installed');
            appState.deferredPrompt = null;
            showMessage(t('messages.installSuccess') || 'App erfolgreich installiert!', 'ok');
        });

        await loadTranslations();
        applyTranslations();
        const config = await loadConfig();
        applyConfig(config);
        setupEventListeners();
        checkNfcSupport();
        initCollapsibles();

        setupReadTabInitialState();
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
     * @param {Object} data - Contact data object
     * @returns {string} vCard formatted string
     */
    function createVCardString(data) {
        const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

        // Full name (FN) - required field
        const fullName = [data.fn, data.ln].filter(Boolean).join(' ').trim();
        if (fullName) {
            lines.push(`FN:${fullName}`);
            // N field format: Last;First;Middle;Prefix;Suffix
            lines.push(`N:${data.ln || ''};${data.fn || ''};;;`);
        }

        // Organization
        if (data.org) {
            lines.push(`ORG:${data.org}`);
        }

        // Title/Position
        if (data.title) {
            lines.push(`TITLE:${data.title}`);
        }

        // Phone (Mobile)
        if (data.tel) {
            lines.push(`TEL;TYPE=CELL:${data.tel}`);
        }

        // Work Phone
        if (data.telWork) {
            lines.push(`TEL;TYPE=WORK,VOICE:${data.telWork}`);
        }

        // Email
        if (data.email) {
            lines.push(`EMAIL;TYPE=INTERNET:${data.email}`);
        }

        // Website
        if (data.url) {
            lines.push(`URL:${data.url}`);
        }

        // Address (Work) - ADR format: ;;street;city;;zip;country
        if (data.street || data.city || data.zip || data.country) {
            const street = data.street || '';
            const city = data.city || '';
            const zip = data.zip || '';
            const country = data.country || '';
            lines.push(`ADR;TYPE=WORK:;;${street};${city};;${zip};${country}`);
        }

        lines.push('END:VCARD');
        return lines.join('\r\n');
    }

    /**
     * Parses a vCard string and extracts contact data
     * @param {string} vcfString - vCard formatted string
     * @returns {Object} Parsed contact data
     */
    function parseVCard(vcfString) {
        const data = {};
        const lines = vcfString.split(/\r?\n/);

        for (const line of lines) {
            // FN - Full Name
            if (line.startsWith('FN:')) {
                const fullName = line.substring(3);
                const parts = fullName.split(' ');
                if (parts.length >= 2) {
                    data.fn = parts[0];
                    data.ln = parts.slice(1).join(' ');
                } else {
                    data.fn = fullName;
                }
            }

            // N - Structured Name (Last;First;Middle;Prefix;Suffix)
            else if (line.startsWith('N:')) {
                const parts = line.substring(2).split(';');
                if (parts[1] && !data.fn) data.fn = parts[1];
                if (parts[0] && !data.ln) data.ln = parts[0];
            }

            // ORG - Organization
            else if (line.startsWith('ORG:')) {
                data.org = line.substring(4);
            }

            // TITLE - Job Title
            else if (line.startsWith('TITLE:')) {
                data.title = line.substring(6);
            }

            // TEL - Phone (distinguish between mobile and work)
            else if (line.startsWith('TEL')) {
                const tel = line.substring(line.indexOf(':') + 1);
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
                const email = line.substring(line.indexOf(':') + 1);
                data.email = email;
            }

            // URL - Website
            else if (line.startsWith('URL:')) {
                data.url = line.substring(4);
            }

            // ADR - Address (format: ;;street;city;;zip;country)
            else if (line.startsWith('ADR')) {
                const adr = line.substring(line.indexOf(':') + 1);
                const parts = adr.split(';');
                // ADR format: POBox;ExtendedAddress;Street;City;Region;PostalCode;Country
                if (parts.length >= 7) {
                    data.street = parts[2] || '';
                    data.city = parts[3] || '';
                    data.zip = parts[5] || '';
                    data.country = parts[6] || '';
                }
            }
        }

        return data;
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
    async function handleNfcAction() {
        if (appState.isNfcActionActive || appState.isCooldownActive) return;
        const writeTab = document.getElementById('write-tab');
        const isWriteMode = writeTab?.classList.contains('active') || false;

        if (!isWriteMode) {
            showMessage(t('messages.scanToReadInfo'), 'info');
            return;
        }

        appState.isNfcActionActive = true;
        appState.abortController = new AbortController();
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
            const vcardString = createVCardString(formData);

            // Create NDEF message with vCard MIME type
            const encoder = new TextEncoder();
            const vcardBytes = encoder.encode(vcardString);

            const message = {
                records: [{
                    recordType: "mime",
                    mediaType: "text/vcard",
                    data: vcardBytes
                }]
            };

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
        const vcardString = createVCardString(formData);
        payloadOutput.value = vcardString;

        const byteCount = new TextEncoder().encode(vcardString).length;
        payloadSize.textContent = `${byteCount} / ${CONFIG.MAX_PAYLOAD_SIZE} Bytes`;
        const isOverLimit = byteCount > CONFIG.MAX_PAYLOAD_SIZE;
        payloadSize.classList.toggle('limit-exceeded', isOverLimit);
        nfcStatusBadge.disabled = isOverLimit;
    }

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

        // Check payload size
        const vcardString = createVCardString(formData);
        const payloadByteSize = new TextEncoder().encode(vcardString).length;
        if (payloadByteSize > CONFIG.MAX_PAYLOAD_SIZE) {
            errors.push(t('messages.payloadTooLarge'));
        }

        return errors;
    }

    // --- Helper & State Functions ---
    function startCooldown() { appState.isCooldownActive = true; setNfcBadge('cooldown'); setTimeout(() => { appState.isCooldownActive = false; if ('NDEFReader' in window) setNfcBadge('idle'); }, CONFIG.COOLDOWN_DURATION) }
    function abortNfcAction() { clearTimeout(appState.nfcTimeoutId); if (appState.gracePeriodTimeoutId) { clearTimeout(appState.gracePeriodTimeoutId); appState.gracePeriodTimeoutId = null; } if (appState.abortController && !appState.abortController.signal.aborted) { appState.abortController.abort(new DOMException('User aborted', 'AbortError')); } appState.abortController = null; appState.isNfcActionActive = false; }
    function addLogEntry(message, type = 'info') { const timestamp = new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); appState.eventLog.unshift({ timestamp, message, type }); if (appState.eventLog.length > CONFIG.MAX_LOG_ENTRIES) appState.eventLog.pop(); renderLog(); }
    function renderLog() { if (!eventLogOutput) return; eventLogOutput.innerHTML = ''; appState.eventLog.forEach(entry => { const div = document.createElement('div'); div.className = `log-entry ${entry.type}`; const timestamp = document.createElement('span'); timestamp.className = 'log-timestamp'; timestamp.textContent = entry.timestamp; const message = document.createTextNode(` ${entry.message}`); div.appendChild(timestamp); div.appendChild(message); eventLogOutput.appendChild(div); }); }

    // --- UI/UX Functions ---
    function updateManifest(design) { const manifestLink = document.querySelector('link[rel="manifest"]'); if (!manifestLink) return; const oldHref = manifestLink.href; if (oldHref && oldHref.startsWith('blob:')) { URL.revokeObjectURL(oldHref); } const newManifest = { name: design.appName, short_name: design.short_name, start_url: "/vCard/index.html", scope: "/vCard/", display: "standalone", background_color: "#ffffff", theme_color: design.brandColors.primary || "#f04e37", orientation: "portrait-primary", icons: [{ src: design.icons.icon192, sizes: "192x192", type: "image/png" }, { src: design.icons.icon512, sizes: "512x512", type: "image/png" }] }; const blob = new Blob([JSON.stringify(newManifest)], { type: 'application/json' }); manifestLink.href = URL.createObjectURL(blob); }
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
        const data = getFormData();
        const vcardString = createVCardString(data);
        const blob = new Blob([vcardString], { type: 'text/vcard' });
        const url = URL.createObjectURL(blob);
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
        setTimeout(() => { URL.revokeObjectURL(url); }, CONFIG.URL_REVOKE_DELAY);
        showMessage(t('messages.saveSuccess'), 'ok');
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
        if (!appState.scannedDataObject) {
            showMessage(t('messages.noDataToSave'), 'err');
            return;
        }

        const vcardString = createVCardString(appState.scannedDataObject);
        const blob = new Blob([vcardString], { type: 'text/vcard' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const data = appState.scannedDataObject;
        let filename = [data.fn, data.ln].filter(Boolean).join('_') || 'scanned_contact';
        // Force .vcf extension
        if (!filename.toLowerCase().endsWith('.vcf')) {
            filename += '.vcf';
        }
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => { URL.revokeObjectURL(url); }, CONFIG.URL_REVOKE_DELAY);
        showMessage(t('messages.saveSuccess'), 'ok');
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
            } else {
                console.log('[App] User dismissed the install prompt');
            }

            // Clear the deferredPrompt since it can only be used once
            appState.deferredPrompt = null;
        } catch (error) {
            console.error('[App] Error showing install prompt:', error);
        }
    }
});
