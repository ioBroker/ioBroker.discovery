'use strict';

const tools = require('../tools.js');

/* copied from here: https://github.com/hughsk/flat/blob/master/index.js#L7 */
/*
Copyright (c) 2014, Hugh Kennedy
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the  nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
function flatten (target, opts) {
    opts = opts || {};

    const delimiter = opts.delimiter || '.';
    const maxDepth = opts.maxDepth;
    const output = {};

    function step (object, prev, currentDepth) {
        currentDepth = currentDepth || 1;
        Object.keys(object).forEach(key => {
            const value = object[key];
            const isArray = opts.safe && Array.isArray(value);
            const type = Object.prototype.toString.call(value);
            const isBuffer = Buffer.isBuffer(value);
            const isObject = type === '[object Object]' || type === '[object Array]';

            const newKey = prev ? prev + delimiter + key : key;

            if (!isArray && !isBuffer && isObject && Object.keys(value).length && (!opts.maxDepth || currentDepth < maxDepth)) {
                return step(value, newKey, currentDepth + 1);
            }

            output[newKey] = value;
        });
    }

    step(target);

    return output;
}

function addInstance(ip, device, options, native, callback) {
    let instance = tools.findInstance(options, 'ebus', obj => obj.native.targetIP === ip);
    if (!instance) {
        options.log.debug('ebus no instance found; add');
        instance = {
            _id: tools.getNextInstanceID('ebus', options),
            common: {
                name: 'ebus',
                title: 'ebus (' + ip + ')'
            },
            native: {
                targetIP: ip,
                interfacetype: 'ebusd',
                targetHTTPPort: 8889,
                targetTelnetPort: 8890
            },
            comment: {
                add: [ip]
            }
        };
        options.newInstances.push(instance);
        callback(null, true, ip);
    } else {
        options.log.debug('ebus instance already there');
        callback(null, false, ip);
    }
}

function detect(ip, device, options, callback) {
    const sUrl = `http://${ip}:8889/data`;

    tools.httpGet(sUrl, 1400, (error, body) => {
        try {
            if (!error && body) {
                const oData = JSON.parse(body);
                const newData = flatten(oData);
                const keys = Object.keys(newData);

                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const subNames = key.split('.');
                    // const temp = subnames.length;

                    if (subNames[0].includes('global') && subNames[1].includes('version')) {
                        //var value = newData[key];
                        //versions check?? to do

                        options.log.info('ebus found; call addInstance');
                        return addInstance(ip, device, options, {ip}, callback);
                    }
                }
                callback(null, false, ip);
            }
            else {
                callback(null, false, ip);
            }
        } catch (e) {
            options.log.error('ebus exception in detect [' + e + ']');
            callback && callback(null, false, ip);
        }
    });
}

exports.detect = detect;
exports.type = ['ip'];
exports.timeout = 1500;
