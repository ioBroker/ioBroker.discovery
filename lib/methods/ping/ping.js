'use strict';

const cp  = require('child_process');
const p   = require('os').platform().toLowerCase();

let isWin = false;
let init;
const xfamily = ['linux', 'sunos', 'unix'];
//const regex = /=.*[<|=]([0-9]*).*TTL|ttl..*=([0-9\.]*)/;
const regex = /=.*[<|=]([0-9]*).*?ttl.*?=([0-9.]*)/im;


exports.reset = function () {
    // if config changed
    init = null;
};

function probe (addr, config, callback) {
    config = config || {};

    let ls  = null;
    // const log = config.log || console.log;
    let outstring = '';

    if (!init) {
        init = function (ip) {
            let args = [];
            config = {
                numeric: config.numeric === undefined ? true : config.numeric,
                timeout: parseInt (config.timeout === undefined ? 2 : config.timeout, 10),
                minReply: parseInt (config.minReply === undefined ? 1 : config.minReply, 10),
                extra: config.extra || []
            };

            //const args    = [];

            if (xfamily.indexOf (p) !== -1) {
                //linux
                //args = [];
                if (config.numeric !== false) {
                    args.push ('-n');
                }

                if (config.timeout !== false) {
                    args.push (`-w ${config.timeout}`);
                }

                if (config.minReply !== false) {
                    args.push (`-c ${config.minReply}`);
                }

                if (config.extra !== false) {
                    args = args.concat (config.extra);
                }

                args.push(ip);
                //log('System command: /bin/ping ' + args.join(' '));
                init = function (ip) {
                    args[args.length-1] = ip;
                    return cp.spawn ('/bin/ping', args);
                };
            } else if (p.match (/^win/)) {
                //windows
                isWin = true;
                let _args = [];
                if (config.minReply !== false) {
                    _args.push (`-n ${config.minReply}`);
                }

                if (config.timeout !== false) {
                    _args.push (`-w ${config.timeout * 1000}`);
                }

                if (config.extra !== false) {
                    _args = _args.concat (config.extra);
                }

                _args.push(ip);

                args = [
                    '/s', // leave quotes as they are
                    '/c', // run and exit
                    // !!! order of c and s is important - c must come last!!!
                    '"', // enforce starting quote
                    `${process.env.SystemRoot}\\system32\\ping.exe` // command itself. Notice that you'll have to pass it quoted if it contains spaces
                ].concat (_args)
                    .concat ('"'); // enforce closing quote

                // log('System command: ' + (process.env.comspec || 'cmd.exe') + ' ' + allArgs.join(' '));
                // switch the command to cmd shell instead of the original command
                init = function (ip) {
                    args[args.length-2] = ip;
                    return cp.spawn(process.env.comspec || 'cmd.exe', args, {windowsVerbatimArguments: true});
                };
            } else if (p === 'darwin' || p === 'freebsd') {
                //mac osx or freebsd
                //args = [];
                if (config.numeric !== false) {
                    args.push ('-n');
                }

                if (config.timeout !== false) {
                    args.push (`-t ${config.timeout}`);
                }

                if (config.minReply !== false) {
                    args.push (`-c ${config.minReply}`);
                }

                if (config.extra !== false) {
                    args = args.concat (config.extra);
                }

                args.push(ip);
                //log('System command: /sbin/ping ' + args.join(' '));
                init = function (_ip) {
                    args[args.length - 1] = _ip;
                    return cp.spawn('/sbin/ping', args);
                };
            } else {
                return callback && callback(`Your platform "${p}" is not supported`);
            }
            return init(ip);
        };
    }

    ls = init(addr);

    ls.on('error', ( /* e */ ) => {
        callback && callback(new Error('ping.probe: there was an error while executing the ping program. check the path or permissions...'));
        callback = null;
    });

    ls.stdout.on('data', data => outstring += String(data));

    ls.on('exit', code => {
        let ms;
        let m; //, result = 1;
        if ((m = regex.exec(outstring)) && m.length >= 2) {
            ms = ~~m[1];
            //result = 0;
        }

        // const lines  = outstring.split('\n');
        // for (const t = 0; t < lines.length; t++) {
        //     const m = regex.exec(lines[t]) || '';
        //     if (m !== '') {
        //         ms = m[1];
        //         result = 0;
        //         break;
        //     }
        // }

        if (callback) {
            callback (null, {
                host:  addr,
                alive: isWin ? (ms !== undefined) : !code,
                ms:    ms
            });
            callback = null;
        }
    });
}

exports.probe = probe;