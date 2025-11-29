# vCard NFC Writer PWA

![vCard Logo](assets/icon-512.png)

> **Deine Daten. Dein Chip. Deine Kontrolle.**

## 🚀 Der Elevator Pitch

**"Schluss mit abgetippten Visitenkarten und teuren Abo-Modellen."**

Die **vCard App** ist das ultimative Werkzeug für den modernen Vertrieb. Sie ist keine klassische App aus dem Store, sondern eine **Progressive Web App (PWA)**, die direkt im Browser läuft. Sie ermöglicht es jedem Profi, Standard-NFC-Chips in Sekunden mit einer vollständigen digitalen Visitenkarte zu beschreiben.

Der Clou: **Privacy First & Offline Ready.**

Im Gegensatz zur Konkurrenz speichert diese App **nichts in der Cloud**. Alle Daten werden lokal auf dem Gerät verarbeitet. Ob im Messekeller ohne Empfang oder beim Kunden vor Ort – die App funktioniert immer. Importieren Sie Ihre Daten direkt aus dem Telefon-Adressbuch, halten Sie den Chip dran, fertig. Der Kunde braucht keine App, um die Daten zu empfangen – nur sein Smartphone.

---

## 📱 Was ist vCard?

Die **vCard NFC Writer PWA** ist eine webbasierte Anwendung zur Erstellung und Verwaltung von digitalen Visitenkarten auf NFC-Basis (Near Field Communication). Sie wurde entwickelt, um den Austausch von Kontaktdaten nahtlos, papierlos und datenschutzkonform zu gestalten.

---

## ✨ Die Kernfunktionen

### 1. **Blitzschnelle Erstellung (Smart Import)**
Niemand tippt gerne Adressen ab. Mit der **"Kontakt importieren"**-Funktion greift die App (nach Erlaubnis) auf das native Adressbuch Ihres Smartphones zu. Wählen Sie einfach Ihren eigenen Eintrag, und das Formular füllt sich automatisch mit Name, E-Mail, Telefon (Mobil & Arbeit) sowie der vollständigen Firmenadresse.

### 2. **Unabhängigkeit durch Offline-Fähigkeit**
Dank modernster Service-Worker-Technologie wird die gesamte App beim ersten Aufruf auf dem Gerät gespeichert. Sie funktioniert danach **vollständig offline**. Das ist essenziell für Messen, Baustellen oder Konferenzräume mit schlechtem WLAN.

### 3. **Datenschutz nach europäischen Standards**
Die App folgt dem Prinzip **"Local First"**. Es werden keine Formulardaten an einen Server gesendet. Die Generierung der vCard-Datei (`.vcf`) und das Schreiben auf den NFC-Chip passieren ausschließlich lokal im Browser des Nutzers.

### 4. **Sicherheit & Kontrolle**
- **Lese-Modus:** Überprüfen Sie jederzeit, was auf einem Chip gespeichert ist.
- **VCF-Validierung:** Die App akzeptiert beim Laden nur valide `.vcf`-Dateien, um Fehler zu vermeiden.
- **Bewusstes Speichern:** Auf der Lese-Seite können gescannte Daten explizit als Kontakt in das eigene Adressbuch exportiert werden.

### 5. **Keine Hürden für den Empfänger**
Der Kunde, der Ihre Karte scannt, benötigt diese App nicht. Sein Smartphone erkennt den internationalen **vCard 3.0 Standard** automatisch und bietet an, den Kontakt zu speichern.

---

## 🎯 Die Highlights (USPs)

| Feature | Beschreibung |
|---------|-------------|
| 🛠 **Kein App-Store nötig** | Einfach Link öffnen und "Zum Startbildschirm hinzufügen". Sofort einsatzbereit. |
| 🏢 **Business-Ready** | Unterstützt differenzierte Felder für **Arbeitstelefon** und **Büroadresse** (Straße, PLZ, Ort, Land). |
| 🎨 **Modernes Design** | Passt sich automatisch an (Dark Mode / Light Mode) und nutzt ein klares, professionelles Branding. |
| 🔄 **Import & Export** | Laden und speichern Sie Visitenkarten als `.vcf`-Datei, um sie per E-Mail oder Messenger weiterzuleiten. |
| 🌍 **Mehrsprachig** | Unterstützung für verschiedene Sprachen durch integrierte Internationalisierung. |
| 🔒 **100% Privacy** | Alle Daten bleiben auf Ihrem Gerät. Keine Cloud, kein Tracking, keine Abos. |
| 📶 **Offline First** | Funktioniert komplett ohne Internetverbindung nach dem ersten Laden. |
| 🔐 **Content Security Policy** | Maximale Sicherheit durch strenge CSP-Richtlinien. |

---

## 📖 User Story: Ein Tag mit vCard

> **Das Szenario:**
> Sie sind auf einer Fachmesse. Die Papier-Visitenkarten sind ausgegangen, aber Sie haben einen Stapel leerer NFC-Sticker dabei.
>
> **Die Lösung:**
> Sie zücken Ihr Handy, öffnen die **vCard App** (die auch im Flugmodus läuft). Sie tippen auf "Kontakt importieren", wählen sich selbst aus und ergänzen kurz die neue Durchwahl. Ein Klick auf "Schreiben", Sticker ans Handy halten – *Vibration* – fertig.
>
> **Das Ergebnis:**
> Sie kleben den Sticker auf Ihre Mappe. Ein Interessent fragt nach Ihren Daten. Sie halten die Mappe an sein Handy. *Pling!* Ihr vollständiger Kontakt mit Adresse und Firma öffnet sich auf seinem Display. Er drückt "Speichern". **Kein Tippen, kein Papier, kein Datenverlust.**

---

## 🚀 Installation

### Als Progressive Web App (empfohlen)

1. **Öffnen Sie die App** im Browser (Chrome, Edge, Safari)
2. **Tippen Sie auf das Teilen-Symbol** oder **Menü**
3. **Wählen Sie "Zum Startbildschirm hinzufügen"**
4. **Fertig!** Die App ist jetzt wie eine native App installiert

### Für Entwickler

```bash
# Repository klonen
git clone https://github.com/gunterstruck/vCard.git
cd vCard

# Mit einem lokalen Webserver starten (z.B. mit Python)
python -m http.server 8000

# Oder mit Node.js
npx http-server
```

Die App ist nun unter `http://localhost:8000` erreichbar.

---

## 💻 Technische Details

### Technologie-Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **PWA:** Service Worker, Web App Manifest
- **APIs:** Web NFC API, Contact Picker API
- **Offline:** Cache API, Service Worker Caching Strategy
- **Sicherheit:** Content Security Policy (CSP)
- **Standard:** vCard 3.0 (RFC 2426)

### Browser-Kompatibilität

| Browser | NFC Schreiben | NFC Lesen | PWA Installation |
|---------|---------------|-----------|------------------|
| Chrome (Android) | ✅ | ✅ | ✅ |
| Edge (Android) | ✅ | ✅ | ✅ |
| Samsung Internet | ✅ | ✅ | ✅ |
| Safari (iOS)* | ❌ | ✅ | ✅ |
| Firefox (Android)** | ❌ | ✅ | ✅ |

*iOS unterstützt NFC-Lesen ab iPhone 7, aber kein NFC-Schreiben über Web NFC API
**Firefox unterstützt die Web NFC API aktuell nicht vollständig

### Projektstruktur

```
vCard/
├── index.html              # Hauptseite
├── manifest.webmanifest    # PWA Manifest
├── sw.js                   # Service Worker
├── offline.html            # Offline-Fallback-Seite
├── assets/
│   ├── app.js             # Haupt-JavaScript-Logik
│   ├── style.css          # Haupt-Stylesheet
│   ├── theme-bootstrap.js # Theme-Initialisierung
│   ├── icon-192.png       # PWA Icon (klein)
│   ├── icon-512.png       # PWA Icon (groß)
│   └── datenschutz.html   # Datenschutzerklärung
└── core/
    ├── i18n.js            # Internationalisierung
    └── schema.js          # vCard Schema-Definitionen
```

---

## 🔧 Verwendung

### NFC-Tag beschreiben

1. **Wechseln Sie zum "Schreiben"-Tab**
2. **Füllen Sie das Formular aus** oder **importieren Sie einen Kontakt**
3. **Tippen Sie auf "Schreiben"**
4. **Halten Sie den NFC-Chip** an die Rückseite Ihres Smartphones
5. **Warten Sie auf die Bestätigung** (Vibration + Erfolgsmeldung)

### NFC-Tag lesen

1. **Wechseln Sie zum "Lesen"-Tab**
2. **Tippen Sie auf "Lesen"**
3. **Halten Sie den NFC-Chip** an Ihr Smartphone
4. **Die Kontaktdaten werden angezeigt**
5. Optional: **Speichern Sie den Kontakt** in Ihrem Adressbuch

### vCard-Datei importieren/exportieren

- **Import:** Klicken Sie auf "vCard laden" und wählen Sie eine `.vcf`-Datei
- **Export:** Klicken Sie auf "Als vCard speichern" nach dem Ausfüllen des Formulars

---

## 🔒 Datenschutz & Sicherheit

### Privacy by Design

- ✅ **Keine Server-Kommunikation** – Alle Daten bleiben auf Ihrem Gerät
- ✅ **Keine Cookies** – Außer für Theme-Präferenzen
- ✅ **Keine Tracking-Scripte** – Kein Google Analytics, kein Facebook Pixel
- ✅ **Keine Cloud-Speicherung** – Alle Verarbeitungen erfolgen lokal
- ✅ **Open Source** – Der gesamte Code ist transparent und prüfbar

### Content Security Policy

Die App verwendet eine strikte CSP, die nur lokale Ressourcen erlaubt:

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'self';
```

---

## 🌍 Internationalisierung

Die App unterstützt mehrere Sprachen durch das integrierte i18n-System. Die Sprachumschaltung erfolgt automatisch basierend auf den Browser-Einstellungen.

Unterstützte Sprachen:
- Deutsch (de)
- Weitere Sprachen können einfach hinzugefügt werden

---

## 📋 Systemanforderungen

### Für NFC-Schreiben (Write)
- Android 6.0 oder höher
- Browser mit Web NFC API Support (Chrome, Edge, Samsung Internet)
- NFC muss in den Geräteeinstellungen aktiviert sein

### Für NFC-Lesen (Read)
- Android 6.0+ oder iOS 11+
- NFC-fähiges Smartphone
- NFC aktiviert

### Für PWA-Installation
- Moderner Browser mit PWA-Support
- HTTPS-Verbindung (oder localhost für Entwicklung)

---

## 🤝 Mitwirken

Beiträge sind willkommen! Bitte beachten Sie:

1. **Forken Sie das Repository**
2. **Erstellen Sie einen Feature-Branch** (`git checkout -b feature/AmazingFeature`)
3. **Committen Sie Ihre Änderungen** (`git commit -m 'Add some AmazingFeature'`)
4. **Pushen Sie zum Branch** (`git push origin feature/AmazingFeature`)
5. **Öffnen Sie einen Pull Request**

---

## 📜 Lizenz

Dieses Projekt ist proprietär. Alle Rechte vorbehalten.

---

## 🆘 Support & Kontakt

Bei Fragen, Problemen oder Feature-Requests:

- **Issues:** [GitHub Issues](https://github.com/gunterstruck/vCard/issues)
- **Diskussionen:** [GitHub Discussions](https://github.com/gunterstruck/vCard/discussions)

---

## 🎯 Roadmap

### Geplante Features

- [ ] Multi-Profil-Verwaltung (mehrere vCards speichern)
- [ ] QR-Code-Generierung als Alternative zu NFC
- [ ] Erweiterte vCard-Felder (Social Media, Geburtstag, etc.)
- [ ] Batch-Schreiben für mehrere NFC-Tags
- [ ] Statistiken (wie viele Tags wurden beschrieben)
- [ ] Design-Anpassungen (Custom Branding)
- [ ] Cloud-Sync (optional, opt-in)

---

## 🙏 Danksagungen

- Icons von [eigenen Assets](assets/)
- vCard Standard: [RFC 2426](https://www.ietf.org/rfc/rfc2426.txt)
- Web NFC API: [W3C Specification](https://w3c.github.io/web-nfc/)

---

**Machen Sie Ihr Smartphone zum Networking-Tool.**
Nutzen Sie jetzt den **vCard NFC Writer** – sicher, lokal und immer bereit.

---

<div align="center">

  **Made with ❤️ for modern professionals**

  [Website](#) • [Demo](#) • [Dokumentation](#)

</div>
