'use strict';

const tools = require('../tools.js');

function detect(ip, device, options, callback) {
    // options.newInstances
    // options.existingInstances
    // device - additional info about device
    // options.log - logger
    // options.enums - {
    //      enum.rooms: {
    //          enum.rooms.ROOM1: {
    //              common: name
    //          }
    //      },
    //      enum.functions: {}
    // }

    // try to test TCP ports 2000, 2001, 2002
    let count = 0;
    // test hs485d
    let someFound = false;
    const name = ip + (device._name ? (' - ' + device._name) : '');

    // MS-SQL
    count++;
    tools.testPort(ip, 1433, {
        onConnect: (ip, port, client) => {
            // TODO !
            client.write(
                'POST / HTTP/1.1\r\n' +
                'User-Agent: NodeJS XML-RPC Client\r\n' +
                'Content-Type: text/xml\r\n' +
                'Accept: text/xml\r\n' +
                'Accept-Charset: UTF8\r\n' +
                'Connection: Keep-Alive\r\n' +
                'Content-Length: 98\r\n' +
                'Host: ' + ip + ':' + port + '\r\n' +
                '\r\n' +
                '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
        },
        onReceive: (data, ip, port, client) => data && !!data.toString().match(/<value>[.\d]+<\/value>/)
    }, (err, found, ip, port) => {
        if (found) {
            const instance = tools.findInstance(options, 'sql', obj =>
                (obj.native.host === ip || obj.native.host === device._name) && (obj.native.port === 1433 || !obj.native.port) && obj.native.dbtype === 'mssql');

            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('sql', options),
                    common: {
                        name: 'sql',
                        title: 'MS-SQL (' + name + ')'
                    },
                    native: {
                        host: ip,
                        port: 1433,
                        dbtype: 'mssql'
                    },
                    comment: {
                        add: ['MS-SQL (' + name + ')'],
                        inputs: [
                            {
                                name: 'native.user',
                                def: '',
                                type: 'text', // text, checkbox, number, select, password. Select requires
                                title: 'user' // see translation in words.js
                            },
                            {
                                name: 'native.password',
                                def: '',
                                type: 'password',
                                title: 'password' // see translation in words.js
                            }
                        ]
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });

    // test Postgres
    count++;
    tools.testPort(ip, 5432, {
        onConnect: (ip, port, client) => {
            // TODO !
            client.write(
                'POST / HTTP/1.1\r\n' +
                'User-Agent: NodeJS XML-RPC Client\r\n' +
                'Content-Type: text/xml\r\n' +
                'Accept: text/xml\r\n' +
                'Accept-Charset: UTF8\r\n' +
                'Connection: Keep-Alive\r\n' +
                'Content-Length: 98\r\n' +
                'Host: ' + ip + ':' + port + '\r\n' +
                '\r\n' +
                '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
        },
        onReceive: (data, ip, port, client) => data && !!data.toString().match(/<value>[.\d]+<\/value>/)
    }, (err, found, ip, port) => {
        if (found) {
            const instance = tools.findInstance(options, 'sql', obj =>
                (obj.native.host === ip || obj.native.host === device._name) && (obj.native.port === 5432 || !obj.native.port) && obj.native.dbtype === 'postgresql');

            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('sql', options),
                    common: {
                        name: 'sql',
                        title: 'PostgreSQL (' + name + ')'
                    },
                    native: {
                        host: ip,
                        port: 5432,
                        dbtype: 'postgresql'
                    },
                    comment: {
                        add: ['PostgreSQL (' + name + ')'],
                        inputs: [
                            {
                                name: 'native.user',
                                def: '',
                                type: 'text', // text, checkbox, number, select, password. Select requires
                                title: 'user' // see translation in words.js
                            },
                            {
                                name: 'native.password',
                                def: '',
                                type: 'password',
                                title: 'password' // see translation in words.js
                            }
                        ]
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });
    
    // test mysql
    count++;
    tools.testPort(ip, 3306, {
        onConnect: (ip, port, client) => {
            // TODO !
            client.write(
                'POST / HTTP/1.1\r\n' +
                'User-Agent: NodeJS XML-RPC Client\r\n' +
                'Content-Type: text/xml\r\n' +
                'Accept: text/xml\r\n' +
                'Accept-Charset: UTF8\r\n' +
                'Connection: Keep-Alive\r\n' +
                'Content-Length: 98\r\n' +
                'Host: ' + ip + ':' + port + '\r\n' +
                '\r\n' +
                '<?xml version="1.0"?><methodCall><methodName>getVersion</methodName><params></params></methodCall>');
        },
        onReceive: (data, ip, port, client) => data && !!data.toString().match(/<value>[.\d]+<\/value>/)
    }, function (err, found, ip, port) {
        if (found) {
            const instance = tools.findInstance(options, 'sql', obj =>
                (obj.native.host === ip || obj.native.host === device._name) && (obj.native.port === 3306 || !obj.native.port) && obj.native.dbtype === 'mysql');

            if (instance) found = false;

            if (found) {
                options.newInstances.push({
                    _id: tools.getNextInstanceID('sql', options),
                    common: {
                        name: 'sql',
                        title: 'MySQL (' + name + ')'
                    },
                    native: {
                        host: ip,
                        port: 3306,
                        dbtype: 'mysql'
                    },
                    comment: {
                        add: ['MySQL (' + name + ')'],
                        inputs: [
                            {
                                name: 'native.user',
                                def: '',
                                type: 'text', // text, checkbox, number, select, password. Select requires
                                title: 'user' // see translation in words.js
                            },
                            {
                                name: 'native.password',
                                def: '',
                                type: 'password',
                                title: 'password' // see translation in words.js
                            }
                        ]
                    }
                });
                someFound = true;
            }
        }
        if (!--count) callback(null, someFound, ip);
    });
}

exports.detect  = detect;
exports.type    = 'ip';// make type=serial for USB sticks
exports.timeout = 700;