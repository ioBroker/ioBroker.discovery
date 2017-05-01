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

### Automatically Discovered

- Chromecast
- Daikin climate control
- fronius
- Homematic CCU (hm-rpc, hm-rega)
- Philips HUE
- InfluxDB
- MegaD
- mysensors USB/Serial (9600, 38400, 57600, 115200)
- Nut
- Ping
- RFLink (Serial 57600baud)
- Sonos
- SQL (MySQL, MSSQL, PostgreSQL)
- TR-064
- UPnP
- z-wave USB (Tested with Aeon Labs)
- Landroid
- SamsungTV
- Miele
- Yamaha
- Lightify

### Offered as additional adapters
- cloud
- History (if no SQL or InfluxDB found)
- flot (offered when a History-Adapter is present)
- JavaScript
- Mobile
- Vis
- Web

## Todo
- artnet? (Bluefox)
- B-Control-Em? (Bluefox)
- Broadlink (hieblemedia)
- cul / maxcul (Bluefox)
- epson_stylus_px830 (pix)
- harmony (pmant) / fakeroku (pmant)
- fhem (Bluefox)
- Foobar200 (Instalator)
- fritzbox (ruhr70)
- homepilot (Pix)
- km200 (frankjoke)
- knx (chefkoch009)
- kodi (instalator)
- lgtv (smundt)
- megaesp (ausHaus)
- modbus (Bluefox)
- mpd (instalator)
- mqtt/mqtt-client (Bluefox)
- onkyo (Bluefox)
- owfs (Bluefox)
- rpi2 (if ioBroker run on Raspberry)
- rwe-smarthome (PArns)
- s7 (Bluefox)
- smartmeter (Apollon77)
- unifi (jens-maus)
- wifilight (soef)
- wolf (smiling-jack)
- xs1 (frankjoke)
- squeezebox (unclesamswiss)


## Changelog
### 0.4.0 (2017-05-01)
* (soef) add SamsungTV, Lightify, Miele and yamaha
* (soef) add new discovery method mDNS

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
