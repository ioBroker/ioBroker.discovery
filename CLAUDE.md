# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.discovery is an ioBroker adapter that automatically detects devices and services on the local network (via ping, UPnP/SSDP, mDNS, TR-064, UDP, serial ports, etc.) and suggests appropriate ioBroker adapters for them. It is a singleton adapter (one instance per host).

The discovery UI lives in ioBroker.admin and talks to this adapter over `sendTo`. The instance itself has a small
settings dialog (`admin/jsonConfig.json`, `common.adminUI.config = "json"`) for the scheduled scan and the ping
parameters - it was `"none"` until the scheduled scan needed somewhere to be switched on.

## Commands

```bash
npm run build     # tsc -p tsconfig.build.json  -> build/
npm run watch     # same, in watch mode
npm run check     # type check only, no emit
npm run lint      # ESLint with @iobroker/eslint-config (flat config in eslint.config.mjs)
npm run test:package      # validates package.json / io-package.json consistency
npm run test:integration  # mocha test/**/*.test.js - the detection module unit tests
npm test          # alias for test:package
```

The unit tests require the **compiled** modules from `build/`, so run `npm run build` first. `npm ci` does that automatically through the `prepare` script.

Release commands (uses @alcalzone/release-script):

```bash
npm run release-patch
npm run release-minor
npm run release-major
```

## Architecture

TypeScript sources live in `src/` and compile to CommonJS in `build/` (gitignored). `package.json` `main` points at `build/main.js`.

```
src/
  main.ts                  the adapter class + the Method/Browse wrappers
  lib/types.ts             every shared interface
  lib/adapter-config.d.ts  typed this.config, mirrors io-package.json native
  lib/tools.ts             helpers used by the detection modules
  lib/words.ts             translation dictionary
  lib/methods/*.ts         11 discovery methods
  lib/adapters/*.ts        156 detection modules
  lib/discovery-states.ts  the decisions behind the device tree and the scheduled scan
  types/*.d.ts             ambient declarations for npm packages without typings
lib/i18n/*.json            translation data for the discovery results, not read by any code (Weblate target)
admin/jsonConfig.json      the settings dialog, English texts only
admin/i18n/*.json          those texts in 11 languages, keyed by the English one
```

The two i18n directories are unrelated: `lib/i18n` belongs to what a scan reports, `admin/i18n` to the settings
dialog. `jsonConfig.json` carries `"i18n": true`, so every `label`, `help` and `text` in it is an English string
that admin looks up in `admin/i18n/<lang>.json` - do not put language objects back into the config, and add the
English text to all eleven files when a new one appears.

### Entry Point: src/main.ts

`DiscoveryAdapter extends utils.Adapter`. It listens for five messages:

- **`browse`**: runs a full network discovery scan and answers when it is over
- **`listMethods`**: returns available discovery methods (the raw modules, for the admin discovery dialog)
- **`getMethodList`**: the same methods as `{ label, value }` pairs, for the `selectSendTo` control in the settings
- **`startBrowse`**: starts a scan and answers straight away - a scan outlives any sendTo timeout, so the button in
  the settings cannot use `browse`
- **`getFoundDevices`**: the devices of the last scan as HTML, for the `textSendTo` control on the device tab

The compact-mode export at the end of the file (`require.main !== module`) must stay.

### Discovery Flow

1. **`browse()`** orchestrates the scan: loads methods and adapter modules, runs all enabled discovery methods in parallel
2. **Discovery methods** (`src/lib/methods/*.ts`) scan the network and call `self.addDevice()` to populate a shared device list
3. **`analyseDevices()`** iterates each discovered device and tests it against all detection modules
4. Detection runs in two phases: first modules with `dependencies=false` (in parallel for IP, sequential for serial), then modules with `dependencies=true`
5. Results are stored in the `system.discovery` object with sensitive fields encrypted

### Scheduled scan and the device tree

Two things happen around a scan besides writing `system.discovery`:

- `writeDeviceStates()` mirrors the devices of the last scan into `discovery.0.devices.<address>`, one channel per
  device with `address`, `name`, `type`, `source`, `suggested` and `lastSeen`, plus `discovery.0.lastScan`. It shows
  the *last* scan, not a history: channels of devices that did not turn up again are deleted.
- `scheduleAutoDetect()` / `runAutoDetect()` repeat a scan on a timer when `native.autoDetect` is set. A scan started
  from the admin dialog wins; the scheduled one skips that turn. Both the timer and the button of the settings
  dialog go through `discoveryStates.autoDetectMethods()`, which never answers with "every method": an empty
  selection falls back to `DEFAULT_AUTO_DETECT_METHODS` (`mdns`, `ping`, `udp`, `upnp`). `serial`, `tr064` and
  `speedwire` are deliberately not in it - the first opens every serial port of the host, the other two only find
  their own vendor. The `browse` message of the admin discovery dialog is not affected and still takes `null` for
  a full scan.

The settings dialog (`admin/jsonConfig.json`, texts in `admin/i18n/*.json`) has two tabs: the settings themselves, with a button that sends
`startBrowse` and `state` controls showing `scanRunning`, the two progress states and the two counters live; and a
device tab whose `textSendTo` renders the answer of `getFoundDevices`.

`onReady()` runs `migrateAdminUi()` before `main()`. js-controller does not carry a nested `common.adminUI` over on
an update, so an installation from before the dialog existed would keep `config: "none"` and never show a settings
button - `lib/migration.ts` repairs the adapter object and this instance.

The decisions of all of it (id sanitising, the state rows, which channels are stale, the interval floor, which
methods to run, the device table HTML) live in `src/lib/discovery-states.ts` and `src/lib/migration.ts`, covered by
`test/discovery-states.test.js` and `test/migration.test.js`. They are there and not
in `main.ts` because `main.ts` replaces its own `module.exports` for compact mode and can therefore export nothing a
test could reach.

Which detection modules claimed a device is recorded by `noteDetection()` at the three places where a module reports
a find - the proposals in `options.newInstances` no longer say which address they came from.

### Discovery Methods (`src/lib/methods/`)

11 method modules (ping, upnp, mdns, tr064, udp, serial, speedwire, wifi-mi-light, hf-lpb100, vbus, bambulab) plus a ping helper in `methods/ping/`. Each exports:

- `browse(self)` - receives a `MethodInstance` wrapper with `addDevice()`, `done()`, `updateProgress()`, timeout helpers
- `source` - method identifier string
- `type` - device type it produces (e.g. `'ip'`, `'upnp'`)
- `timeout` - scan duration in ms

Methods are auto-loaded from `build/lib/methods/` by filename (excluding files starting with `_`).

#### When ping may not be used

`methods/ping.ts` asks the loopback once per scan whether this host may send ICMP at all. An unprivileged LXC
container may not - `/bin/ping` there has neither `cap_net_raw` nor a `ping_group_range` that covers the ioBroker
user - and the scan would otherwise report the whole range as offline without a word in the log (issue #247).
`methods/ping/ping.ts` therefore reads stderr as well and marks such an answer as `denied`;
`methods/ping/fallback.ts` carries the warning text and the TCP connect sweep that then replaces the echo requests.
A refused connection counts as a find, so a closed port is not a wasted probe. `pingFallbackTcp` and
`pingFallbackPorts` switch it, `test/ping-fallback.test.js` covers it.

### Detection Modules (`src/lib/adapters/`)

156 modules, each detecting a specific device/service type. Each exports:

- `detect(ip, device, options, callback)` - tests if a device matches; adds to `options.newInstances` if found
- `type` - string or array of device types to match against (e.g. `['ip']`, `['upnp']`, `'serial'`, `'advice'`)
- `timeout` - detection timeout in ms (default 2000). **Keep this larger than the module's own timer** - main.ts arms its watchdog with this value *before* calling `detect()`, so an equal value makes the watchdog win the race.
- `dependencies` - if `true`, runs after the base detection phase

Modules are auto-loaded from `build/lib/adapters/` by filename. The `options` object passed to `detect()` is a `DetectOptions` and contains `newInstances`, `existingInstances`, `enums`, `language`, and `log`.

### Shared Utilities (`src/lib/tools.ts`)

Key helpers used by the detection modules:

- `testPort(ip, port, timeout, options, callback)` - TCP port probe with optional custom request/response
- `httpGet(url, timeout, callback)` - HTTP helper; returns a promise when called without a callback
- `ssdpScan(...)` / `udpScan(...)` - SSDP and raw UDP probes
- `getNextInstanceID(name, options)` - generates the next `system.adapter.NAME.N` ID
- `findInstance(options, name, filter)` - finds an existing adapter instance by name and native config filter
- `getOwnAddress(ip)` - finds the local IP on the same subnet as the target
- `testSerialPort(name, options, baudRates, onOpen, onReceived, callback)` - serial port probe

`testPort`, `ssdpScan`, `httpGet` and `getLocationDesc` accept several argument shapes; the overloads in `tools.ts` describe exactly which ones.

## Code Conventions

- TypeScript 6, Node.js >= 22.19, output is CommonJS (needed for the compact-mode export)
- Callback-based async patterns throughout (error-first callbacks, not Promises) - this is the module contract, do not "modernise" it
- Foreign protocol payloads are typed as `ProtocolData` on purpose (see the comment in `src/lib/types.ts`): every vendor puts different keys in them
- ESLint uses `@iobroker/eslint-config` flat config; only the JSDoc rules are disabled
- Tests use `@iobroker/testing` with mocha and **`node:assert`** - do not add an assertion library
- HTTP goes through `axios` or the `node:http` helpers in `tools.ts`; `request` must not come back
- Optional dependencies (`serialport`, `mdns-discovery`) are `require()`d lazily with a graceful fallback

## Known bugs kept during the TypeScript refactoring

These were faithfully translated rather than fixed, so that the refactoring diff stays reviewable. Each is marked with a comment in the source:

- `main.ts haltAllMethods()` iterates method **names**, so `method.halt` is always undefined and nothing is halted
- `tools.getLocationDesc()` reads `_locationDesc` but writes `w_locationDesc`, so the cache never hits
- `tools.httpGet()` reports twice when a non-200 answer carries a body
- `methods/mdns.ts` has an inverted `typeof self !== 'object'` guard
- `methods/hf-lpb100.ts` and `methods/speedwire.ts` call `log.console.error`, which does not exist
- `adapters/bshb.ts` calls `options.log.warning`, which does not exist
- `adapters/broadlink2.ts` calls `socket.sendto`, which does not exist on a dgram socket
