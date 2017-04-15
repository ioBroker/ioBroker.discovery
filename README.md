![Logo](admin/discovery.png)
ioBroker Discover Adapter
==============
[![NPM version](http://img.shields.io/npm/v/iobroker.discovery.svg)](https://www.npmjs.com/package/iobroker.discovery)
[![Downloads](https://img.shields.io/npm/dm/iobroker.discovery.svg)](https://www.npmjs.com/package/iobroker.discovery)
[![Tests](https://travis-ci.org/ioBroker/ioBroker.discovery.svg?branch=master)](https://travis-ci.org/ioBroker/ioBroker.discovery)

[![NPM](https://nodei.co/npm/iobroker.discovery.png?downloads=true)](https://nodei.co/npm/iobroker.discovery/)

# Detect devices with all known methods.

This is special adapters, that tries to find all possible devices, that can be reachable from host.
Just now it can detect via ping, UPnP (serial planned).

## Actually supported

- ping
- hm-rpc
- hm-rega
- sonos
- nut
- tr-064
- fronius
- chromecast
- z-wave USB (Tested with Aeon Labs)
- rflink (57600)
- mysensors USB/Serial (9600, 38400, 57600, 115200)
- Daikin climate control
- philips HUE

## Changelog
### 0.3.3 (2017-04-15)
* (bluefox) add philips HUE

### 0.3.2 (2017-04-12)
* (bluefox) Add mysensors USB/Serial

### 0.3.1 (2017-04-01)
* (apollon77) Add Daikin climate control

### 0.3.0 (2017-03-27)
* (bluefox) Fixed serial discovery

### 0.2.3 (2017-03-18)
* (bluefox) fix license dialog
* (bluefox) add zwave
* (bluefox) add sqllite and flot
* (bluefox) ack => ignore
* (bluefox) add megad
* (apollon77) add history
* (apollon77) enhance/fix sql-sqlite
* (apollon77) add InfluxDB
* (ykuendig) german translation updated

### 0.2.2 (2017-03-18)
* (bluefox) Fix typo

### 0.2.1 (2017-03-15)
* (bluefox) initial commit

## License

The MIT License (MIT)

Copyright (c) 2017, bluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
