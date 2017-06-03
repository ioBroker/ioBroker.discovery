var tools = require(__dirname + '/../tools.js');
var dgram = require('dgram');
function addInstance(ip, device, options, callback) {

    var instance = tools.findInstance(options, 'lgtv', function (obj) {
        return obj.native.ip === ip;
    });
    
    if (!instance) {
        var id = tools.getNextInstanceID('lgtv', options);
        instance = {
            _id: id,
            common: {
                name: 'lgtv'
            },
            native: {
                ip: ip
            },
            comment: {
                add: 'LG WebOS TV - ' + ip
            }
        };
        options.newInstances.push(instance);
        return callback(true);
    }
    callback(false);
}

var _send_ssdp_discover = function(socket)
{
  var ssdp_rhost = "239.255.255.250";
  var ssdp_rport = 1900;
  var ssdp_msg = 'M-SEARCH * HTTP/1.1\r\n';
  ssdp_msg += 'HOST: 239.255.255.250:1900\r\n';
  ssdp_msg += 'MAN: "ssdp:discover"\r\n';
  ssdp_msg += 'MX: 30\r\n';
  ssdp_msg += "ST: urn:lge-com:service:webos-second-screen:1\r\n";
  ssdp_msg += "USER-AGENT: iOS/5.0 UDAP/2.0 iPhone/4\r\n\r\n";
  var message = new Buffer(ssdp_msg);
  socket.send(message, 0, message.length, ssdp_rport, ssdp_rhost, function(err, bytes) {
      if (err) throw err;
  });
};

var discover_ip = function(retry_timeout_seconds, tv_ip_found_callback)
{
  var server = dgram.createSocket('udp4');
  var timeout = 0;
  var cb = tv_ip_found_callback || undefined;
  if (retry_timeout_seconds && typeof(retry_timeout_seconds) === 'number') {
    timeout = retry_timeout_seconds;
  } else if (!tv_ip_found_callback && typeof(retry_timeout_seconds) === 'function') {
    cb = retry_timeout_seconds;
  }

  server.on('listening', function() {
    _send_ssdp_discover(server);
  });

  server.on('message', function(message, remote) {
    if (message.indexOf("LGE WebOS TV")) {
      server.close();
      if (cb) {
        cb(false, remote.address);
      }
    }
  });
  server.bind();
  return server;
};

function detect(ip, device, options, callback) {
    function cb(err, is, ip) {
        callback && callback(err, is, ip);
        callback = null;
    }
    if (device._source === 'upnp' || device._source === 'ip') {
		var retry_timeout = 10;
		discover_ip(retry_timeout, function(err, ipaddr) {
			if (!err) {
                addInstance (ipaddr, device, options, function (isAdded) {
					cb (null, isAdded, ip);
                });
                return;				
			}
			else options.log.info('LG TV ERR: ' + err);
            cb (null, false, ip);
        });
        return;
    }
    cb(null, false, ip);
}

exports.detect = detect;
exports.type = ['ip'];
