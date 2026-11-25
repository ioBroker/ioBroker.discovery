# Discovery erweitern

Diese Anleitung richtet sich an Adapter-Entwickler, die möchten, dass der Discovery-Adapter ihre Geräte findet und
ihren Adapter vorschlägt. Eine Discovery-Funktion ist eine der Anforderungen für das Stable-Repository (siehe
[ioBroker.repositories Regeln](https://github.com/ioBroker/ioBroker.repositories#requirements-for-an-adapter-to-get-added-to-the-stable-repository)).

In den meisten Fällen umfasst die gesamte Änderung drei Dateien:

| Datei                                   | Inhalt                                                             |
|-----------------------------------------|--------------------------------------------------------------------|
| `src/lib/adapters/<adaptername>.ts`     | das Erkennungsmodul                                                |
| `test/adapters/<adaptername>.test.js`   | dessen Test, gespeist mit Daten eines echten Geräts               |
| `README.md`                             | eine Zeile in „Automatisch erkannt", ein Changelog-Eintrag        |

Es muss nichts weiter registriert werden: Die Module werden aus `build/lib/adapters/` anhand des Dateinamens geladen.

**Der Dateiname muss exakt dem Adapternamen entsprechen** (`myadapter.ts` für `iobroker.myadapter`). Discovery
lädt ein Modul nur, wenn ein Adapter dieses Namens im verwendeten Repository vorhanden ist, damit nie ein Adapter
vorgeschlagen wird, den der Benutzer nicht installieren kann. Ein Modul mit einem anderen Namen wird nie geladen.

## Wie ein Scan funktioniert

```
Discovery-Methoden         Geräte, gruppiert nach Typ          Erkennungsmodule             Admin
(src/lib/methods/)                                             (src/lib/adapters/)
 ping   ───────────────►  ip      192.168.1.10, .11, ...  ──►  jedes Modul mit type 'ip'
 mdns   ───────────────►  mdns    192.168.1.10, ...       ──►  jedes Modul mit type 'mdns'   ──► Vorschläge in
 upnp   ───────────────►  upnp    192.168.1.11, ...       ──►  jedes Modul mit type 'upnp'       system.discovery
 serial ───────────────►  serial  /dev/ttyUSB0, ...       ──►  jedes Modul mit type 'serial' ──► Discovery-Dialog
 ...                                                                                              erstellt Instanzen
```

1. Die Methoden scannen das Netzwerk und sammeln Geräte. Dieselbe Adresse kann mehrfach auftauchen, einmal pro
   Typ: `192.168.1.10` als `ip`-Gerät (hat auf Ping geantwortet) und als `mdns`-Gerät (hat einen Dienst
   angekündigt).
2. Jedes Gerät wird an jedes Modul weitergegeben, dessen `type` passt.
3. Ein Modul, das das Gerät erkennt, fügt einen **Vorschlag** zu `options.newInstances` hinzu.
4. Die Vorschläge werden in `system.discovery` gespeichert. Der Discovery-Dialog in Admin zeigt sie an und
   erstellt die vom Benutzer ausgewählten Instanzen.

## Vor dem Start

**Der Adapter muss im ioBroker-Repository vorhanden sein.** Discovery schlägt eine Instanz vor, und Admin
installiert den Adapter aus dem Repository, um sie zu erstellen. Zwei Prüfungen stellen das sicher:

- **Der Build** liest jeden Adapternamen, den ein Modul vorschlagen kann, und schlägt fehl, wenn einer nicht
  im neuesten Repository vorhanden ist (`node scripts/proposedAdapters.js`, läuft auch einmal pro Woche und
  öffnet ein Issue). Es liest das erste Argument von `tools.getNextInstanceID()` und
  `tools.proposeSharedInstance()` – übergib ein String-Literal oder eine `const`, und baue jeden Vorschlag
  mit einem der beiden, sonst fällt das Modul aus der Prüfung heraus.
- **Zur Laufzeit** läuft ein Modul nur, wenn sein Adapter im konfigurierten Repository vorhanden ist:
  Solange er nur in Latest ist, erhalten Benutzer auf Stable den Vorschlag nicht. Es geht nach dem
  **Dateinamen** – benenne das Modul nach dem zu erkennenden Adapter (`src/lib/adapters/<adaptername>.ts`),
  sonst läuft es nie.

**Finde heraus, wie das Gerät erkannt werden kann.** Wähle die erste Option, die funktioniert, in dieser
Reihenfolge:

| Option                                                                   | `type`   | Aufwand                                               | Wie herausfinden                                                                                                                              |
|--------------------------------------------------------------------------|----------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| mDNS-Dienstankündigung, z. B. `_wled._tcp`                               | `mdns`   | keiner – der Scan hat ihn bereits gesammelt           | Schaue, was die eigene Discovery des Adapters sucht; `avahi-browse -art` (Linux) oder `dns-sd -B _services._dns-sd._udp` (macOS/Windows)      |
| UPnP/SSDP-Antwort (`USN`, `SERVER`, `ST`, die Beschreibung bei `LOCATION`) | `upnp` | keiner – der Scan hat sie bereits gesammelt           | ein SSDP-Tool oder `gssdp-discover`                                                                                                           |
| Eine Antwort auf einem festen Port oder HTTP-Pfad                        | `ip`     | eine Anfrage an **jeden** Host, der auf Ping antwortet | `curl http://<gerät>/<pfad>`                                                                                                                  |
| Ein USB-/Seriell-Stick, der auf eine Anfrage antwortet                   | `serial` | öffnet jeden seriellen Port des Hosts                 | der eigene Code des Adapters                                                                                                                  |

Ein `ip`-Modul läuft gegen jede Adresse im Netzwerk – Drucker, NAS, Router, Geräte anderer Personen.
Verwende es nur, wenn das Gerät sich nicht selbst ankündigt.

**Kenne, was der Adapter in `native` benötigt.** Schaue dir `native` in der `io-package.json` des Adapters an.
Ein Vorschlag enthält nur die Werte, die die Erkennung herausgefunden hat (`host`, `port`, `model`, ...). Admin
legt sie beim Erstellen der Instanz über die Standardwerte des Adapters (`Object.assign`, eine Ebene tief),
also lass alles andere weg.

## Das Erkennungsmodul

### Vertrag

```ts
export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void;
export const type: string | string[];   // welche Geräte das Modul sehen möchte
export const timeout: number;            // ms, Standard 2000
export const dependencies?: unknown;     // truthy => nach allen anderen Modulen ausführen (hm-rega wartet auf hm-rpc)
```

- **Rufe `callback(null, found, ip)` genau einmal auf, auf jedem Pfad** – auch wenn nichts gefunden wurde und
  wenn etwas fehlgeschlagen ist. Ein zweiter Aufruf wird als Fehler protokolliert. Ein fehlender Aufruf
  blockiert das Gerät, bis der Watchdog auslöst.
- **`found` ist nur dann `true`, wenn das Modul einen Vorschlag hinzugefügt oder erweitert hat.** Ein Gerät,
  das bereits eine Instanz hat, wird erkannt, aber `found` ist `false`.
- **`timeout` muss größer sein als alles, worauf das Modul wartet.** Der Kern startet seinen Watchdog mit
  diesem Wert *bevor* er `detect()` aufruft. Wenn beide gleich sind, gewinnt der Watchdog.
- Fehler werden nicht geworfen. Eine fehlgeschlagene Anfrage bedeutet „nicht gefunden": `callback(null, false, ip)`.
- Der Vertrag ist callback-basiert – behalte das so. Innerhalb des Moduls sind Promises in Ordnung.

### Gerätetypen

| `type`   | `detect()` wird aufgerufen                              | Was das Gerät enthält                                                              |
|----------|---------------------------------------------------------|------------------------------------------------------------------------------------|
| `ip`     | für jede Adresse, die auf Ping geantwortet hat          | `_addr`, `_name`                                                                   |
| `mdns`   | für jede Adresse, die einen mDNS-Dienst angekündigt hat | `_mdns` – verwende `tools.hasMdnsService()`, `tools.mdnsName()`, `tools.mdnsTxt()` |
| `upnp`   | für jede Adresse, die auf SSDP geantwortet hat          | `_upnp`: ein Array von Header-Maps; `_location` enthält den Body von `LOCATION`    |
| `serial` | für jeden seriellen Port                                | `_addr` ist der Portname; prüfe mit `tools.testSerialPort()`                       |
| `udp`    | einmal, `_addr` ist `255.255.255.255`                   | sende deinen eigenen Broadcast mit `tools.udpScan()`                               |
| `once`   | einmal pro Scan, `_addr` ist `0.0.0.0`                  | für Listener, z. B. Multicast                                                      |
| `advice` | einmal am Ende, `detect(null, null, ...)`               | Vorschläge ohne Gerät (javascript, history, web, ...)                              |

### Vorschläge

Es gibt zwei Arten von Adaptern und daher zwei Arten von Vorschlägen.

**Eine Instanz pro Gerät** – der Adapter speichert die Adresse seines Geräts in `native`:

```ts
if (tools.findInstance(options, adapterName, obj => obj.native?.host === ip)) {
    return callback(null, false, ip); // bereits konfiguriert
}
options.newInstances.push({
    _id: tools.getNextInstanceID(adapterName, options),
    common: { name: adapterName },
    native: { host: ip },
    comment: { add: [name, ip] }, // was der Dialog als „gefunden" anzeigt
});
callback(null, true, ip);
```

**Eine Instanz für alle Geräte** – der Adapter findet seine Geräte selbst und speichert keine Adresse in
`native` (shelly, wled, homewizard, ...). Der erste Fund erstellt den Vorschlag, jeder weitere Fund wird
seiner Liste hinzugefügt, und eine bestehende Instanz wird als „erweitert" angeboten:

```ts
callback(null, tools.proposeSharedInstance(adapterName, `${name} (${ip})`, options), ip);
```

**Werte, die die Erkennung nicht kennen kann** (ein Zugangscode, ein Benutzername) werden im Dialog mit
`comment.inputs` abgefragt. Der Wert geht in das in `name` genannte Attribut:

```ts
comment: {
    add: [name, ip],
    inputs: [
        { name: 'native.user', def: '', type: 'text', title: 'Benutzername' },
        { name: 'native.password', def: '', type: 'password', title: 'Passwort' },
    ],
},
```

Eingabetypen, die der Dialog versteht: `text`, `password`, `checkbox`, `select` (mit `options`), `link`
(ein Button, die URL in `def`) und `comment` (eine Textzeile, in `def`).

### Beispiel: mDNS

```ts
import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'myadapter';

// Was das Gerät ankündigt – gesehen mit `avahi-browse -r` an einem Foo Bar 3000, Firmware 2.1
const SERVICE = '_foobar._tcp';

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (!tools.hasMdnsService(device, SERVICE)) {
        return callback(null, false, ip);
    }

    // Eine Instanz pro Gerät, adressiert über `native.host`
    if (tools.findInstance(options, adapterName, obj => obj.native?.host === ip)) {
        return callback(null, false, ip);
    }

    const name = tools.mdnsName(device) || 'Foo Bar';
    options.log.debug(`Foo Bar erkannt bei ${ip}`);
    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: { name: adapterName },
        native: { host: ip },
        comment: { add: [name, ip] },
    });
    callback(null, true, ip);
}

export const type = ['mdns'];
export const timeout = 1500;
```

Echte Module zum Lesen: `wled.ts` und `shelly.ts` (mDNS, geteilte Instanz), `blackmagic-atem.ts` (mDNS,
eine Instanz pro Gerät), `bosesoundtouch.ts` (UPnP), `awtrix-light.ts` (HTTP-Probe), `alpha2.ts`
(HTTP-Probe eines Geräts, das nur eine Verbindung gleichzeitig erlaubt).

### Beispiel: HTTP-Probe

Nur wenn das Gerät sich nicht selbst ankündigt. Frage nach etwas, das das Gerät zweifelsfrei identifiziert,
nicht nur „Port 80 antwortet":

```ts
const PORT = 80;
const PROBE_TIMEOUT = 1000;

export function detect(ip: string, _device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    if (tools.findInstance(options, adapterName, obj => obj.native?.host === ip)) {
        return callback(null, false, ip); // der Adapter spricht bereits damit, in Ruhe lassen
    }

    // ohne Callback gibt httpGet ein Promise zurück: abgelehnt bei Fehlern und Nicht-200-Antworten
    tools
        .httpGet(`http://${ip}:${PORT}/api/info`, PROBE_TIMEOUT)
        .then(body => {
            let info: { vendor?: string; model?: string } | null = null;
            try {
                info = body ? JSON.parse(body) : null;
            } catch {
                // kein JSON – nicht unser Gerät
            }
            if (info?.vendor !== 'FooBar Inc.') {
                return callback(null, false, ip);
            }
            options.newInstances.push({
                _id: tools.getNextInstanceID(adapterName, options),
                common: { name: adapterName },
                native: { host: ip },
                comment: { add: [info.model || 'Foo Bar', ip] },
            });
            callback(null, true, ip);
        })
        .catch(() => callback(null, false, ip));
}

export const type = ['ip'];
export const timeout = PROBE_TIMEOUT + 500;
```

### Regeln

- **Nur lesen.** Identifiziere das Gerät, nichts weiter: keine Schreibzugriffe, keine Anmeldeversuche, keine
  Standardpasswörter, nichts, das eine Einstellung oder einen Zustand des Geräts ändert.
- **So wenig wie möglich abfragen.** Eine Anfrage mit kurzem Timeout. Prüfe zuerst die günstige Sache. Lass
  Geräte in Ruhe, die bereits eine Instanz haben – der Adapter kommuniziert bereits mit ihnen.
- **Spezifisch sein.** Passe auf etwas, das nur dieses Gerät sendet: den Diensttyp plus einen TXT-Eintrag,
  einen Modell-String, ein Vendor-Feld. Ein Falschpositiv schlägt jedem Benutzer, der ein solches Gerät hat,
  den falschen Adapter vor.
- **Keine Geheimnisse in einem Vorschlag.** Vorschläge werden in `system.discovery` gespeichert und im Dialog
  angezeigt. Kopiere keine Token oder Passwörter aus der Geräteantwort in `native` oder `comment` – frage
  den Benutzer stattdessen mit einem `inputs`-Feld vom Typ `password`.
- **Abhängigkeiten.** HTTP läuft über `tools.httpGet()`, `axios` oder `node:http`. Füge kein Paket für eine
  einzelne Anfrage hinzu; ein optionales Paket wird lazy mit `require()` und einem Fallback geladen.
- **Kommentiere das Warum.** Schreibe auf, woher ein Dienstname, ein Port oder ein magischer String kommt
  (Adapter-Quellcode, Herstellerdokumentation, ein Mitschnitt von einem echten Gerät). Die nächste Person
  wird es wissen müssen.

## Test

Jedes Modul erhält einen Test in `test/adapters/<adaptername>.test.js` (mocha, `node:assert`, keine weitere
Assertion-Bibliothek). Speise ihn mit den Daten, die ein echtes Gerät geliefert hat – die Ausgabe von
`avahi-browse -r`, die SSDP-Header, die HTTP-Antwort – und decke mindestens ab:

- das Gerät wird gefunden und der Vorschlag sieht wie erwartet aus (`_id`, `native`, `comment`),
- ein Gerät, das bereits eine Instanz hat, wird übersprungen,
- ein ähnliches Gerät einer anderen Art wird **nicht** gefunden.

```js
const assert = require('node:assert');
const path = require('node:path');

const mod = require(path.join('..', '..', 'build', 'lib', 'adapters', 'myadapter.js'));

function freshOptions(existingInstances = []) {
    return {
        newInstances: [],
        existingInstances,
        enums: null,
        language: 'en',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

// wie von einem Foo Bar 3000 angekündigt (avahi-browse -r)
const device = {
    _addr: '192.168.1.50',
    _type: 'mdns',
    _mdns: {
        PTR: { name: '_foobar._tcp.local', data: 'Living room._foobar._tcp.local' },
        SRV: { name: 'Living room._foobar._tcp.local', data: 'foobar-3000.local' },
    },
};

function detect(dev, options, ip = '192.168.1.50') {
    return new Promise(resolve => mod.detect(ip, dev, options, (err, found) => resolve({ err, found })));
}

describe('myadapter Erkennung', () => {
    it('schlägt eine Instanz pro Gerät vor', async () => {
        const options = freshOptions();
        const { found } = await detect(device, options);
        assert.strictEqual(found, true);
        assert.deepStrictEqual(options.newInstances[0].native, { host: '192.168.1.50' });
    });

    it('überspringt ein Gerät, das bereits eine Instanz hat', async () => {
        const options = freshOptions([
            { _id: 'system.adapter.myadapter.0', common: { name: 'myadapter' }, native: { host: '192.168.1.50' } },
        ]);
        const { found } = await detect(device, options);
        assert.strictEqual(found, false);
        assert.strictEqual(options.newInstances.length, 0);
    });
});
```

Die Tests laden das **kompilierte** Modul aus `build/`, also zuerst bauen:

```bash
npm install
npm run build:tsc          # TypeScript -> build/
npm run test:integration   # alle Tests in test/**/*.test.js
npm run lint
npm run check              # Typprüfung
node scripts/proposedAdapters.js   # ist jeder vorgeschlagene Adapter im neuesten Repository? (Netzwerk)
```

### Auf einer echten Installation

Führe den Adapter mit [dev-server](https://github.com/ioBroker/dev-server) oder in einer Testinstallation
aus, setze den Log-Level von `discovery.0` auf `debug` und starte einen Scan vom Discovery-Dialog. Ein Fund
erscheint als

```
Test 192.168.1.50 myadapter DETECTED!
```

und der Vorschlag erscheint im Dialog. Während der Arbeit an einem Modul lädt `export const reloadModule = true;`
es bei jedem Scan neu – entferne es vor dem Pull-Request.

## Pull-Request

1. Füge in `README.md` das Gerät zu „Automatically Discovered" (alphabetisch) und einen Changelog-Eintrag
   unter `### **WORK IN PROGRESS**` am Anfang des Changelogs hinzu (füge die Überschrift hinzu, falls sie
   noch nicht vorhanden ist):

   ```
   * (dein-github-name) Erkenne Foo-Bar-Geräte anhand ihrer `_foobar._tcp`-mDNS-Ankündigung und schlage den myadapter-Adapter vor
   ```

2. Ändere nicht die Version in `package.json` oder `io-package.json` – die Maintainer machen das Release.
3. Ein Adapter pro Pull-Request. In der Beschreibung: mit welchem Gerät und welcher Firmware es getestet
   wurde, wie das Gerät sich ankündigt, und der Mitschnitt, auf dem der Test basiert.
