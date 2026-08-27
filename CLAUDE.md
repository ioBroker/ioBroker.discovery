# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.discovery is an ioBroker adapter that automatically detects devices and services on the local network (via ping, UPnP/SSDP, mDNS, TR-064, UDP, serial ports, etc.) and suggests appropriate ioBroker adapters for them. It is a singleton adapter (one instance per host).

The adapter has **no configuration dialog** (`common.adminUI.config = "none"`); the discovery UI lives in ioBroker.admin and talks to this adapter over `sendTo`.

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
  lib/methods/*.ts         10 discovery methods
  lib/adapters/*.ts        101 detection modules
  types/*.d.ts             ambient declarations for npm packages without typings
lib/i18n/*.json            translation data, not read by any code (Weblate target)
```

### Entry Point: src/main.ts

`DiscoveryAdapter extends utils.Adapter`. It listens for two messages from the admin UI:

- **`browse`**: triggers a full network discovery scan
- **`listMethods`**: returns available discovery methods

The compact-mode export at the end of the file (`require.main !== module`) must stay.

### Discovery Flow

1. **`browse()`** orchestrates the scan: loads methods and adapter modules, runs all enabled discovery methods in parallel
2. **Discovery methods** (`src/lib/methods/*.ts`) scan the network and call `self.addDevice()` to populate a shared device list
3. **`analyseDevices()`** iterates each discovered device and tests it against all detection modules
4. Detection runs in two phases: first modules with `dependencies=false` (in parallel for IP, sequential for serial), then modules with `dependencies=true`
5. Results are stored in the `system.discovery` object with sensitive fields encrypted

### Discovery Methods (`src/lib/methods/`)

10 method modules (ping, upnp, mdns, tr064, udp, serial, speedwire, wifi-mi-light, hf-lpb100, vbus) plus a ping helper in `methods/ping/`. Each exports:

- `browse(self)` - receives a `MethodInstance` wrapper with `addDevice()`, `done()`, `updateProgress()`, timeout helpers
- `source` - method identifier string
- `type` - device type it produces (e.g. `'ip'`, `'upnp'`)
- `timeout` - scan duration in ms

Methods are auto-loaded from `build/lib/methods/` by filename (excluding files starting with `_`).

### Detection Modules (`src/lib/adapters/`)

101 modules, each detecting a specific device/service type. Each exports:

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
