
var assert = require('better-assert');
var crypto = require('crypto');
var config = require('../config/config');
var ip = require('ip');
// var checkip = require('check-ip');
var https = require('https');
var fs = require('fs');

// Import BTC addresses
// copy .addresses_btc.json file from Depositor project.
/// //////////////////////////////////////////////////////////////////////////

var depositAddresses = {};
depositAddresses['BTC'] = {};
depositAddresses['ETH'] = {};
depositAddresses['MDC'] = {};

if (config.TESTNET === true) {
    depositAddresses['BTC'] = JSON.parse(fs.readFileSync('./addresses_btc_testnet.json', 'utf8'));
    depositAddresses['ETH'] = JSON.parse(fs.readFileSync('./addresses_eth_testnet.json', 'utf8'));
    depositAddresses['MDC'] = JSON.parse(fs.readFileSync('./addresses_mdc_testnet.json', 'utf8'));

    console.log('web_server loaded [ addresses_btc_testnet.json ].');
} else {
    depositAddresses['BTC'] = JSON.parse(fs.readFileSync('./addresses_btc.json', 'utf8'));
    depositAddresses['ETH'] = JSON.parse(fs.readFileSync('./addresses_eth.json', 'utf8'));
    depositAddresses['MDC'] = JSON.parse(fs.readFileSync('./addresses_mdc.json', 'utf8'));

    console.log('web_server loaded [ addresses_btc.json ].');
}

var swapedDepositAddresses = {};
swapedDepositAddresses['BTC'] = {};
swapedDepositAddresses['ETH'] = {};
swapedDepositAddresses['MDC'] = {};

var nCapacityBTC = 0;
var nCapacityETH = 0;
var nCapacityMDC = 0;
for (var depAddress in depositAddresses['BTC']) {
    swapedDepositAddresses['BTC'][depositAddresses['BTC'][depAddress]] = depAddress;
    nCapacityBTC++;
}

for (var depAddress in depositAddresses['ETH']) {
    swapedDepositAddresses['ETH'][depositAddresses['ETH'][depAddress]] = depAddress;
    nCapacityETH++;
}

for (var depAddress in depositAddresses['MDC']) {
    swapedDepositAddresses['MDC'][depositAddresses['MDC'][depAddress]] = depAddress;
    nCapacityMDC++;
}

/// checking ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
console.log('Capacity :', nCapacityBTC, '___ MADABIT address :', swapedDepositAddresses['BTC'][1]);
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// /////////////////////////////////////////////////////////////////////////////////
var encKey = config.ENC_KEY;

exports.encrypt = function (text) {
    var cipher = crypto.createCipher('aes-256-cbc', encKey);
    var crypted = cipher.update(text, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
};

exports.randomHex = function (bytes) {
    var buff;

    try {
        buff = crypto.randomBytes(bytes);
    } catch (ex) {
        console.log('Caught exception when trying to generate hex: ', ex);
        buff = crypto.pseudoRandomBytes(bytes);
    }

    return buff.toString('hex');
};

exports.sha = function (str) {
    var shasum = crypto.createHash('sha256');
    shasum.update(str);
    return shasum.digest('hex');
};

exports.isInvalidUsername = function (input) {
    if (typeof input !== 'string') return 'NOT_STRING';
    if (input.length === 0) return 'NOT_PROVIDED';
    if (input.length < 3) return 'TOO_SHORT';
    if (input.length > 50) return 'TOO_LONG';
    if (!/^[a-z0-9_\-]*$/i.test(input)) return 'INVALID_CHARS';
    if (input === '__proto__') return 'INVALID_CHARS';
    return false;
};

exports.isInvalidPassword = function (password) {
    if (typeof password !== 'string') return 'NOT_STRING';
    if (password.length === 0) return 'NOT_PROVIDED';
    if (password.length < 7) return 'TOO_SHORT';
    if (password.length > 200) return 'TOO_LONG';
    return false;
};

exports.isInvalidEmail = function (email) {
    if (typeof email !== 'string') return 'NOT_STRING';
    if (email.length > 100) return 'TOO_LONG';
    if (email.indexOf('@') === -1) return 'NO_@'; // no @ sign
    if (!/^[-0-9a-zA-Z.+_]+@[-0-9a-zA-Z.+_]+\.[a-zA-Z]{2,4}$/i.test(email)) return 'NOT_A_VALID_EMAIL'; // contains whitespace
    return false;
};

exports.isUUIDv4 = function (uuid) {
    return (typeof uuid === 'string') && uuid.match(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i);
};

exports.isEligibleForGiveAway = function (lastGiveAway) {
    if (!lastGiveAway) { return true; }

    var created = new Date(lastGiveAway);
    var timeElapsed = (new Date().getTime() - created.getTime()) / 60000; // minutes elapsed since last giveaway

    if (timeElapsed > 60) { return true; }

    return Math.round(60 - timeElapsed);
};

var derivedPubKey = config.BIP32_DERIVED;

if (!derivedPubKey) { throw new Error('Must set env var BIP32_DERIVED_KEY'); }

// Get BTC deposit address
// var hdNode = bitcoinjs.HDNode.fromBase58(derivedPubKey);

// strCurrencyType : 'BTC', 'ETH'
exports.deriveAddress = function (index, strCurrencyType) {
    return swapedDepositAddresses[strCurrencyType][index];
};

exports.formatSatoshis = function (n, decimals) {
    if (typeof decimals === 'undefined') { decimals = 2; }

    return (n / 100).toFixed(decimals).toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};

exports.isInt = function isInteger (nVal) {
    return typeof nVal === 'number' && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
};

exports.hasOwnProperty = function (obj, propName) {
    return Object.prototype.hasOwnProperty.call(obj, propName);
};

exports.getOwnProperty = function (obj, propName) {
    return Object.prototype.hasOwnProperty.call(obj, propName) ? obj[propName] : undefined;
};

exports.parseTimeString = function (str) {
    var reg = /^\s*([1-9]\d*)([dhms])\s*$/;
    var match = str.match(reg);

    if (!match) { return null; }

    var num = parseInt(match[1]);
    switch (match[2]) {
        case 'd': num *= 24;
        case 'h': num *= 60;
        case 'm': num *= 60;
        case 's': num *= 1000;
    }

    assert(num > 0);
    return num;
};

exports.printTimeString = function (ms) {
    var days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (days >= 3) return '' + days + 'd';

    var hours = Math.ceil(ms / (60 * 60 * 1000));
    if (hours >= 3) return '' + hours + 'h';

    var minutes = Math.ceil(ms / (60 * 1000));
    if (minutes >= 3) return '' + minutes + 'm';

    var seconds = Math.ceil(ms / 1000);
    return '' + seconds + 's';
};

var secret = config.SIGNING_SECRET;

exports.sign = function (str) {
    return crypto
        .createHmac('sha256', secret)
        .update(str)
        .digest('base64');
};

exports.validateSignature = function (str, sig) {
    return exports.sign(str) == sig;
};

exports.removeNullsAndTrim = function (str) {
    if (typeof str === 'string') { return str.replace(/\0/g, '').trim(); } else { return str; }
};

exports.getEngineHost = function () {
    if (config.PRODUCTION === config.PRODUCTION_LOCAL) {
        var strIP = ip.address();
        return 'http://' + strIP + ':' + config.PORT_HTTP_G.toString();
    }

    var engineHost;
    if (config.PRODUCTION === config.PRODUCTION_LINUX) engineHost = config.ENGINE_HOST_LINUX;
    if (config.PRODUCTION === config.PRODUCTION_WINDOWS) engineHost = config.ENGINE_HOST_WINDOWS;

    return 'https://' + engineHost + ':' + config.PORT_HTTPS_G.toString();
};

exports.calculateNextPath = function (path) {
    if (path == null || path == '' || path == undefined) { return '000'; }

    // var lastPattern = path[path.length - 3] + path[path.length - 2] + path[path.length - 1];
    var lastPatternArray = [];
    lastPatternArray[0] = path[path.length - 3];
    lastPatternArray[1] = path[path.length - 2];
    lastPatternArray[2] = path[path.length - 1];

    var charArray = [], k = 0;

    /*
     compare letters in follow order.
     0-9, a, A, b, B, c, C,  ... , y, Y, z, Z
     */
    for (var i = 48; i <= 57; i++) { charArray[k++] = String.fromCharCode(i); }
    for (var i = 97; i <= 122; i++) {
        charArray[k++] = String.fromCharCode(i);
        charArray[k++] = String.fromCharCode(i - 32);
    }

    k--;

    var addToNext = 1;
    for (var i = 2; i >= 0; i--) {
        var index = charArray.indexOf(lastPatternArray[i]);
        if ((index + addToNext) <= k) {
            lastPatternArray[i] = charArray[index + addToNext];
            addToNext = 0;
        } else {
            addToNext = 1;
            if (i != 0) lastPatternArray[i] = 0;
            else console.log('Error : Path Length Limit');
        }
        if (addToNext == 0) break;
    }

    path = path.substr(0, path.length - 3);
    for (var i = 0; i <= 2; i++) { path += lastPatternArray[i]; }
    return path;

    // if(last2Path[1] == '9')
    //     last2Path = last2Path[0] + 'a';
    // else if(last2Path[1] == 'z')
    //     last2Path = last2Path[0] + 'A';
    // else if(last2Path[1] == 'Z') {
    //     last2Path = last2Path[0] + '0';
    //
    //     if(last2Path[0] == '9')
    //         last2Path = 'a' + last2Path[1];
    //     else if(last2Path[0] == 'z')
    //         last2Path = 'A' + last2Path[1];
    //     else last2Path = String.fromCharCode(last2Path[0].charCodeAt(0) + 1) + last2Path[1];
    //
    // } else {
    //     last2Path = last2Path[0] + String.fromCharCode(last2Path[1].charCodeAt(0) + 1);
    // }

    // path = path.substr(0, path.length - 2) + last2Path;
};

exports.getIntroUrl = function (username) {
    if (username === undefined || username === '') {
        console.log('lib.getIntroUrl : username : ', username);
        return 'https://' + config.SITE_URL_WINDOWS + '/register';
    }

    var b = new Buffer(username);
    var s = b.toString('base64');

    if (config.PRODUCTION === config.PRODUCTION_LOCAL) {
        var strIP = ip.address();
        return 'http://' + strIP + '/register/' + s;
    }

    var introUrl;
    if (config.PRODUCTION === config.PRODUCTION_LINUX) introUrl = config.SITE_URL_LINUX;
    if (config.PRODUCTION === config.PRODUCTION_WINDOWS) introUrl = config.SITE_URL_WINDOWS;

    return 'https://' + introUrl + '/register/' + s;
};

exports.decIntroUrl = function (enc_user) {
    var b = new Buffer(enc_user, 'base64');
    var s = b.toString();

    return s;
};

exports.getPhoneVerifyCode = function () {
    var fRand6Digits = Math.random() * (999999 - 100000) + 100000;
    var nRand6Digits = parseInt(fRand6Digits);
    return nRand6Digits.toString();
};

exports.clearPhoneNumber = function (phone_number) {
    if (phone_number == '') return '';

    if (phone_number.substr(0, 1) == '+') {
        phone_number = phone_number.substr(1, phone_number.length - 1);
    }

    var aryPhoneNumber = phone_number.split(' ');
    var nCnt = aryPhoneNumber.length;
    var strRealPhone = '';
    for (var nId = 0; nId < nCnt; nId++) {
        strRealPhone += aryPhoneNumber[nId];
    }

    return strRealPhone;
};

exports.getRandomPassword = function () {
    var fRand7Digits = Math.random() * (9999999 - 1000000) + 1000000;
    var nRand7Digits = parseInt(fRand7Digits);
    return nRand7Digits.toString();
};

exports.getGeoInfo = function (strIP, callback) {
    var optionsget = {
        host: 'usercountry.com',
        port: 443,
        path: '/v1.0/json/' + strIP,
        method: 'GET'
    };

    var reqGet = https.request(optionsget, function (res) {
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            var fbResponse = JSON.parse(body);

            if (fbResponse.status == 'failure') {
                var userInfo = {};
                userInfo.country = 'Cambodia';
                userInfo.city = 'Phnom Penh';
                userInfo.alpha_2 = 'KH';
                userInfo.alpha_3 = 'KHM';
                userInfo.phone = '855';

                return callback(null, userInfo);
            } else if (fbResponse.status == 'success') {
                var userInfo = {};
                userInfo.country = fbResponse.country.name;
                userInfo.city = fbResponse.region.city;
                userInfo.alpha_2 = fbResponse.country.alpha - 2;
                userInfo.alpha_3 = fbResponse.country.alpha - 3;
                userInfo.phone = fbResponse.country.phone;

                return callback(null, userInfo);
            }
        });

        res.on('error', function () {
            return callback('ERROR_1');
        });
    });
    reqGet.end();
};

exports.getCommaFloat = function (n, decimals) {
    if (typeof decimals === 'undefined') {
        if (n % 100 === 0) { decimals = 0; } else { decimals = 2; }
    }

    var original = n.toFixed(decimals);
    var aryOriginal = original.split('.');
    if (aryOriginal.length == 1) {
        return original.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
    }

    var result = aryOriginal[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,') + '.' + aryOriginal[1];
    return result;
};

exports.log = function (strMark, strMsg) {
    var today = new Date();
    var dd = today.getDate();
    var mm = today.getMonth() + 1;
    var yyyy = today.getFullYear();

    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;

    /// //////////////////////////////////////////////////////////////////////
    var strDir = './log';
    if (!fs.existsSync(strDir)) {
        fs.mkdirSync(strDir);
    }

    var strFile = strDir + '/w_' + yyyy + mm + dd + '.log';
    if (fs.existsSync(strFile) == false) {
        fs.closeSync(fs.openSync(strFile, 'w'));
    }

    /// ///
    var strLocalTime = today.toLocaleString();
    strMsg = strLocalTime + ' : ' + strMark + ' : ' + strMsg + '\r\n';
    fs.appendFile(strFile, strMsg, function (err) {
        if (err) return console.log(strFile, ':', strMark, ':', err);
    });
};
