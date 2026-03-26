# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.discovery is an ioBroker adapter that automatically detects devices and services on the local network (via ping, UPnP/SSDP, mDNS, TR-064, UDP, serial ports, etc.) and suggests appropriate ioBroker adapters for them. It is a singleton adapter (one instance per host).

## Commands

```bash
npm test          # Run mocha tests (validates package/io-package files)
npm run lint      # ESLint with @iobroker/eslint-config (flat config in eslint.config.mjs)
```

Release commands (uses @alcalzone/release-script):
```bash
npm run release-patch
npm run release-minor
npm run release-major
```

## Architecture

### Entry Point: main.js

The adapter starts via `startAdapter()` which creates a `utils.Adapter` instance. It listens for two messages from the admin UI:
- **`browse`**: triggers a full network discovery scan
- **`listMethods`**: returns available discovery methods

### Discovery Flow

1. **`browse()`** orchestrates the scan: loads methods and adapter modules, runs all enabled discovery methods in parallel
2. **Discovery methods** (`lib/methods/*.js`) scan the network and call `self.addDevice()` to populate a shared `g_devices` object
3. **`analyseDevices()`** iterates each discovered device and tests it against all adapter detection modules
4. Detection runs in two phases: first adapters with `dependencies=false` (in parallel for IP, sequential for serial), then adapters with `dependencies=true`
5. Results are stored in `system.discovery` ioBroker object with sensitive fields encrypted

### Discovery Methods (`lib/methods/`)

10 method modules (ping, upnp, mdns, tr064, udp, serial, speedwire, wifi-mi-light, hf-lpb100, vbus) plus a ping helper. Each exports:
- `browse(self)` - receives a Method wrapper with `addDevice()`, `done()`, `updateProgress()`, timeout helpers
- `source` - method identifier string
- `type` - device type it produces (e.g. `'ip'`, `'upnp'`)
- `timeout` - scan duration in ms

Methods are auto-loaded from `lib/methods/` by filename (excluding files starting with `_`).

### Adapter Detection Modules (`lib/adapters/`)

99 modules, each detecting a specific device/service type. Each exports:
- `detect(ip, device, options, callback)` - tests if a device matches; adds to `options.newInstances` if found
- `type` - string or array of device types to match against (e.g. `['ip']`, `['upnp']`, `'serial'`, `'advice'`)
- `timeout` - detection timeout in ms (default 2000)
- `dependencies` - if `true`, runs after base detection phase

Modules are auto-loaded from `lib/adapters/` by filename. The `options` object passed to `detect()` contains `newInstances`, `existingInstances`, `enums`, `language`, and `log`.

### Shared Utilities (`lib/tools.js`)

Key helpers used by adapter modules:
- `testPort(ip, port, timeout, options, callback)` - TCP port probe with optional custom request/response
- `httpGet(url, timeout, callback)` / `httpPost(url, data, timeout, callback)` - HTTP helpers
- `getNextInstanceID(name, options)` - generates next `system.adapter.NAME.N` ID
- `findInstance(options, name, filter)` - finds existing adapter instance by name and native config filter
- `getOwnAddress(ip)` - finds local IP on same subnet as target
- `openPort(name, options, onOpen, onReceived, callback)` - serial port communication

## Code Conventions

- Pure JavaScript (no TypeScript transpilation), Node.js >= 20
- Callback-based async patterns throughout (error-first callbacks, not Promises)
- ESLint uses `@iobroker/eslint-config` flat config; JSDoc rules are disabled
- Tests use `@iobroker/testing` framework with mocha
- Optional dependencies (`serialport`, `mdns-discovery`) are loaded with graceful fallback
