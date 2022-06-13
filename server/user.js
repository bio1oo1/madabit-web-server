
var assert = require('better-assert');
var async = require('async');
var bitcoinjs = require('bitcoinjs-lib');
var timeago = require('timeago');
var lib = require('./lib');
var database = require('./database');
var withdraw = require('./withdraw');
var sendEmail = require('./sendEmail');
var speakeasy = require('speakeasy');
var qr = require('qr-image');
var uuid = require('uuid');
var _ = require('lodash');
var config = require('../config/config');
var Jimp = require('jimp');
var fs = require('fs');
var web3 = require('./web3_client').web3;
var querystring = require('querystring');
var request = require('request');

var secure;
if (config.PRODUCTION === config.PRODUCTION_LINUX) secure = true;
if (config.PRODUCTION === config.PRODUCTION_WINDOWS) secure = true;

var sessionOptions = {
    httpOnly: true,
    // secure : secure
    secure: false
};

var otcUrl = null;
if (config.PRODUCTION === 'LOCAL') {
    otcUrl = config.OTC_WITHDRAW_URL_LOCAL;
} else if (config.PRODUCTION === 'LINUX') {
    otcUrl = config.OTC_WITHDRAW_URL_TEST_SERVER;
} else if (config.PRODUCTION === 'WINDOWS') {
    otcUrl = config.OTC_WITHDRAW_URL_REAL_SERVER;
}

// 20180404
// send verification code to phone_number
function sendVerificationCode (strPhoneNumber, strVerificationCode, strCodec, callback) {
    var codec;
    var strMsg;
    // message content should be changed to hex strings
    // english can be well done with ascii string
    // but, chinese , korean, japanese ... should be coverted to UTF-16BE codec
    if (strCodec === 'en') {
        codec = '0';
        strMsg = 'Your MADABIT Verification Code is ' + strVerificationCode;
        strMsg = Buffer.from(strMsg, 'utf8').toString('hex');
    } else if (strCodec === 'zh') {
        codec = '8';
        var strVHCode = Buffer.from(strVerificationCode, 'utf8').toString('hex');
        var nLen = strVHCode.length;

        var strUTF16BE = '';
        for (var nId = 0; nId < nLen; nId += 2) {
            strUTF16BE += '00' + strVHCode.substr(nId, 2);
        }

        // MADABIT验证码：137695。验证码有效5分钟 。【疯点】
        strMsg = '004D0041004400410042004900549A8C8BC17801FF1A0020' + strUTF16BE + '002030029A8C8BC178016709654800355206949F0020301075AF70B93011';
    }

    var form = {
        Src: 'beneforex2018',
        Pwd: 'baofu123',
        // Src: 'chourvuthy',
        // Pwd: 'lPG_!5rVM9O_J_<r6T',
        Dest: strPhoneNumber,
        Codec: codec,
        Msg: strMsg,
        Servicesid: 'SEND'
    };

    var formData = querystring.stringify(form);
    var contentLength = formData.length;

    request({
        headers: {
            'Content-Length': contentLength,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        uri: 'http://m.isms360.com:8085/mt/MT3.ashx',
        body: formData,
        method: 'POST'
    }, function (err, res, body) {
        if (err) {
            lib.log('error', 'sms - send verification code - error:' + err);
            return callback(err);
        }

        console.log('sms : ', strPhoneNumber, strVerificationCode, body);
        lib.log('info', 'sms - send verification code - phone_number:' + strPhoneNumber + '   verification_code:' + strVerificationCode + '   return:' + body);
        return callback(null, body);
    });
}

// when user forgot pasowrd, send random passord to his phone
function sendNewPassword (strPhoneNumber, strNewPassword, strCodec, callback) {
    var codec;
    var strMsg;
    if (strCodec == 'en') {
        codec = '0';
        strMsg = 'Your MADABIT password is ' + strNewPassword;
        strMsg = Buffer.from(strMsg, 'utf8').toString('hex');
    } else if (strCodec == 'zh') {
        codec = '8';
        var strVHCode = Buffer.from(strNewPassword, 'utf8').toString('hex');
        var nLen = strVHCode.length;

        var strUTF16BE = '';
        for (var nId = 0; nId < nLen; nId += 2) {
            strUTF16BE += '00' + strVHCode.substr(nId, 2);
        }

        strMsg = '004D0041004400410042004900549A8C8BC17801FF1A0020' + strUTF16BE + '002030029A8C8BC178016709654800355206949F0020301075AF70B93011';
    }

    var form = {
        Src: 'beneforex2018',
        Pwd: 'baofu123',
        // Src: 'chourvuthy',
        // Pwd: 'lPG_!5rVM9O_J_<r6T',
        Dest: strPhoneNumber,
        Codec: codec,
        Msg: strMsg,
        Servicesid: 'SEND'
    };

    var formData = querystring.stringify(form);
    var contentLength = formData.length;

    request({
        headers: {
            'Content-Length': contentLength,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        uri: 'http://m.isms360.com:8085/mt/MT3.ashx',
        body: formData,
        method: 'POST'
    }, function (err, res, body) {
        if (err) {
            lib.log('error', 'sms - send new password - error:' + err);
            return callback(err);
        }

        console.log('sms - phone_number:' + strPhoneNumber + '   return:' + body);
        lib.log('info', 'sms - send verification code - phone_number:' + strPhoneNumber + '   verification_code:' + strNewPassword + '   return:' + body);
        return callback(null);
    });
}

/**
 * Register a user
 * @updated by Bio
 */
exports.register = function (req, res, next) {
    var values = {};

    // var recaptcha = lib.removeNullsAndTrim(req.body['g-recaptcha-response']);
    var username = lib.removeNullsAndTrim(req.body.username);
    var phone_number = lib.removeNullsAndTrim(req.body.phone_number);
    var phone_dial_code = lib.removeNullsAndTrim(req.body.phone_dial_code);
    var password = lib.removeNullsAndTrim(req.body.password);
    var password2 = lib.removeNullsAndTrim(req.body.confirm);
    var ref_id = lib.removeNullsAndTrim(req.body.ref_id); // referral ID of Agent System
    var email = lib.removeNullsAndTrim(req.body.email);

    if (email == undefined) email = '';

    phone_number = lib.clearPhoneNumber(phone_dial_code + phone_number);

    var renderPage = 'register';

    console.log('register - [begin] - username:' + username + '   phone_number:' + phone_number + '   ref_id:' + ref_id + '   ip:' + req.ip);
    lib.log('info', 'register - [begin] - username:' + username + '   phone_number:' + phone_number + '   ref_id:' + ref_id + '   ip:' + req.ip);

    if (req.headers.referer.includes('register') == false) {
        renderPage = 'index';
        req.originalUrl = '/';
    }

    /* if(recaptcha == "")
        return res.render('register', {
            warning: 'Recaptach is not valid.',
            values: values
        }); */

    values.username = username;
    values.phone_number = phone_number;
    values.password = password;
    values.confirm = password2;
    values.ref_id = ref_id;
    values.email = email;
    // values.recaptcha = recaptcha;

    // check super admin
    var superAdminInfo = JSON.parse(fs.readFileSync(__dirname + '/../admin.json')); // read admin.json
    if (username === superAdminInfo.username && password === superAdminInfo.password) { // if the username and password is same as superadmin in admin.json
        console.log('register - name is same with [superadmin]');
        lib.log('info', 'register with superadmin');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert3',
            values: values
        });
    }

    var ipAddress = req.ip;

    var userAgent = req.get('user-agent'); // infomation of browser

    var notValid = lib.isInvalidUsername(username);
    if (notValid) {
        console.log('register - username is not valid');
        lib.log('info', 'register - username is not valid');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert4',
            values: values
        });
    }

    // stop new registrations of >16 char usernames
    if (username.length > 16) {
        console.log('register - username is too long');
        lib.log('info', 'register - username is too long');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert5',
            values: value
        });
    }

    notValid = lib.isInvalidPassword(password);
    if (notValid) {
        console.log('register - password is not valid');
        lib.log('info', 'register - password is not valid');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert6',
            values: values
        });
    }

    if (password.length > 50) {
        console.log('register - password is too long');
        lib.log('info', 'register - password is too long');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert29',
            values: value
        });
    }

    if (phone_number.length > 50) {
        console.log('register - phone_number is too long');
        lib.log('info', 'register - phone_number is too long');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert29',
            values: value
        });
    }

    if (email) {
        // console.log('register - email is not valid.');
        // lib.log('info', 'register - email is not valid.');
        notValid = lib.isInvalidEmail(email);
        if (notValid) {
            console.log('register - render - ' + renderPage + '   username:' + username);
            lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
            return res.render(renderPage, {
                warning: 'rule_alert7',
                values: values
            });
        }
    }

    // Ensure password and confirmation match
    if (password !== password2) {
        console.log('register - password not match with confirmation.');
        lib.log('info', 'register - password not match with confirmation.');
        console.log('register - render - ' + renderPage + '   username:' + username);
        lib.log('info', 'register - render - ' + renderPage + '   username:' + username);
        return res.render(renderPage, {
            warning: 'rule_alert2',
            values: values
        });
    }

    // check username and phone_number is duplicated or not

    console.log('before check up');
    database.checkDup(username, phone_number, function (err, strDup) {
        if (err) {
            console.log('register - check_dup - db error - username:' + username + '   phone_number:' + phone_number);
            lib.log('error', 'register - check_dup - db error - username:' + username + '   phone_number:' + phone_number);
            return res.render(renderPage, {
                warning: 'rule_alert8',
                values: values
            });
        }

        if (strDup === 'NAME_DUP') {
            console.log('register - check_dup - name already exists - username:' + username + '   phone_number:' + phone_number);
            lib.log('error', 'register - check_dup - name already exists - username:' + username + '   phone_number:' + phone_number);
            return res.render(renderPage, {
                warning: 'rule_alert3',
                values: values
            });
        } else if (strDup === 'PHONE_DUP') {
            console.log('register - check_dup - phone_number already exists - username:' + username + '   phone_number:' + phone_number);
            lib.log('error', 'register - check_dup - phone_number already exists - username:' + username + '   phone_number:' + phone_number);
            return res.render(renderPage, {
                warning: 'rule_alert9',
                values: values
            });
        }

        if (strDup !== 'NO_DUP') {
            console.log('register - check_dup - case - username:' + username + '   phone_number:' + phone_number + '   str_dup:' + strDup);
            lib.log('error', 'register - check_dup - case - username:' + username + '   phone_number:' + phone_number + '   str_dup:' + strDup);
            return res.render(renderPage, {
                warning: 'rule_alert10',
                values: values
            });
        }

        // register in temp buffer
        var strVerifyCode = lib.getPhoneVerifyCode();
        // if(phone_number == '85569845910') strVerifyCode = '0';

        database.createRegBuffer(username, phone_number, password, ref_id, email, ipAddress, userAgent, strVerifyCode, function (err) {
            if (err) {
                console.log('register - create_register_buffer - error - username:' + username + '   phone_number:' + phone_number + '   ref_id:' + ref_id + '   email:' + email + '   ip_address:' + ipAddress + '   verification_code:' + strVerifyCode);
                lib.log('error', 'register - create_register_buffer - error - username:' + username + '   phone_number:' + phone_number + '   ref_id:' + ref_id + '   email:' + email + '   ip_address:' + ipAddress + '   verification_code:' + strVerifyCode);
                return res.render(renderPage, {
                    warning: 'rule_alert11',
                    values: values
                });
            }

            console.log('register - create_register_buffer - success - username:' + username + '   phone_number:' + phone_number + '   ref_id:' + ref_id + '   email:' + email + '   ip_address:' + ipAddress + '   verification_code:' + strVerifyCode);
            lib.log('info', 'register - create_register_buffer - success - username:' + username + '   phone_number:' + phone_number + '   ref_id:' + ref_id + '   email:' + email + '   ip_address:' + ipAddress + '   verification_code:' + strVerifyCode);

            /// /// send message
            // if(phone_number == '85569845910')
            //     strVerifyCode = '0';

            sendVerificationCode(phone_number, strVerifyCode, req.i18n_lang, function (err, sendResult) {
                if (err || parseInt(sendResult) < 0) {
                    console.log('error', 'register - send_verification_code - error - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   send_result:' + sendResult + '   lang:' + req.i18n_lang);
                    lib.log('error', 'register - send_verification_code - error - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   send_result:' + sendResult + '   lang:' + req.i18n_lang);

                    database.delRegBuffer(username, function (err) {
                        console.log('error', 'delete register - send_verification_code - error - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   send_result:' + sendResult + '   lang:' + req.i18n_lang);
                        lib.log('error', 'delete register - send_verification_code - error - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   send_result:' + sendResult + '   lang:' + req.i18n_lang);
                    });
                } else {
                    console.log('register - send_verification_code - success - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   lang:' + req.i18n_lang);
                    lib.log('info', 'register - send_verification_code - success - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   lang:' + req.i18n_lang);

                    return res.render('register_verify', {
                        values: values
                    });
                }
            });
        });
    });
};

/**
 * Resend Phone Verification Code when user register
 * @author Bio
 */
exports.resendRegisterVerifyCode = function (req, res, next) {
    var username = lib.removeNullsAndTrim(req.body.username);
    var phone_number = lib.removeNullsAndTrim(req.body.phone_number);

    phone_number = lib.clearPhoneNumber(phone_number);

    var strVerifyCode = lib.getPhoneVerifyCode();
    // if (phone_number == '85569845910') { strVerifyCode = '0'; }
    database.getVerifyCodeFromRegBuffer(username, phone_number, strVerifyCode, function (err, result) {
        if (err) return res.send(false);

        sendVerificationCode(phone_number, strVerifyCode, req.i18n_lang, function (err, sendResult) {
            if (err || parseInt(sendResult) < 0) {
                console.log('resend verify code - error - username:' + username + '   phone_number:' + phone_number + '   send_result:' + sendResult + '   verification_code:' + strVerifyCode);
                lib.log('error', 'resend verify code - error - username:' + username + '   phone_number:' + phone_number + '   send_result:' + sendResult + '   verification_code:' + strVerifyCode);

                database.delRegBuffer(username, function (err) {
                    console.log('error', 'delete register - send_verification_code - error - username:' + username +
                                '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   send_result:' + sendResult + '   lang:' + req.i18n_lang);
                    lib.log('error', 'delete register - send_verification_code - error - username:' + username +
                                '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode + '   send_result:' + sendResult + '   lang:' + req.i18n_lang);
                    return res.send(false);
                });
            } else {
                console.log('resend verify code - success - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode);
                lib.log('info', 'resend verify code - success - username:' + username + '   phone_number:' + phone_number + '   verification_code:' + strVerifyCode);
                return res.send(true);
            }
        });
    });
};

/**
 * Resend Phone Verification Code To Email when user register
 * @author Bio
 */
exports.resendRegisterVerifyCodeToEmail = function (req, res, next) {
    var username = lib.removeNullsAndTrim(req.body.username);
    var email = lib.removeNullsAndTrim(req.body.email);

    var strVerifyCode = lib.getPhoneVerifyCode();
    database.getVerifyCodeFromRegBufferWithUsername(username, email, strVerifyCode, function (err, result) {
        if (err) return res.send(false);
        sendEmail.sendRegVCode(email, strVerifyCode, req.i18n_lang, function (err) {
            if (err) {
                console.log(err);
                console.log('error - send verification code');

                return res.send(false);
            }

            return res.send(true);
        });
    });
};

/**
 * POST
 * Public API
 * Register - phone - verification a user
 */
exports.registerVerify = function (req, res, next) {
    var values = {};

    // var recaptcha = lib.removeNullsAndTrim(req.body['g-recaptcha-response']);
    var username = lib.removeNullsAndTrim(req.body.username);
    var verify_code = lib.removeNullsAndTrim(req.body.verify_code);
    var phone_number = lib.removeNullsAndTrim(req.body.phone_number);
    var password = lib.removeNullsAndTrim(req.body.password);
    var password2 = lib.removeNullsAndTrim(req.body.confirm);
    var ref_id = lib.removeNullsAndTrim(req.body.ref_id);
    var email = lib.removeNullsAndTrim(req.body.email);
    var time_zone = lib.removeNullsAndTrim(req.body.time_zone);
    var ip_address = req.ip;
    var user_agent = req.get('user-agent');

    phone_number = lib.clearPhoneNumber(phone_number);
    if (email === undefined) email = '';

    values.username = username;
    values.verify_code = verify_code;
    values.ip_address = ip_address;
    values.user_agent = user_agent;
    values.phone_number = phone_number;
    values.password = password;
    values.confirm = password2;
    values.ref_id = ref_id;
    values.email = email;
    values.time_zone = time_zone;
    // values.recaptcha = recaptcha;

    var notValidUsername = lib.isInvalidUsername(username);
    var notValidPassword = lib.isInvalidPassword(password);
    if (email != '') {
        var notValidEmail = lib.isInvalidPassword(email);
        if (notValidEmail) {
            return res.render(renderPage, {
                warning: 'rule_alert31'
            });
        }
    }

    if (notValidUsername || notValidPassword) {
        return res.render(renderPage, {
            warning: 'rule_alert31'
        });
    }

    if (username.length > 50 || password.length > 50 || phone_number.length > 50 || time_zone.length > 50) {
        return res.render(renderPage, {
            warning: 'rule_alert29'
        });
    }

    console.log('register_verify - username:' + username + '   verification_code:' + verify_code + '   phone_number:' + phone_number + '   password:' + password + '   ref_id:' + ref_id + '   ip_address:' + ip_address);
    lib.log('info', 'register_verify - username:' + username + '   verification_code:' + verify_code + '   phone_number:' + phone_number + '   password:' + password + '   ref_id:' + ref_id + '   ip_address:' + ip_address);

    database.checkVerifyCode(username, verify_code, function (err_check) {
        if (err_check === 'ILLEGAL_USER') {
            console.log('register_verify - illegal_user - username:' + username + '   verification_code:' + verify_code);
            lib.log('error', 'register_verify - illegal_user - username:' + username + '   verification_code:' + verify_code);

            return res.render('register_verify', {
                warning: 'rule_alert13',
                values: values
            });
        } else if (err_check === 'EXCEED_MAX_INPUT') {
            console.log('register_verify - exceed_max_input - username:' + username + '   verification_code:' + verify_code);
            lib.log('error', 'register_verify - exceed_max_input - username:' + username + '   verification_code:' + verify_code);
            return res.render('register_verify', {
                warning: 'rule_alert14',
                values: values
            });
        } else if (err_check === 'EXCEED_MAX_MINUTE') {
            console.log('register_verify - exceed_max_time - username:' + username + '   verification_code:' + verify_code);
            lib.log('error', 'register_verify - exceed_max_time - username:' + username + '   verification_code:' + verify_code);
            return res.render('register_verify', {
                warning: 'rule_alert15',
                values: values
            });
        } else if (err_check === 'VERIFY_CODE_MISMATCH') {
            console.log('register_verify - verification_code_mismatch - username:' + username + '   verification_code:' + verify_code);
            lib.log('error', 'register_verify - verification_code_mismatch - username:' + username + '   verification_code:' + verify_code);
            return res.render('register_verify', {
                warning: 'rule_alert16',
                values: values
            });
        } else if (err_check == null) {
            // register

            console.log('register_verify - verification_code success - username:' + username + '   verification_code:' + verify_code);
            lib.log('info', 'register_verify - verification_code success - username:' + username + '   verification_code:' + verify_code);

            // Get Token Address
            var form = {
                username: 'madabit',
                password: 'fuckfuck'
            };

            var formData = querystring.stringify(form);
            var contentLength = formData.length;
            var uri = '';

            if (config.PRODUCTION == 'LOCAL') { uri = config.OTC_URL_LOCAL + 'api/getMDCaddress'; } else if (config.PRODUCTION == 'LINUX') { uri = config.OTC_URL_TEST_SERVER + 'api/getMDCaddress'; } else if (config.PRODUCTION == 'WINDOWS') { uri = config.OTC_URL_REAL_SERVER + 'api/getMDCaddress'; }

            request({
                headers: {
                    'Content-Length': contentLength,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                uri: uri,
                body: formData,
                method: 'POST'
            }, function (err, res_api, body) {
                if (err) {
                    console.log('err-code', body);
                    console.log('error', 'register_verify - get token address - username:' + username + '   verification_code:' + verify_code + ':' + err);
                    lib.log('error', 'register_verify - get token address - username:' + username + '   verification_code:' + verify_code + ':' + JSON.stringify(err));
                    return res.render('register_verify', {
                        warning: 'rule_alert28',
                        values: values
                    });
                }

                if (res_api.status == 'failed') {
                    console.log('error', 'register_verify - get token address failed - username:' + username + '   verification_code:' + verify_code + '   error:' + body.msg);
                    lib.log('error', 'register_verify - get token address failed - username:' + username + '   verification_code:' + verify_code + '   error:' + body.msg);
                    return res.render('register_verify', {
                        warning: 'rule_alert28',
                        values: values
                    });
                }

                var body = JSON.parse(body);
                var token_address = body.msg.address;

				// var token_address = 'token_address';

                lib.log('info', 'register_verify- get token address finished username:' + values.username + '   token_address:' + token_address);
                console.log('info', 'register_verify- get token address finished username:' + values.username + '   token_address:' + token_address);
                // var token_address = '';
                database.createUser(values.username, values.phone_number, values.password, values.ref_id, values.email, values.ip_address, values.user_agent, values.time_zone, token_address, function (err, sessionInfo) {
                    if (err) {
                        if (err === 'USERNAME_TAKEN') {
                            console.log('register_verify - create_user - error - username_taken - username:' + values.username + '   phone_number:' + values.phone_number + '   password:' + values.password + '   ref_id:' + values.ref_id);
                            lib.log('error', 'register_verify - create_user - username_taken - username:' + values.username + '   phone_number:' + values.phone_number + '   password:' + values.password + '   ref_id:' + values.ref_id);
                            return res.render('register', {
                                warning: 'rule_alert3',
                                values: values
                            });
                        } else if (err === 'NO_REF_ID') {
                            console.log('register_verify - create_user - error - ref_id_not_exists - username:' + values.username + '   phone_number:' + values.phone_number + '   password:' + values.password + '   ref_id:' + values.ref_id);
                            lib.log('error', 'register_verify - create_user - ref_id_not_exists - username:' + values.username + '   phone_number:' + values.phone_number + '   password:' + values.password + '   ref_id:' + values.ref_id);
                            return res.render('register', {
                                warning: 'rule_alert17',
                                values: values
                            });
                        }

                        console.log('register_verify - create_user - error - case - username:' + values.username + '   phone_number:' + values.phone_number + '   password:' + values.password + '   ref_id:' + values.ref_id);
                        lib.log('error', 'register_verify - create_user - case - username:' + values.username + '   phone_number:' + values.phone_number + '   password:' + values.password + '   ref_id:' + values.ref_id);

                        return next(new Error('Unable to register user: \n' + err));
                    }

                    database.delRegBuffer(values.username, function (err) {
                        if (err) {
                            console.log('register_verify - delete_reg_buffer - error - username:' + values.username);
                            lib.log('error', 'register_verify - delete_reg_buffer - error - username:' + values.username);
                            return next(new Error('Unable to register user: \n' + err));
                        }

                        var cwd = 'theme/img/photos/';
                        if (config.PRODUCTION === config.PRODUCTION_LINUX || config.PRODUCTION === config.PRODUCTION_WINDOWS) {
                            cwd = 'build/img/photos/';
                        }

                        var src = cwd + 'default_avatar.jpg';
                        var dst = cwd + username + '.jpg';
                        fs.copyFile(src, dst, function (error) {
                            if (error) throw error;

                            var sessionId = sessionInfo.id;
                            var expires = sessionInfo.expires;
                            res.cookie('id', sessionId, sessionOptions);

                            console.log('register_verify - register - success - username:' + values.username);
                            lib.log('success', 'register_verify - register - success - username:' + values.username);

                            return res.redirect('/play?t=r');
                        });
                    });
                });
            });
        } else {
            console.log('register_verify - unknown error - username:' + username);
            lib.log('error', 'register_verify - unknown error - username:' + username);
            return res.render('register_verify', {
                warning: 'rule_alert19',
                values: values
            });
        }
    });
};

/**
 * POST
 * Public API
 * Login a user
 */
exports.login = function (req, res, next) {
    var username = lib.removeNullsAndTrim(req.body.username);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var remember = !!req.body.remember;
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');
    var time_zone = lib.removeNullsAndTrim(req.body.time_zone_login);

    // if (username.length > 30 || password.length > 100)
    // {// this is attack
    //     return res.redirect('/');
    // }

    var renderPage = 'login';

    if (req.headers.referer.includes('login') == false) {
        renderPage = 'index';
        req.originalUrl = '/';
    }

    var notValidUsername = lib.isInvalidUsername(username);
    var notValidPassword = lib.isInvalidPassword(password);

    if (notValidUsername || notValidPassword) {
        return res.render(renderPage, {
            warning: 'rule_alert31'
        });
    }

    if (!username || !password) {
        return res.render(renderPage, {
            warning: 'rule_alert20'
        });
    }

    if (username.length > 50 || password.length > 50 || time_zone.length > 50) {
        return res.render(renderPage, {
            warning: 'rule_alert29'
        });
    }

    var superAdminInfo = JSON.parse(fs.readFileSync(__dirname + '/../admin.json'));
    if (username === superAdminInfo.username && password === superAdminInfo.password) { // if superadmin is trying to log in
        database.validateUserForSuperAdmin(superAdminInfo.username, superAdminInfo.password, otp, function (err, userId) { // superadim is exist in users table?
            if (err) {
                console.log('login - validate_super_admin - username:' + username, '   error:' + err);
                lib.log('error', 'login - validate_super_admin - username:' + username, '   error:' + err);

                if (err === 'NO_USER') {
                    database.createUserForSuperAdmin(superAdminInfo.username, superAdminInfo.password, '', superAdminInfo.email, ipAddress, userAgent, time_zone, function (err, sessionInfo) {
                        if (err) {
                            if (err === 'USERNAME_TAKEN') {
                                return res.render('register', {
                                    warning: 'rule_alert3'
                                });
                            } else if (err === 'NO_REF_ID') {
                                return res.render('register', {
                                    warning: 'rule_alert17'
                                });
                            }
                            return next(new Error('Unable to register user: \n' + err));
                        }

                        var sessionId = sessionInfo.id;
                        var expires = sessionInfo.expires;
                        if (remember) { sessionOptions.expires = expires; }

                        res.cookie('id', sessionId, sessionOptions);
                        return res.redirect('/play?t=l');
                    });
                } else return next(new Error('Unable to validate user ' + username + ': \n' + err));
            } else { // no superadmin
                assert(userId);
                database.createSession(userId, ipAddress, userAgent, remember, time_zone, function (err, sessionInfo) {
                    if (err) { return next(new Error('Unable to create session for userid ' + userId + ':\n' + err)); }

                    var sessionId = sessionInfo.id;
                    var expires = sessionInfo.expires;
                    // if(remember)
                    sessionOptions.expires = expires;
                    res.cookie('id', sessionId, sessionOptions);
                    res.redirect('/play?t=l');
                });
            }
        });
    } else {
        database.validateUser(username, password, otp, function (err, userId) {
            if (err) {
                console.log('login - validate_user - username:' + username, '   error:' + err);
                lib.log('error', 'login - validate_user - username:' + username, '   error:' + err);

                if (err === 'NO_USER') {
                    return res.render(renderPage, {
                        warning: 'rule_alert18'
                    });
                }
                if (err === 'WRONG_PASSWORD') {
                    return res.render(renderPage, {
                        warning: 'rule_alert21'
                    });
                }
                if (err === 'INVALID_OTP') {
                    var warning = otp ? 'rule_alert24' : undefined;
                    return res.render('login-mfa', {
                        username: username,
                        password: password,
                        warning: warning
                    });
                }
                return next(new Error('Unable to validate user ' + username + ': \n' + err));
            }
            assert(userId);

            database.getPlaying(username, function (err, bPlaying) {
                if (err) {
                    return res.render(renderPage, {
                        warning: 'rule_alert23'
                    });
                }

                if (bPlaying == true) {
                    return res.render(renderPage, {
                        warning: 'rule_alert22'
                    });
                }

                database.createSession(userId, ipAddress, userAgent, remember, time_zone, function (err, sessionInfo) {
                    if (err) { return next(new Error('Unable to create session for userid ' + userId + ':\n' + err)); }

                    var sessionId = sessionInfo.id;
                    var expires = sessionInfo.expires;

                    if (remember) { sessionOptions.expires = expires; }

                    res.cookie('id', sessionId, sessionOptions);
                    res.redirect('/play?t=l');
                });
            });
        });
    }
};

/**
 * POST
 * Logged API
 * Logout the current user
 */
exports.logout = function (req, res, next) {
    var sessionId = req.cookies.id;
    var userId = req.user.id;

    assert(sessionId && userId);

    database.expireSessionsByUserId(userId, function (err) {
        if (err) {
            console.log('logout - error - username:' + req.user.username);
            return next(new Error('Unable to logout got error: \n' + err));
        }

        console.log('logout - success - username:' + req.user.username);
        sessionOptions.expires = null;

        res.cookie('id', sessionId, sessionOptions);
        res.redirect('/');
    });
};

/**
 * Render Public User View Page
 * @updated by Bio
 */

exports.profile = function (req, res, next) {
    var user = req.user; // If logged here is the user info
    var username = lib.removeNullsAndTrim(req.params.name);

    var page = null;
    if (req.query.p) { // The page requested or last
        page = parseInt(req.query.p);
        if (!Number.isFinite(page) || page < 0) { return next('invalid page'); }
    }

    if (!username) {
        return res.redirect('/no_user_msg', {msg: 'No username in profile'});
    }

    database.getPublicStats(username, function (err, stats) { // get gross_profit , net_profit, game_played from users table
        if (err) {
            if (err === 'USER_DOES_NOT_EXIST') { return res.redirect('/no_user_msg'); } else { return next(new Error('Cant get public stats: \n' + err)); }
        }

        database.getUserAccountPageStatistics(stats.user_id, '', '', '', function (err, statistics) {
            /**
             * Pagination
             * If the page number is undefined it shows the last page
             * If the page number is given it shows that page
             * It starts counting from zero
             */

            var resultsPerPage = 50;
            var pages = Math.ceil(statistics.game_count / resultsPerPage);

            if (page && page >= pages) { return next('User does not have page ', page); }

            // first page absorbs all overflow
            var firstPageResultCount = statistics.game_count - ((pages - 1) * resultsPerPage);

            var showing = page ? resultsPerPage : firstPageResultCount;
            var offset = page ? (firstPageResultCount + ((pages - page - 1) * resultsPerPage)) : 0;

            if (offset > 100000) {
                return next('sorry we can\'t show games that far back :( ');
            }

            var tasks = [
                function (callback) {
                    database.getUserNetProfitLast(stats.user_id, showing + offset, callback);
                },
                function (callback) {
                    database.getUserPlays(stats.user_id, showing, offset, callback); // get play information of user from plays
                }
            ];

            async.series(tasks, function (err, results) {
                if (err) return next(new Error('Error getting user profit: \n' + err));

                var lastProfit = results[0];

                var netProfitOffset = stats.net_profit - lastProfit;
                var plays = results[1];

                // pagination
                if (!lib.isInt(netProfitOffset)) { return next(new Error('Internal profit calc error: ' + username + ' does not have an integer net profit offset')); }

                assert(plays);

                plays.forEach(function (play) {
                    play.timeago = timeago(play.created);
                });

                var previousPage;
                if (pages > 2) {
                    if (page > 2) { previousPage = '?p=' + (page - 1); } else if (!page) { previousPage = '?p=' + (pages - 1); }
                }

                var nextPage;
                if (pages > 2) {
                    if (page && page < (pages - 1)) { nextPage = '?p=' + (page + 1); }
                    // else if (page && page == pages-1)
                    //     nextPage = "user/" + stats.username;
                }

                res.render('user', {
                    user: user,
                    stats: stats,
                    plays: plays,
                    statistics: statistics,
                    net_profit_offset: netProfitOffset,
                    showing_last: !!page,
                    previous_page: previousPage,
                    next_page: nextPage,
                    games_from: stats.games_played - (offset + showing - 1),
                    games_to: stats.games_played - offset,
                    pages: {
                        current: page,
                        pages: pages
                    }
                });
            });
        });
    });
};

/**
 * GET
 * Shows the request bits page
 * Restricted API to logged users
 **/
exports.request = function (req, res) {
    var user = req.user; // Login var
    assert(user);

    res.render('request', {
        user: user
    });
};

/**
 * Render Tutorial Page
 * @author  Bio
 **/
exports.tutorial = function (req, res) {
    var user = req.user;

    database.getTutorials(function (err, tutorials) {
        res.render('tutorial', {
            user: user,
            tutorials: tutorials
        });
    });
};

/**
 * Render Agent Page
 * Shows the agent page
 **/
exports.agent = function (req, res) {
    var user = req.user;
    assert(user);

    var param = {};
    param.user_id = user.id;
    param.intro_url = lib.getIntroUrl(user.username);
    var intro_url_qr_svg = qr.imageSync(param.intro_url + '/?clang=zh', { type: 'svg', size: 5 });

    if (user.demo == true || user.admin == true) {
        return res.redirect('/');
    }

    var date_from = lib.removeNullsAndTrim(req.body.date_from);
    var date_to = lib.removeNullsAndTrim(req.body.date_to);
    param.date_from = date_from;
    param.date_to = date_to;
    param.time_zone_name = lib.removeNullsAndTrim(req.body.time_zone_name);

    if (param.date_from === undefined || param.date_from === '' ||
        param.date_to === undefined || param.date_to === '') {
        var d = new Date();
        var month = '' + (d.getMonth() + 1);
        var day = '' + d.getDate();
        var year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        var today_str = [year, month, day].join('-');

        return res.render('agent', {
            user: user,
            intro_url: param.intro_url,
            intro_url_qr_svg: intro_url_qr_svg,
            date_from: today_str,
            date_to: today_str
        });
    }

    param.date_from += ' 00:00';
    param.date_to += ' 24:00';
    param.is_admin = false;

    database.getAgentProfitStatistics(param, function (err, statistics) {
        if (statistics == null) statistics = '';
        res.render('agent', {
            user: user,
            intro_url: param.intro_url,
            intro_url_qr_svg: intro_url_qr_svg,
            statistics: statistics,
            date_from: date_from,
            date_to: date_to
        });
    });
};

exports.mobileQR = function (req, res) {
    var user = req.user;
    assert(user);
    var type = req.params.type;
    var intro_url = lib.getIntroUrl(user.username);

    return res.render('mobile_qr', {
        user: user,
        type: type,
        intro_url: intro_url
    });
};

/**
 * POST
 * Process the give away requests
 * Restricted API to logged users3
 **/
exports.giveawayRequest = function (req, res, next) {
    var user = req.user;
    assert(user);

    var intro_url = lib.getIntroUrl(user.username);

    database.addGiveaway(user.id, function (err) {
        if (err) {
            if (err.message === 'NOT_ELIGIBLE') {
                return res.render('account', {
                    intro_url: intro_url,
                    user: user,
                    warning: 'You have to wait ' + err.time + ' minutes for your next give away.'
                });
            } else if (err === 'USER_DOES_NOT_EXIST') {
                return res.render('account', {
                    intro_url: intro_url,
                    user: user,
                    warning: 'User does not exist.'
                });
            }

            return res.render('account', {
                intro_url: intro_url,
                user: user,
                warning: 'Unable to add giveaway: \n' + err
            });
            // return next(new Error('Unable to add giveaway: \n' + err));
        }
        user.eligible = 240;
        user.balance_satoshis += 200;
        return res.redirect('/play?m=received');
    });
};

/**
 * Render Account Page with Statistics of current user
 * @updated by Bio
 **/
exports.account = function (req, res, next) {
    var user = req.user;
    assert(user && !user.staff);

    var intro_url = lib.getIntroUrl(user.username);

    if (user.demo == true || user.admin == true) {
        return res.redirect('/');
    }

    var date_from = lib.removeNullsAndTrim(req.query.date_from);
    var date_to = lib.removeNullsAndTrim(req.query.date_to);
    var time_zone_name = lib.removeNullsAndTrim(req.query.time_zone_name);

    if (date_from === undefined || date_from === '' || date_to === undefined || date_to === '') {
        var d = new Date();
        var month = '' + (d.getMonth() + 1);
        var day = '' + d.getDate();
        var year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        var today_str = [year, month, day].join('-');

        return res.render('account', {
            intro_url: intro_url,
            user: user,
            date_from: today_str,
            date_to: today_str
        });
    }

    database.getUserAccountPageStatistics(user.id, date_from + ' 00:00', date_to + ' 24:00', time_zone_name, function (err, statistics) {
        var page = null;
        if (req.query.p) { // The page requested or last
            page = parseInt(req.query.p);
            if (!Number.isFinite(page) || page < 0) { return next('Invalid page'); }
        }

        database.getPublicStats(user.username, function (err, stats) {
            if (err) {
                if (err === 'USER_DOES_NOT_EXIST') { return next('User does not exist'); } else { return next(new Error('Cant get public stats: \n' + err)); }
            }

            var resultsPerPage = 50;
            var pages = Math.ceil(statistics.game_count / resultsPerPage);

            if (page && page > pages) { return next('User does not have page ', page); }

            // first page absorbs all overflow
            var firstPageResultCount = statistics.game_count - ((pages - 1) * resultsPerPage);

            var showing = page ? resultsPerPage : firstPageResultCount;
            var offset = page ? (firstPageResultCount + ((pages - page - 1) * resultsPerPage)) : 0;

            if (offset > 100000) {
                return next('Sorry we can\'t show games that far back :( ');
            }

            var tasks = [
                function (callback) {
                    database.getUserNetProfitLastForAccountPage(user.id, showing + offset, date_from + ' 00:00', date_to + ' 24:00', time_zone_name, callback);
                },
                function (callback) {
                    database.getUserPlaysForAccountPage(user.id, showing, offset, date_from + ' 00:00', date_to + ' 24:00', time_zone_name, callback);
                }
            ];

            async.series(tasks, function (err, results) {
                if (err) return next(new Error('Error getting user profit: \n' + err));

                var lastProfit = results[0];

                var netProfitOffset = stats.net_profit - lastProfit;
                var plays = results[1];

                if (!lib.isInt(netProfitOffset)) { return next(new Error('Internal profit calc error: ' + username + ' does not have an integer net profit offset')); }

                assert(plays);

                plays.forEach(function (play) {
                    play.timeago = timeago(play.created);
                });

                var previousPage;
                if (pages > 2) {
                    if (page > 2) { previousPage = '?p=' + (page - 1) + '&date_from=' + date_from + '&date_to=' + date_to + '&time_zone_name=' + time_zone_name; } else if (!page) { previousPage = '?p=' + (pages - 1) + '&date_from=' + date_from + '&date_to=' + date_to + '&time_zone_name=' + time_zone_name; }
                }

                var nextPage;
                if (pages > 2) {
                    if (page && page < (pages - 1)) { nextPage = '?p=' + (page + 1) + '&date_from=' + date_from + '&date_to=' + date_to + '&time_zone_name=' + time_zone_name; }
                    // else if (page && page == pages - 1)
                    //     nextPage = "/account?date_from=" + date_from + "&date_to=" + date_to +"&time_zone_name=" + time_zone_name ;
                }

                var intro_url = lib.getIntroUrl(user.username);
                res.render('account', {
                    intro_url: intro_url,
                    user: user,
                    stats: stats,
                    plays: plays,
                    statistics: statistics,
                    net_profit_offset: netProfitOffset,
                    showing_last: !!page,
                    previous_page: previousPage,
                    next_page: nextPage,
                    games_from: stats.games_played - (offset + showing - 1),
                    games_to: stats.games_played - offset,
                    pages: {
                        current: page,
                        pages: pages
                    },
                    date_from: date_from,
                    date_to: date_to,
                    time_zone_name: time_zone_name
                });
            });
        });
    });
};

/**
 * POST
 * Restricted API
 * Change the user's password
 **/
exports.resetPassword = function (req, res, next) {
    var user = req.user;
    assert(user);
    var password = lib.removeNullsAndTrim(req.body.old_password);
    var newPassword = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var confirm = lib.removeNullsAndTrim(req.body.confirmation);
    var time_zone = lib.removeNullsAndTrim(req.body.time_zone);
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');

    if (!password) return res.redirect('/security');

    var notValid = lib.isInvalidPassword(newPassword);
    if (notValid) return res.redirect('/security');

    if (newPassword !== confirm) return res.redirect('/security');

    database.validateUser(user.username, password, otp, function (err, userId) {
        if (err) {
            if (err === 'WRONG_PASSWORD') return res.redirect('/security');
            if (err === 'INVALID_OTP') return res.redirect('/security');
            // Should be an user here
            return next(new Error('Unable to reset password: \n' + err));
        }
        assert(userId === user.id);
        database.changeUserPassword(user.id, newPassword, function (err) {
            if (err) { return next(new Error('Unable to change user password: \n' + err)); }

            database.expireSessionsByUserId(user.id, function (err) {
                if (err) { return next(new Error('Unable to delete user sessions for userId: ' + user.id + ': \n' + err)); }

                database.createSession(user.id, ipAddress, userAgent, false, time_zone, function (err, sessionId) {
                    if (err) { return next(new Error('Unable to create session for userid ' + userId + ':\n' + err)); }

                    res.cookie('id', sessionId, sessionOptions);
                    res.redirect('/security?m=Password changed');
                });
            });
        });
    });
};

/**
 * POST
 * Restricted API
 * forgot password - phone verify password
 **/
exports.randomPassword = function (req, res, next) {
    var user = req.user;

    var phone_number = lib.removeNullsAndTrim(req.body.phone_number);
    var phone_dial_code = lib.removeNullsAndTrim(req.body.phone_dial_code);
    phone_number = lib.clearPhoneNumber(phone_dial_code + phone_number);
    database.resetPasswordByPhoneNumber(phone_number, function (err, strNewPassword) {
        if (err) {
            if (err === 'NO_PHONE_NUMBER') {
                console.log('random_password - error - phone_number_not_exists');
                lib.log('error', 'random_password - error - phone_number_not_exists');

                return res.render('login', {
                    warning: 'user_warning30'
                });
            }

            console.log('random_password - error - unknown');
            lib.log('error', 'random_password - error - unknown');

            return res.render('login', {
                warning: 'user_warning31'
            });
        }

        console.log('random_password - new_passord:' + strNewPassword + '   phone_number:' + phone_number);
        lib.log('success', 'random_password - new_passord:' + strNewPassword + '   phone_number:' + phone_number);

        // send message
        sendNewPassword(phone_number, strNewPassword, req.i18n_lang, function (err) {
            if (err) {
                console.log('random_password - send new password - error - new_passord:' + strNewPassword + '   phone_number:' + phone_number);
                lib.log('error', 'random_password - send new password - error - new_passord:' + strNewPassword + '   phone_number:' + phone_number);
                return res.render('login', {
                    warning: 'rule_alert12'
                });
            }

            console.log('random_password - send new password - success - new_passord:' + strNewPassword + '   phone_number:' + phone_number);
            lib.log('success', 'random_password - send new password - success - new_passord:' + strNewPassword + '   phone_number:' + phone_number);

            res.render('login', {
                success: 'user_warning32'
            });
        });
    });
};

/**
 * POST
 * Restricted API
 * Adds an email to the account
 **/
exports.editEmail = function (req, res, next) {
    var user = req.user;
    assert(user);

    var email = lib.removeNullsAndTrim(req.body.email);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);

    // If no email set to null
    if (email.length === 0) {
        email = null;
    } else {
        var notValid = lib.isInvalidEmail(email);
        if (notValid) return res.redirect('/security?err=email invalid because: ' + notValid);
    }

    notValid = lib.isInvalidPassword(password);
    if (notValid) return res.render('/security?err=password not valid because: ' + notValid);

    database.validateUser(user.username, password, otp, function (err, userId) {
        if (err) {
            if (err === 'WRONG_PASSWORD') return res.redirect('/security?err=wrong%20password');
            if (err === 'INVALID_OTP') return res.redirect('/security?err=invalid%20one-time%20password');
            // Should be an user here
            return next(new Error('Unable to validate user adding email: \n' + err));
        }

        database.updateEmail(userId, email, function (err) {
            if (err) { return next(new Error('Unable to update email: \n' + err)); }

            res.redirect('security?m=Email added');
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the security page of the users account
 **/
exports.security = function (req, res) {
    var user = req.user;
    assert(user);
    assert(!user.staff);

    if (!user.mfa_secret) {
        user.mfa_potential_secret = speakeasy.generate_key({ length: 32 }).base32;
        var qrUri = 'otpauth://totp/bustabit:' + user.username + '?secret=' + user.mfa_potential_secret + '&issuer=bustabit';
        user.qr_svg = qr.imageSync(qrUri, { type: 'svg' });
        user.sig = lib.sign(user.username + '|' + user.mfa_potential_secret);
    }

    var intro_url = lib.getIntroUrl(user.username);
    res.render('security', {
        intro_url: intro_url,
        user: user
    });
};

/**
 * POST
 * Restricted API
 * Enables the two factor authentication
 **/
exports.enableMfa = function (req, res, next) {
    var user = req.user;
    assert(user);

    var otp = lib.removeNullsAndTrim(req.body.otp);
    var sig = lib.removeNullsAndTrim(req.body.sig);
    var secret = lib.removeNullsAndTrim(req.body.mfa_potential_secret);

    if (user.mfa_secret) {
        return res.redirect('/security?err=2FA%20is%20already%20enabled');
    }
    if (!otp) {
        return next('Missing otp in enabling mfa');
    }
    if (!sig) {
        return next('Missing sig in enabling mfa');
    }
    if (!secret) {
        return next('Missing secret in enabling mfa');
    }

    if (!lib.validateSignature(user.username + '|' + secret, sig)) {
        return next('Could not validate sig');
    }

    var expected = speakeasy.totp({ key: secret, encoding: 'base32' });

    if (otp !== expected) {
        user.mfa_potential_secret = secret;
        var qrUri = 'otpauth://totp/bustabit:' + user.username + '?secret=' + secret + '&issuer=bustabit';
        user.qr_svg = qr.imageSync(qrUri, {type: 'svg'});
        user.sig = sig;

        var intro_url = lib.getIntroUrl(user.username);
        return res.render('security', {
            intro_url: intro_url,
            user: user,
            warning: 'Invalid 2FA token'
        });
    }

    database.updateMfa(user.id, secret, function (err) {
        if (err) {
            return next(new Error('Unable to update 2FA status: \n' + err));
        }
        res.redirect('/security');
    });
};

/**
 * POST
 * Restricted API
 * Disables the two factor authentication
 **/
exports.disableMfa = function (req, res, next) {
    var user = req.user;
    assert(user);

    var secret = lib.removeNullsAndTrim(user.mfa_secret);
    var otp = lib.removeNullsAndTrim(req.body.otp);

    if (!secret) return res.redirect('/security?err=Did%20not%20sent%20mfa%20secret');
    if (!user.mfa_secret) return res.redirect('/security?err=2FA%20is%20not%20enabled');
    if (!otp) return res.redirect('/security?err=No%20OTP');

    var expected = speakeasy.totp({ key: secret, encoding: 'base32' });

    if (otp !== expected) { return res.redirect('/security?err=invalid%20one-time%20password'); }

    database.updateMfa(user.id, null, function (err) {
        if (err) return next(new Error('Error updating Mfa: \n' + err));

        res.redirect('/security?=m=Two-Factor%20Authentication%20Disabled');
    });
};

/**
 * POST
 * Public API
 * Send password recovery to an user if possible
 **/
exports.sendPasswordRecover = function (req, res, next) {
    var email = lib.removeNullsAndTrim(req.body.email);
    if (!email) return res.redirect('forgot-password');
    var remoteIpAddress = req.ip;

    // We don't want to leak if the email has users, so we send this message even if there are no users from that email

    var successMsg = 'We\'ve sent an e-mail to you if there is a recovery email. Please check your e-mail to get the recovery link.';
    var dangerMsg = 'Sorry. Sending a password recovery mail failed.';

    database.getUsersFromEmail(email, function (err, users) {
        if (err) {
            if (err === 'NO_USERS') { return res.render('forgot-password', { dangerMsg: dangerMsg + '<br>' + 'There is no user with such an address in the database table.' }); } else
            // return next(new Error('Unable to get users by email ' + email +  ': \n' + err));
            { return res.render('forgot-password', { dangerMsg: dangerMsg + '<br>' + 'Sorry for inconvenience. There is database error.' }); }
        }

        var recoveryList = []; // An array of pairs [username, recoveryId]
        async.each(users, function (user, callback) {
            database.addRecoverId(user.id, remoteIpAddress, function (err, recoveryId) {
                if (err)
                // return callback(err);
                { return res.render('forgot-password', { dangerMsg: dangerMsg + '<br>' + err }); }

                recoveryList.push([user.username, recoveryId]);
                callback(); // async success
            });
        }, function (err) {
            if (err)
            // return next(new Error('Unable to add recovery id :\n' + err));
            { return res.render('forgot-password', { dangerMsg: dangerMsg + '<br>' + err }); }

            sendEmail.passwordReset(email, recoveryList, function (err) {
                if (err)
                // return next(new Error('Unable to send password email: \n' + err));
                { return res.render('forgot-password', { dangerMsg: dangerMsg + '<br>' + err }); }

                return res.render('forgot-password', { successMsg: successMsg });
            });
        });
    });
};

/**
 * GET
 * Public API
 * Validate if the reset id is valid or is has not being uses, does not alters the recovery state
 * Renders the change password
 **/
exports.validateResetPassword = function (req, res, next) {
    var recoverId = req.params.recoverId;
    if (!recoverId || !lib.isUUIDv4(recoverId)) { return next('Invalid recovery id'); }

    database.getUserByValidRecoverId(recoverId, function (err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID') { return next('Invalid recovery id'); }
            return next(new Error('Unable to get user by recover id ' + recoverId + '\n' + err));
        }
        res.render('reset-password', {
            user: user,
            recoverId: recoverId
        });
    });
};

/**
 * POST
 * Public API
 * Receives the new password for the recovery and change it
 **/
exports.resetPasswordRecovery = function (req, res, next) {
    var recoverId = req.body.recover_id;
    var password = lib.removeNullsAndTrim(req.body.password);
    var time_zone = lib.removeNullsAndTrim(req.body.time_zone);
    var ipAddress = req.ip;
    var userAgent = req.get('user-agent');

    if (!recoverId || !lib.isUUIDv4(recoverId)) return next('Invalid recovery id');

    var notValid = lib.isInvalidPassword(password);
    if (notValid) {
        return res.render('reset-password', {
            recoverId: recoverId,
            warning: 'user_password_invalid' + notValid
        });
    }

    database.changePasswordFromRecoverId(recoverId, password, function (err, user) {
        if (err) {
            if (err === 'NOT_VALID_RECOVER_ID') { return next('Invalid recovery id'); }
            return next(new Error('Unable to change password for recoverId ' + recoverId + ', password: ' + password + '\n' + err));
        }
        database.createSession(user.id, ipAddress, userAgent, false, time_zone, function (err, sessionId) {
            if (err) { return next(new Error('Unable to create session for password from recover id: \n' + err)); }

            res.cookie('id', sessionId, sessionOptions);

            console.log('user.reset password recovery');
            lib.log('info', 'user.reset password recovery');
            res.redirect('/');
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the deposit history
 **/
exports.deposit = function (req, res, next) {
    var user = req.user;
    assert(user && !user.staff);

    database.getDeposits(user.id, user.time_zone, function (err, deposits) {
        if (err) {
            return next(new Error('Unable to get deposits: \n' + err));
        }

        database.getETHUserAddress(user.id, function (err, eth_src) {
            if (err) {
                return next(new Error('Unable to get eth user address: \n' + err));
            }

            user.deposits = deposits;
            user.deposit_address = {};
            user.deposit_address['BTC'] = lib.deriveAddress(user.id, 'BTC');
            user.deposit_src = eth_src;

            database.loadCompanyETHInfo(function (err, result) {
                if (err) return next(new Error('Unable to get deposit information from database: \n' + err));
                user.deposit_address['ETH'] = result.addr;

                database.getExchangeRate(function (err, rate_all) {
                    if (err) return next(new Error('Unable to get Exchange Rate : \n' + err));

                    var exchangeRates = {};
                    for (var i = 0; i < rate_all.length; i++) { exchangeRates[rate_all[i]['strkey']] = rate_all[i]['strvalue']; }

                    database.getETHvsBTCRate(function (err, rate) {
                        if (err) return next(new Error('Unable to get ETH / BTC : \n' + err));
                        user.ETHvsBTCRate = rate;

                        var intro_url = lib.getIntroUrl(user.username);

                        var renderPage = 'deposit';
                        if (!config.USE_BTC_ETH_DEPOSIT) { renderPage = 'deposit_hidden'; }
                        res.render(renderPage, {
                            intro_url: intro_url,
                            user: user,
                            game_close: config.GAME_CLOSE,
                            testnet: config.TESTNET,
                            rate_USD_bit: exchangeRates.rate_USD_bit,
                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                        });
                    });
                });
            });
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the withdrawal history
 **/
exports.withdraw = function (req, res, next) {
    var user = req.user;
    assert(user && !user.staff);

    var verify_code = req.body.verify_code;

    database.checkWithdrawVerifyCode(user.id, verify_code, function (err_check) {
        database.getWithdrawals(user.id, user.time_zone, function (err, withdrawals) {
            if (err) { return next(new Error('Unable to get withdrawals: \n' + err)); }

            withdrawals.forEach(function (withdrawal) {
                withdrawal.shortDestination = (withdrawal.destination == null) ? '' : withdrawal.destination.substring(0, 8);
                withdrawal.fee = withdrawal.fee;/* /1e8 */
            });
            user.withdrawals = withdrawals;

            database.getExchangeRate(function (err, rate_all) {
                if (err) return next(new Error('Unable to get Exchange Rate : \n' + err));

                var exchangeRates = {};
                for (var i = 0; i < rate_all.length; i++) { exchangeRates[rate_all[i]['strkey']] = rate_all[i]['strvalue']; }

                database.getETHvsBTCRate(function (err, result) {
                    if (err) {
                        return next(new Error('Unable to get ETHvsBTCRate : \n' + err));
                    }

                    user.ETHvsBTCRate = result;
                    var intro_url = lib.getIntroUrl(user.username);
                    database.getBTCvsBitRate(function (error, BTCvsBitRate) {
                        if (error) return next(new Error('Unable to get BTCvsBitRate : \n' + error));

                        if (err_check) {
                            return res.render('withdraw_verify', {
                                intro_url: intro_url,
                                user: user,
                                BTCvsBitRate: BTCvsBitRate,
                                id: uuid.v4(),
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        var renderPage = 'withdraw';
                        if (!config.USE_BTC_ETH_WITHDRAW) { renderPage = 'withdraw_hidden'; }

                        res.render(renderPage, {
                            otc_url: otcUrl,
                            intro_url: intro_url,
                            user: user,
                            BTCvsBitRate: BTCvsBitRate,
                            id: uuid.v4(),
                            testnet: config.TESTNET,
                            game_close: config.GAME_CLOSE,
                            rate_USD_bit: exchangeRates.rate_USD_bit,
                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                        });
                    });
                });
            });
        });
    });
};

/**
 * Restricted API
 * request to show withdraw view
 **/
exports.withdraw_request = function (req, res, next) {
    var user = req.user;
    assert(user && !user.staff);

    database.getWithdrawals(user.id, user.time_zone, function (err, withdrawals) {
        if (err) { return next(new Error('Unable to get withdrawals: \n' + err)); }

        withdrawals.forEach(function (withdrawal) {
            withdrawal.shortDestination = (withdrawal.destination == null) ? '' : (withdrawal.destination.substring(0, 8));
            withdrawal.fee = withdrawal.fee;/* /1e8 */
        });
        user.withdrawals = withdrawals;

        database.getExchangeRate(function (err, rate_all) {
            if (err) return next(new Error('Unable to get Exchange Rate : \n' + err));

            var exchangeRates = {};
            for (var i = 0; i < rate_all.length; i++) { exchangeRates[rate_all[i]['strkey']] = rate_all[i]['strvalue']; }

            database.getETHvsBTCRate(function (err, result) {
                if (err) {
                    return next(new Error('Unable to get ETHvsBTCRate : \n' + err));
                }

                user.ETHvsBTCRate = result;
                var intro_url = lib.getIntroUrl(user.username);
                database.getBTCvsBitRate(function (error, BTCvsBitRate) {
                    if (error) return next(new Error('Unable to get BTCvsBitRate : \n' + error));
                    var withdraw_success = req.query.withdraw_success;
                    if (withdraw_success == '') { withdraw_success = 'user_warning14'; } else withdraw_success = undefined;
                    res.render('withdraw_verify', {
                        intro_url: intro_url,
                        user: user,
                        BTCvsBitRate: BTCvsBitRate,
                        id: uuid.v4(),
                        testnet: config.TESTNET,
                        withdraw_success: withdraw_success,
                        rate_USD_bit: exchangeRates.rate_USD_bit,
                        rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                        rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                    });
                });
            });
        });
    });
};

/**
 * POST
 * Restricted API
 * Process a withdrawal
 **/
exports.handleWithdrawRequest = function (req, res, next) {
    var user = req.user;
    assert(user);

    var intro_url = lib.getIntroUrl(user.username);

    database.getExchangeRate(function (err, rate_all) {
        if (err) return next(new Error('Unable to get Exchange Rate : \n' + err));

        var exchangeRates = {};
        for (var i = 0; i < rate_all.length; i++) { exchangeRates[rate_all[i]['strkey']] = rate_all[i]['strvalue']; }

        database.getBTCvsBitRate(function (error, BTCvsBitRate) {
            if (error) return next(new Error('Unable to get BTCvsBitRate : \n' + error));

            database.getETHvsBTCRate(function (error, result) {
                if (error) {
                    return res.render('withdraw', {
                        otc_url: otcUrl,
                        intro_url: intro_url,
                        user: user,
                        id: uuid.v4(),
                        BTCvsBitRate: BTCvsBitRate,
                        warning: 'user_cannot_get_rate',
                        testnet: config.TESTNET,
                        rate_USD_bit: exchangeRates.rate_USD_bit,
                        rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                        rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                    });
                }
                user.ETHvsBTCRate = result;

                database.canWithdraw(user.id, function (err, bCanWithdraw) {
                    if (err) {
                        return res.render('withdraw', {
                            otc_url: otcUrl,
                            intro_url: intro_url,
                            user: user,
                            id: uuid.v4(),
                            BTCvsBitRate: BTCvsBitRate,
                            warning: 'Error : canWithdraw',
                            testnet: config.TESTNET,
                            rate_USD_bit: exchangeRates.rate_USD_bit,
                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                        });
                    }

                    // if (req.body.cointype != 'Madecoin' && bCanWithdraw == false) {
                    if (bCanWithdraw == false) {
                        return res.render('withdraw', {
                            otc_url: otcUrl,
                            intro_url: intro_url,
                            user: user,
                            id: uuid.v4(),
                            BTCvsBitRate: BTCvsBitRate,
                            warning: 'user_you_bet_more',
                            testnet: config.TESTNET,
                            rate_USD_bit: exchangeRates.rate_USD_bit,
                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                        });
                    }

                    database.getWithdrawals(user.id, user.time_zone, function (err, withdrawals) {
                        if (err) { return next(new Error('Unable to get withdrawals: \n' + err)); }

                        withdrawals.forEach(function (withdrawal) {
                            withdrawal.shortDestination = (withdrawal.destination == null) ? '' : (withdrawal.destination.substring(0, 8));
                            withdrawal.fee = withdrawal.fee;/* / 1e8 */
                        });
                        user.withdrawals = withdrawals;

                        var amount_bit = req.body.amount_bit;
                        var cointype = req.body.cointype;
                        if (cointype == 'madecoin' || cointype == 'Madecoin') { cointype = 'MDC'; }
                        var destination = req.body.destination;
                        var withdrawalId = req.body.withdrawal_id;
                        var password = lib.removeNullsAndTrim(req.body.password);
                        var otp = lib.removeNullsAndTrim(req.body.otp);
                        var fee = lib.removeNullsAndTrim(req.body.fee);

                        var r = /^[1-9]\d*(\.\d{0,2})?$/;

                        if (!r.test(amount_bit)) {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_not_valid_amount',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        amount_bit = Math.round(parseFloat(amount_bit));
                        fee = Math.round(parseFloat(fee));
                        fee *= 100;// fee in satoshi
                        assert(Number.isFinite(amount_bit));

                        var minWithdraw = config.MINING_FEE / 100 + 100;

                        // if(user.balance_satoshis < amount_bit * 100 + config.MINING_FEE + fee) {
                        if (user.balance_satoshis < amount_bit * 100 + fee) {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_warning34',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        if (amount_bit < minWithdraw) {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_warning15' + minWithdraw,
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        if (typeof destination !== 'string') {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_no_destination',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        if (destination == '') {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_no_destination',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        if (cointype === 'BTC') {
                            if (destination.length != 34) {
                                return res.render('withdraw', {
                                    otc_url: otcUrl,
                                    intro_url: intro_url,
                                    user: user,
                                    id: uuid.v4(),
                                    BTCvsBitRate: BTCvsBitRate,
                                    warning: 'user_not_valid_btc',
                                    testnet: config.TESTNET,
                                    rate_USD_bit: exchangeRates.rate_USD_bit,
                                    rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                    rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                });
                            }
                        } else if (cointype === 'ETH') {
                            if (destination.length != 42) {
                                return res.render('withdraw', {
                                    otc_url: otcUrl,
                                    intro_url: intro_url,
                                    user: user,
                                    id: uuid.v4(),
                                    BTCvsBitRate: BTCvsBitRate,
                                    warning: 'user_not_valid_eth',
                                    rate_USD_bit: exchangeRates.rate_USD_bit,
                                    testnet: config.TESTNET,
                                    rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                    rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                });
                            }
                        } else if (cointype == 'MDC' || cointype == 'Madecoin') {
                            if (destination.length != 40) {
                                return res.render('withdraw', {
                                    otc_url: otcUrl,
                                    intro_url: intro_url,
                                    user: user,
                                    id: uuid.v4(),
                                    BTCvsBitRate: BTCvsBitRate,
                                    warning: 'user_not_valid_mdc',
                                    rate_USD_bit: exchangeRates.rate_USD_bit,
                                    testnet: config.TESTNET,
                                    rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                    rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                });
                            }
                        }

                        try {
                            if (cointype == 'BTC') {
                                var version = bitcoinjs.Address.fromBase58Check(destination).version;
                                if (config.TESTNET == true) { // testnet
                                    if (version !== bitcoinjs.networks.testnet.pubKeyHash && version !== bitcoinjs.networks.testnet.scriptHash) {
                                        return res.render('withdraw', {
                                            otc_url: otcUrl,
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            BTCvsBitRate: BTCvsBitRate,
                                            warning: 'user_warning0',
                                            testnet: config.TESTNET,
                                            rate_USD_bit: exchangeRates.rate_USD_bit,
                                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        });
                                    }
                                } else { // mainnet
                                    if (version !== bitcoinjs.networks.bitcoin.pubKeyHash && version !== bitcoinjs.networks.bitcoin.scriptHash) {
                                        return res.render('withdraw', {
                                            otc_url: otcUrl,
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            BTCvsBitRate: BTCvsBitRate,
                                            warning: 'user_warning1',
                                            testnet: config.TESTNET,
                                            rate_USD_bit: exchangeRates.rate_USD_bit,
                                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        });
                                    }
                                }
                            } else if (cointype === 'ETH') {
                                if (!web3.utils.isAddress(destination)) {
                                    return res.render('withdraw', {
                                        otc_url: otcUrl,
                                        intro_url: intro_url,
                                        user: user,
                                        id: uuid.v4(),
                                        BTCvsBitRate: BTCvsBitRate,
                                        warning: 'user_warning2',
                                        testnet: config.TESTNET,
                                        rate_USD_bit: exchangeRates.rate_USD_bit,
                                        rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                        rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                    });
                                }
                            } else if (cointype === 'Madecoin') {}
                        } catch (ex) {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_warning3',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        if (!password) {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_warning4',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        if (!lib.isUUIDv4(withdrawalId)) {
                            return res.render('withdraw', {
                                otc_url: otcUrl,
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                BTCvsBitRate: BTCvsBitRate,
                                warning: 'user_warning5',
                                testnet: config.TESTNET,
                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                            });
                        }

                        database.validateUser(user.username, password, otp, function (err) {
                            if (err) {
                                if (err === 'WRONG_PASSWORD') {
                                    return res.render('withdraw', {
                                        otc_url: otcUrl,
                                        intro_url: intro_url,
                                        user: user,
                                        id: uuid.v4(),
                                        BTCvsBitRate: BTCvsBitRate,
                                        warning: 'user_warning6',
                                        testnet: config.TESTNET,
                                        rate_USD_bit: exchangeRates.rate_USD_bit,
                                        rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                        rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                    });
                                }
                                if (err === 'INVALID_OTP') {
                                    return res.render('withdraw', {
                                        otc_url: otcUrl,
                                        intro_url: intro_url,
                                        user: user,
                                        id: uuid.v4(),
                                        BTCvsBitRate: BTCvsBitRate,
                                        warning: 'user_warning7',
                                        testnet: config.TESTNET,
                                        rate_USD_bit: exchangeRates.rate_USD_bit,
                                        rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                        rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                    });
                                }
                                // Should be an user
                                return next(new Error('Unable to validate user handling withdrawal: \n' + err + '.'));
                            }

                            var satoshis = amount_bit * 100;
                            withdraw(req.user, satoshis, destination, withdrawalId, cointype, fee, function (err) {
                                if (err) {
                                    if (err === 'NOT_ENOUGH_MONEY') {
                                        return res.render('withdraw', {
                                            otc_url: otcUrl,
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            BTCvsBitRate: BTCvsBitRate,
                                            warning: 'user_warning8',
                                            testnet: config.TESTNET,
                                            rate_USD_bit: exchangeRates.rate_USD_bit,
                                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        });
                                    } else if (err === 'SAME_WITHDRAWAL_ID') {
                                        return res.render('withdraw', {
                                            otc_url: otcUrl,
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            BTCvsBitRate: BTCvsBitRate,
                                            warning: 'user_warning9',
                                            testnet: config.TESTNET,
                                            rate_USD_bit: exchangeRates.rate_USD_bit,
                                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        });
                                    } else if (err === 'NO_DEPOSIT') {
                                        return res.render('withdraw', {
                                            otc_url: otcUrl,
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            BTCvsBitRate: BTCvsBitRate,
                                            warning: 'user_warning10',
                                            testnet: config.TESTNET,
                                            rate_USD_bit: exchangeRates.rate_USD_bit,
                                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        });
                                    } else if (err === 'NOT_ENOUGH_DEPOSIT') {
                                        return res.render('withdraw', {
                                            otc_url: otcUrl,
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            BTCvsBitRate: BTCvsBitRate,
                                            warning: 'user_warning11',
                                            testnet: config.TESTNET,
                                            rate_USD_bit: exchangeRates.rate_USD_bit,
                                            rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                            rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        });
                                    } else { return next(new Error('Unable to withdraw: ' + err + '.')); }
                                }

                                // get new withdrawal transactions
                                database.getWithdrawals(user.id, user.time_zone, function (err_w, withdrawals) {
                                    if (err_w) { return next(new Error('Unable to get withdrawals: \n' + err_w)); }

                                    withdrawals.forEach(function (withdrawal) {
                                        withdrawal.shortDestination = (withdrawal.destination == null) ? '' : withdrawal.destination.substring(0, 8);
                                        withdrawal.fee = withdrawal.fee;/* / 1e8 */
                                    });
                                    user.withdrawals = withdrawals;

                                    database.getETHvsBTCRate(function (err_eb, result) {
                                        if (err_eb) {
                                            return next(new Error('Unable to get ETHvsBTCRate : \n' + err));
                                        }

                                        user.ETHvsBTCRate = result;

                                        if (err_eb === 'PENDING') {
                                            return res.render('withdraw', {
                                                otc_url: otcUrl,
                                                intro_url: intro_url,
                                                user: user,
                                                id: uuid.v4(),
                                                BTCvsBitRate: BTCvsBitRate,
                                                success: 'user_warning12',
                                                testnet: config.TESTNET,
                                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                            });
                                        } else if (err_eb === 'FUNDING_QUEUED') {
                                            return res.render('withdraw', {
                                                otc_url: otcUrl,
                                                intro_url: intro_url,
                                                user: user,
                                                id: uuid.v4(),
                                                BTCvsBitRate: BTCvsBitRate,
                                                success: 'user_warning13',
                                                rate_USD_bit: exchangeRates.rate_USD_bit,
                                                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                            });
                                        }

                                        // return res.render('withdraw_verify', {
                                        //     intro_url: intro_url,
                                        //     user: user,
                                        //     id: uuid.v4(),
                                        //     BTCvsBitRate: BTCvsBitRate,
                                        //     success: 'user_warning14',
                                        //     testnet: config.TESTNET,
                                        //     rate_USD_bit: exchangeRates.rate_USD_bit,
                                        //     rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                                        //     rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                                        // });

                                        return res.redirect('/withdraw-request/?withdraw_success');
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the withdrawal request page
 **/
exports.withdrawRequest = function (req, res) {
    assert(req.user);
    database.getETHvsBTCRate(function (err, result) {
        if (err) return next(new Error('Unable to get ETHvsBTCRate : \n' + err));

        database.getExchangeRate(function (err, rate_all) {
            if (err) return next(new Error('Unable to get Exchange Rate : \n' + err));

            var exchangeRates = {};
            for (var i = 0; i < rate_all.length; i++) { exchangeRates[rate_all[i]['strkey']] = rate_all[i]['strvalue']; }

            var intro_url = lib.getIntroUrl(user.username);
            user.ETHvsBTCRate = result;
            res.render('withdraw', {
                otc_url: otcUrl,
                intro_url: intro_url,
                user: req.user,
                id: uuid.v4(),
                warning: 'withdrawRequest',
                rate_USD_bit: exchangeRates.rate_USD_bit,
                rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
            });
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the support page
 **/
exports.support = function (req, res) {
    var user = req.user;
    assert(user && !user.staff);
    var intro_url = lib.getIntroUrl(user.username);
    res.render('support', {
        intro_url: intro_url,
        user: user,
        data: {}
    });
};

/**
 * Rende Game Hisotry in Sidebar of profile
 * @gae=000000000000000000000000000000000000000
 * @param req
 * @param res
 */
exports.gamehistory = function (req, res) {
    var user = req.user;
    assert(user && !user.staff);
    var intro_url = lib.getIntroUrl(user.username);
    var date_from = lib.removeNullsAndTrim(req.body.date_from);
    var date_to = lib.removeNullsAndTrim(req.body.date_to);
    var time_zone_name = lib.removeNullsAndTrim(req.body.time_zone_name);

    if (date_from === undefined || date_from == '' || date_to === undefined || date_to == '') {
        var d = new Date();
        var month = '' + (d.getMonth() + 1);
        var day = '' + d.getDate();
        var year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        var today_str = [year, month, day].join('-');

        return res.render('gamehistory', {
            user: user,
            date_from: today_str,
            date_to: today_str
        });
    }

    database.getUserGameHistory(user.id, date_from + ' 00:00', date_to + ' 24:00', time_zone_name, function (err, histories) {
        if (err) {
            var d = new Date();
            var month = '' + (d.getMonth() + 1);
            var day = '' + d.getDate();
            var year = d.getFullYear();

            if (month.length < 2) month = '0' + month;
            if (day.length < 2) day = '0' + day;

            var today_str = [year, month, day].join('-');

            return res.render('gamehistory', {
                user: user,
                date_from: today_str,
                date_to: today_str
            });
        }

        res.render('gamehistory', {
            user: user,
            intro_url: intro_url,
            histories: histories,
            date_from: date_from,
            date_to: date_to
        });
    });
};

function notifySupportMsg (user, message_to_admin, callback) {
    database.getAStaff(user.username, function (err, res) {
        if (!err) {
            var to = res.email;
            var emp_name = res.emp_name;
            var msg2Staff = 'Dear ' + emp_name + '!<br>Support message from <strong>' + user.username +
                '</strong> was accepted successfully.<br> His or her email address' +
                ' is <strong>' + user.email + '</strong> The content of support message' +
                ' is as follows:<br><br>' + message_to_admin + '<br><br>' +
                ' Please reply to the message as soon as possible.';
            sendEmail.contact(to, msg2Staff, function (error) {
                if (error) return callback(error);
                else {
                    console.log('email sent successfully to ' + emp_name + '   ' + to + ' to let him handle the support from ' + user.username + '   email:' + user.email);
                    lib.log('info', 'email sent successfully to ' + emp_name + '   ' + to + ' to let him handle the support from ' + user.username + '   email:' + user.email);
                    return callback(null, true);
                }
            });
        }

        // else if (err.indexOf('NO STAFF') >= 0)
        else if (err === 'NO STAFF') {
            return callback(null, false);
        } else {
            return callback(err);
        }
    });
};

/**
 * POST
 * Restricted API
 * process the support page
 **/
exports.saveSupport = function (req, res) {
    assert(req.user);
    var user = req.user;
    var email = req.body.email;
    var message_to_admin = req.body.message;

    database.saveSupport(user.id, email, message_to_admin, function (dbError) {
        if (dbError) {
            return res.send({
                error: dbError
            });
        }

        if (email !== null && email !== 'undefined') {
            notifySupportMsg(user, message_to_admin, function (mailError, fMailSent) {
                if (mailError) {
                    return res.send({
                        error: mailError
                    });
                }
                if (fMailSent) {
                    return res.send({
                        success: 'user_warning17'
                    });
                } else {
                    return res.send({
                        success: 'user_warning18'
                    });
                }
            });
        } else {
            return res.send({
                success: 'user_warning18'
            });
        }
    });
};

exports.uploadAvatar = function (req, res) {
    var user = req.user;
    assert(user);

    var upload_path = __dirname + '/../upload/' + req.files.avatar.name;
    var result_path = __dirname + '/../theme/img/photos/' + user.username + '.jpg';
    if (config.PRODUCTION === config.PRODUCTION_LINUX || config.PRODUCTION === config.PRODUCTION_WINDOWS) {
        result_path = __dirname + '/../build/img/photos/' + user.username + '.jpg';
    }

    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    let sampleFile = req.files.avatar;

    // Use the mv() method to place the file somewhere on your server
    sampleFile.mv(upload_path, function (err) {
        if (err) {
            console.log('upload_avata - error - file.move - username:' + user.username);
            lib.log('error', 'upload_avata - file.move - username:' + user.username);
            return res.status(500).send(err);
        }

        Jimp.read(upload_path, function (err, results) {
            if (err) throw err;
            else {
                results.resize(200, 200)
                    .quality(60)
                    .write(result_path);

                console.log('upload_avata - success - username:' + user.username);
                lib.log('success', 'upload_avata - username:' + user.username);

                res.redirect('/account');
            };
        });
    });
};

exports.getBalanceSatoshis = function (req, res) {
    var user = req.user;
    assert(user);
    var username = user.username;
    database.getUserFromUsername(username, function (err, userInfo) {
        var balance_bits = userInfo.balance_satoshis.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
        res.send(balance_bits);
    });
};

function formatSatoshis (n, decimals) {
    return formatDecimals(n / 100, decimals);
};

function formatDecimals (n, decimals) {
    if (typeof decimals === 'undefined') {
        if (n % 100 === 0) { decimals = 0; } else { decimals = 2; }
    }
    return n.toFixed(decimals).toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};

exports.index = function (req, res) {
    var user = req.user;
    var strEngineHost = lib.getEngineHost();

    if (!user) {
        return res.render('index', {
            enginehost: strEngineHost
        });
    }

    database.getReplyCheck(user.id, function (error, result) {
        if (error) {
            console.log('error occurred while reading reply check states from database - error:' + error);
            lib.log('error', 'error occurred while reading reply check states from database - error:' + error);
        } else {
            user['reply'] = result;
        }
        return res.render('index', {
            enginehost: strEngineHost,
            user: user
        });
    });
};

/**
 * GET
 * Restricted API
 * Shows the transfer history
 **/
exports.transfer = function (req, res, next) {
    var user = req.user;
    assert(user && !user.staff);

    var success = (req.query.m === 'success') ? 'user_warning28' : null;

    database.getTransfers(user.id, user.time_zone, function (err, transfers) {
        if (err) { return next(new Error('Unable to get transfers: ' + err)); }

        database.getTipFee(function (err, tipfee) {
            if (err) return next(new Error('Unable to get tip fee : ' + err));

            database.getMaxTipFeeAmount(function (err, max_tipfee_amount) {
                if (err) return next(new Error('Unable to get max tipfee amount : ' + err));
                var intro_url = lib.getIntroUrl(user.username);
                res.render('transfer', {
                    intro_url: intro_url,
                    user: user,
                    id: uuid.v4(),
                    transfers: transfers,
                    tipfee: tipfee,
                    success: success,
                    max_tipfee_amount: max_tipfee_amount
                });
            });
        });
    });
};

exports.getNotification = function (req, res) {
    var user_id = req.body.id;
    database.getReplyCheck(user_id, function (error, reply) {
        if (error) res.send({error: error});
        else res.send({result: reply});
    });
};

exports.transferJson = function (req, res, next) {
    var user = req.user;
    assert(user);

    database.getTransfers(user.id, user.time_zone, function (err, transfers) {
        if (err) { return next(new Error('Unable to get transfers: ' + err)); }

        res.json(transfers);
    });
};

/**
 * GET
 * Restricted API
 * Shows the transfer request page
 **/

exports.transferRequest = function (req, res) {
    assert(req.user);
    database.getTipFee(function (err, tipfee) {
        database.getMaxTipFeeAmount(function (err, max_tipfee_amount) {
            var intro_url = lib.getIntroUrl(req.user.usernmae);
            if (err) {
                return res.render('transfer', {
                    intro_url: intro_url,
                    user: req.user,
                    id: uuid.v4(),
                    tipfee: '0.1',
                    warning: 'user_warning29',
                    max_tipfee_amount: max_tipfee_amount
                });
            }

            res.render('transfer', {
                intro_url: intro_url,
                user: req.user,
                id: uuid.v4(),
                tipfee: tipfee,
                max_tipfee_amount: max_tipfee_amount
            });
        });
    });
};

/**
 * POST
 * Restricted API
 * Process a transfer (tip)
 **/

exports.handleTransferRequest = function (req, res, next) {
    var user = req.user;
    assert(user);
    var uid = req.body['transfer-id'];
    var amount = lib.removeNullsAndTrim(req.body.amount);
    var toUserName = lib.removeNullsAndTrim(req.body['to-user']);
    var password = lib.removeNullsAndTrim(req.body.password);
    var otp = lib.removeNullsAndTrim(req.body.otp);
    var fee = lib.removeNullsAndTrim(req.body.fee);
    var all = lib.removeNullsAndTrim(req.body.all);
    var r = /^[1-9]\d*(\.\d{0,2})?$/;

    var intro_url = lib.getIntroUrl(user.username);
    database.getTipFee(function (err, tipfee) {
        database.getMaxTipFeeAmount(function (err, max_tipfee_amount) {
            if (!r.test(amount)) {
                return res.render('transfer', {
                    intro_url: intro_url,
                    user: user,
                    id: uuid.v4(),
                    warning: 'user_not_valid_amount',
                    tipfee: tipfee,
                    max_tipfee_amount: max_tipfee_amount
                });
            }

            if (toUserName.toLowerCase() == 'superadmin' ||
                toUserName.toLowerCase() == 'admin' ||
                toUserName.toLowerCase() == 'madabit' ||
                toUserName.toLowerCase() == 'ex_to_mt_' ||
                toUserName.toLowerCase() == 'fun_to_mt_' ||
                toUserName.toLowerCase() == 'staff') {
                return res.render('transfer', {
                    intro_url: intro_url,
                    user: user,
                    id: uuid.v4(),
                    warning: 'user_warning25',
                    tipfee: tipfee,
                    max_tipfee_amount: max_tipfee_amount
                });
            }

            amount = Math.round(parseFloat(amount) * 100);
            fee = Math.round(parseFloat(fee) * 100);
            all = Math.round(parseFloat(all) * 100);

            database.getMinTransferAmount(function (err, min_transfer_amount) {
                if (err) {
                    return res.render('transfer', {
                        intro_url: intro_url,
                        user: user,
                        id: uuid.v4(),
                        warning: 'user_warning19',
                        tipfee: tipfee,
                        max_tipfee_amount: max_tipfee_amount
                    });
                }

                database.getMaxTransferAmount(function (err, max_transfer_amount) {
                    if (err) {
                        return res.render('transfer', {
                            intro_url: intro_url,
                            user: user,
                            id: uuid.v4(),
                            warning: 'user_warning19',
                            tipfee: tipfee,
                            max_tipfee_amount: max_tipfee_amount
                        });
                    }

                    if (all < (min_transfer_amount * 100)) {
                        return res.render('transfer', {
                            intro_url: intro_url,
                            user: user,
                            id: uuid.v4(),
                            tipfee: tipfee,
                            warning: 'user_warning20',
                            extra_param: min_transfer_amount + ' bits.',
                            max_tipfee_amount: max_tipfee_amount
                        });
                    }

                    if (all > (max_transfer_amount * 100)) {
                        return res.render('transfer', {
                            intro_url: intro_url,
                            user: user,
                            id: uuid.v4(),
                            tipfee: tipfee,
                            warning: 'user_warning21',
                            extra_param: max_transfer_amount + ' bits.',
                            max_tipfee_amount: max_tipfee_amount
                        });
                    }

                    database.checkTransferBalance(user.id, all, function (err, bAble) {
                        if (err) {
                            return res.render('transfer', {
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                warning: 'user_warning19',
                                tipfee: tipfee,
                                max_tipfee_amount: max_tipfee_amount
                            });
                        }

                        if (bAble == false) {
                            return res.render('transfer', {
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                tipfee: tipfee,
                                warning: 'user_warning22',
                                max_tipfee_amount: max_tipfee_amount
                            });
                        }

                        if (!password) {
                            return res.render('transfer', {
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                tipfee: tipfee,
                                warning: 'user_warning4',
                                max_tipfee_amount: max_tipfee_amount
                            });
                        }

                        if (user.username.toLowerCase() === toUserName.toLowerCase()) {
                            return res.render('transfer', {
                                intro_url: intro_url,
                                user: user,
                                id: uuid.v4(),
                                tipfee: tipfee,
                                warning: 'user_warning23',
                                max_tipfee_amount: max_tipfee_amount
                            });
                        }

                        database.validateUser(user.username, password, otp, function (err) {
                            if (err) {
                                if (err === 'WRONG_PASSWORD') {
                                    return res.render('transfer', {
                                        intro_url: intro_url,
                                        user: user,
                                        id: uuid.v4(),
                                        tipfee: tipfee,
                                        warning: 'user_warning6',
                                        max_tipfee_amount: max_tipfee_amount
                                    });
                                }
                                if (err === 'INVALID_OTP') {
                                    return res.render('transfer', {
                                        intro_url: intro_url,
                                        user: user,
                                        id: uuid.v4(),
                                        tipfee: tipfee,
                                        warning: 'user_warning7',
                                        max_tipfee_amount: max_tipfee_amount
                                    });
                                }
                                // Should be an user
                                return next(new Error('Unable to validate user handling transfer: ' + err));
                            }
                            // Check destination user

                            database.makeTransfer(uid, user.id, toUserName, amount, fee, all, function (err) {
                                if (err) {
                                    if (err === 'NOT_ENOUGH_BALANCE') {
                                        return res.render('transfer', {
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            tipfee: tipfee,
                                            warning: 'user_warning24',
                                            max_tipfee_amount: max_tipfee_amount
                                        });
                                    }
                                    if (err === 'USER_NOT_EXIST') {
                                        return res.render('transfer', {
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            tipfee: tipfee,
                                            warning: 'user_warning25',
                                            max_tipfee_amount: max_tipfee_amount
                                        });
                                    }
                                    if (err === 'TRANSFER_ALREADY_MADE') {
                                        return res.render('transfer', {
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            tipfee: tipfee,
                                            warning: 'user_warning26',
                                            max_tipfee_amount: max_tipfee_amount
                                        });
                                    }

                                    console.error('[INTERNAL_ERROR] could not make transfer: ' + err);
                                    lib.log('error', '[INTERNAL_ERROR] could not make transfer: ' + err);
                                    return res.render('transfer', {
                                        intro_url: intro_url,
                                        user: user,
                                        id: uuid.v4(),
                                        tipfee: tipfee,
                                        warning: 'user_warning27',
                                        max_tipfee_amount: max_tipfee_amount
                                    });
                                }

                                database.getUserByName(toUserName, function (err, result) {
                                    if (err) {
                                        return res.render('transfer', {
                                            intro_url: intro_url,
                                            user: user,
                                            id: uuid.v4(),
                                            tipfee: tipfee,
                                            warning: 'admin_demo1',
                                            max_tipfee_amount: max_tipfee_amount
                                        });
                                    }
                                    database.notifyTransfer(user, amount, fee, result.id, function (err) {
                                        if (err) {
                                            return res.render('transfer', {
                                                intro_url: intro_url,
                                                user: user,
                                                id: uuid.v4(),
                                                tipfee: tipfee,
                                                warning: 'admin_demo1',
                                                max_tipfee_amount: max_tipfee_amount
                                            });
                                        }
                                        return res.redirect('/transfer');
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};

exports.saveETHUserAddress = function (req, res, next) {
    var user = req.user;
    var eth_src = req.body.eth_src;

    console.log('the deposit address of username:' + user.username + ' is saved as ' + eth_src);
    lib.log('error', 'the deposit address of username:' + user.username + ' is saved as ' + eth_src);

    database.saveETHUserAddress(user.id, eth_src, function (err) {
        if (err) console.log(err);
    });

    database.getDeposits(user.id, user.time_zone, function (err, deposits) {
        if (err) {
            return next(new Error('Unable to get deposits: \n' + err));
        }
        user.deposits = deposits;
        user.deposit_address = {};
        user.deposit_address['BTC'] = lib.deriveAddress(user.id, 'BTC');
        user.deposit_address['ETH'] = lib.deriveAddress(user.id, 'ETH');
        user.deposit_src = eth_src;

        database.getExchangeRate(function (err, rate_all) {
            var exchangeRates = {};
            for (var i = 0; i < rate_all.length; i++) { exchangeRates[rate_all[i]['strkey']] = rate_all[i]['strvalue']; }

            database.getETHvsBTCRate(function (err, result) {
                if (err) {
                    return next(new Error('Unable to get ETH / BTC : \n' + err));
                }

                user.ETHvsBTCRate = result;

                var intro_url = lib.getIntroUrl(user.username);
                return res.render('deposit', {
                    intro_url: intro_url,
                    user: user,
                    rate_USD_bit: exchangeRates.rate_USD_bit,
                    rate_BTC_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_BTC_USD,
                    rate_ETH_bit: exchangeRates.rate_USD_bit * exchangeRates.rate_ETH_USD
                });
            });
        });
    });
};

exports.deleteMail = function (req, res) {
    var mail_id = req.body.id;
    var user = req.user;
    var user_id = user.id;

    database.deleteMail(mail_id, function (error, result) {
        if (error) {
            return res.send({ error: error });
        } else {
            database.getReplyCheck(user_id, function (err_reply, res_reply) {
                if (err_reply) {
                    return res.send({error: err_reply});
                } else {
                    user['reply'] = res_reply;
                    return res.send({ user: user });
                }
            });
        }
    });
};

exports.requestVerifyCode = function (req, res) {
    var user = req.user;
    var user_id = req.body.user_id;

    var strVerifyCode = lib.getPhoneVerifyCode();

    database.requestVerifyCode(user_id, strVerifyCode, function (err, phone_number) {
        if (err) {
            console.log('request_verify_code - error - user_id:' + user_id + '   verify_code:' + strVerifyCode + '   error:' + err);
            lib.log('error', 'request_verify_code - user_id:' + user_id + '   verify_code:' + strVerifyCode + '   error:' + err);
            return res.send('failed');
        }

        console.log('request_verify_code - success - user_id:' + user_id + '   verify_code:' + strVerifyCode);
        lib.log('success', 'request_verify_code - user_id:' + user_id + '   verify_code:' + strVerifyCode);

        // if (phone_number == '85569845910') {
        //     return res.send('success');
        // }

        sendVerificationCode(phone_number, strVerifyCode, req.i18n_lang, function (err, sendResult) {
            if (err || parseInt(sendResult) < 0) {
                console.log('request_verify_code - send_verify_code - error - user_id:' + user_id + '   verify_code:' + strVerifyCode + '   phone_number:' + phone_number);
                lib.log('error', 'request_verify_code - send_verify_code - user_id:' + user_id + '   verify_code:' + strVerifyCode + '   phone_number:' + phone_number);

                return res.send('phone_err');
            }

            console.log('request_verify_code - send_verify_code - success - user_id:' + user_id + '   verify_code:' + strVerifyCode + '   phone_number:' + phone_number);
            lib.log('success', 'request_verify_code - send_verify_code - user_id:' + user_id + '   verify_code:' + strVerifyCode + '   phone_number:' + phone_number);

            return res.send('success');
        });
    });
};

/**
 * Get Users(agent or master-ib) List
 * @author Bio
 */
exports.getAgentUserList = function (req, res) {
    database.getAgentUserList(function (err, result) {
        if (err) { return callback(err); }
        return res.send(result);
    });
};
