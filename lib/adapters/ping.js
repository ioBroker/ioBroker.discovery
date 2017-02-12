
// just check if IP exists
function detect(ip, options, callback) {
    callback(null, !!ip, ip);
}

exports.detect = detect;
exports.type = 'ip';// make type=serial for USB sticks