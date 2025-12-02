/**
 * THEME BOOTSTRAP ENHANCED (Anti-Flicker Version)
 * ------------------------------------------------
 * Dieses Skript wird VOR dem Rendern geladen.
 * Es sorgt dafür, dass Theme UND Brand-Farben sofort aktiv sind.
 * → Kein Flackern mehr beim Laden!
 */
(function() {
  try {


    // --- 0️⃣ SCOPE DEFINITION (WICHTIG: Muss mit index.html übereinstimmen!)
    const SCOPE = '/vCard/'; // ← vCard Branding Deployment


    // --- 1️⃣ Alte lokale Themes entfernen
    localStorage.removeItem('vcard-theme');

    // --- 2️⃣ Design-Definitionen (identisch zu app.js)
    const designs = {
      'vcard_standard': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#d54b2a',
          secondary: '#6c6b66'
        }
      },
      'peterpohl': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#00457D',
          secondary: '#FFEC00'
        }
      },
      'sigx': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#5865F2',
          secondary: '#3d3d3d'
        }
      },
      'vcard': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#d54b2a',
          secondary: '#6C6B66'
        }
      }
    };

    // --- 3️⃣ config.json laden (async mit Fetch API)
    let selectedDesign = designs['vcard']; // Fallback für vCard

    // Lade config.json mit Fetch API (modern und nicht-deprecated)
    async function loadThemeConfig() {
      try {
        const response = await fetch(SCOPE + 'config.json', {
          cache: 'no-cache',
          signal: AbortSignal.timeout(1000) // 1s Timeout für schnelles Laden
        });

        if (response.ok) {
          const config = await response.json();
          if (config && config.design && designs[config.design]) {
            selectedDesign = designs[config.design];

            // Theme und Farben aktualisieren
            applyThemeAndColors(selectedDesign);
          }
        }
      } catch (error) {
        console.warn('Theme config could not be loaded, using fallback:', error.message);
      }
    }

    // Funktion zum Anwenden von Theme und Farben
    function applyThemeAndColors(design) {
      // Theme auf Root-Element anwenden
      document.documentElement.setAttribute('data-theme', design.theme);

      // Brand-Farben setzen
      if (design.brandColors) {
        const root = document.documentElement;
        root.style.setProperty('--primary-color-override', design.brandColors.primary);
        root.style.setProperty('--primary-dark-override', adjustColor(design.brandColors.primary, -20));
        root.style.setProperty('--primary-light-override', adjustColor(design.brandColors.primary, 20));

        if (design.brandColors.secondary) {
          root.style.setProperty('--secondary-color-override', design.brandColors.secondary);
        }
      }

      // Theme-loaded Klasse hinzufügen
      document.documentElement.classList.add('theme-loaded');
    }

    // --- 4️⃣ Fallback-Theme sofort anwenden (Anti-Flicker)
    applyThemeAndColors(selectedDesign);

    // --- 5️⃣ Config asynchron nachladen und ggf. Theme aktualisieren
    loadThemeConfig();

    // --- Hilfsfunktion: Farbe aufhellen/abdunkeln
    function adjustColor(color, percent) {
      try {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);

        R = Math.min(255, Math.max(0, parseInt(R * (100 + percent) / 100)));
        G = Math.min(255, Math.max(0, parseInt(G * (100 + percent) / 100)));
        B = Math.min(255, Math.max(0, parseInt(B * (100 + percent) / 100)));

        const RR = R.toString(16).padStart(2, '0');
        const GG = G.toString(16).padStart(2, '0');
        const BB = B.toString(16).padStart(2, '0');

        return '#' + RR + GG + BB;
      } catch (error) {
        console.warn('Could not adjust color:', color, error);
        return color;
      }
    }

  } catch (e) {
    console.error('Theme initialization failed:', e);
    document.documentElement.setAttribute('data-theme', 'customer-brand');
    document.documentElement.classList.add('theme-loaded');
  }
})();