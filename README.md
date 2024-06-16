![Logo](admin/ariston-remotethermo.png)
# ioBroker.ariston-remotethermo

[![NPM version](https://img.shields.io/npm/v/iobroker.ariston-remotethermo.svg)](https://www.npmjs.com/package/iobroker.ariston-remotethermo)
[![Downloads](https://img.shields.io/npm/dm/iobroker.ariston-remotethermo.svg)](https://www.npmjs.com/package/iobroker.ariston-remotethermo)
![Number of Installations](https://iobroker.live/badges/ariston-remotethermo-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/ariston-remotethermo-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.ariston-remotethermo.png?downloads=true)](https://nodei.co/npm/iobroker.ariston-remotethermo/)

**Tests:** ![Test and Release](https://github.com/hb9tvk/ioBroker.ariston-remotethermo/workflows/Test%20and%20Release/badge.svg)

## ariston-remotethermo adapter for ioBroker

Adapter for Ariston Water Heaters (https://www.ariston.com/en-uk/) via Ariston-NET API.

In Switzerland, the devices are sold under the brand name 'domotec' (https://domotec.ch/produkte/warmwasser-waermepumpen-nuos-stand/)

To use the API, a cloud account on Ariston-NET is required, and the water heater needs to be connected to WiFi and registered on Ariston-NET. (https://www.ariston-net.remotethermo.com/).

Upon configuration of the adapter, the email address and password for the Ariston-NET needs to be supplied.

Known working models

* Domotec NUOS-III (probably same as Ariston NUOS PLUS WIFI)

Polling interval: There is a rate limit on the API so it should not be polled too often. Currently the interval is hardcoded to 5min (300 sec) which seems to be ok. Might become configurable in a future release.

## Changelog
### 0.0.4 (2024-06-16)

- fixing npm dependencies

### 0.0.3 (2024-06-16)

- fixed deployment

### 0.0.2 (2024-06-16)

- First published version

### 0.0.1

- In development stage

## License
MIT License

Copyright (c) 2024 hb9tvk <peter@kohler.name>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.