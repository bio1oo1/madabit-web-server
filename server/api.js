var assert = require('better-assert');
var passwordHash = require('password-hash');
var database = require('./database');
var config = require('../config/config');
var lib = require('./lib');

exports.getPlayerInfo = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var playername = req.body.playername;

    console.log('get_player_info api - username:' + username + '   playername:' + playername);

    if (username == undefined || password == undefined || playername == undefined) {
        var result = {status: 'failed', msg: 'Parameter is not valid'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        var result = {status: 'failed', msg: 'Wrong password'};
        return res.send(JSON.stringify(result));
    }

    database.getUserInfoByUsername_api(playername, function (err, playerinfo) {
        var result = {};
        if (err) {
            result = {status: 'failed', msg: err.message};
            return res.send(JSON.stringify(result));
        } else if (playerinfo.length == 0) {
            result = {status: 'failed', msg: 'There is no user with username'};
            return res.send(JSON.stringify(result));
        }

        result = {status: 'success', msg: playerinfo[0]};
        return res.send(JSON.stringify(result));
    });
};

exports.getBalanceById = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var playerid = req.body.playerid;

    console.log('get_balance_by_id api [begin] - username:' + username  + '   playerid:' + playerid);

    if (username == undefined || password == undefined || playerid == undefined) {
        var result = {status: 'failed', msg: 'Parameter is not valid'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        var result = {status: 'failed', msg: 'Wrong password'};
        return res.send(JSON.stringify(result));
    }

    database.getUserInfoById_api(playerid, function (err, playerInfo) {
        var result = {};
        if (err) {
            result = {status: 'failed', msg: err.message};
            return res.send(JSON.stringify(result));
        } else if (playerInfo.length == 0) {
            result = {status: 'failed', msg: 'There is no user with playerid'};
            return res.send(JSON.stringify(result));
        }

        console.log('get_balance_by_id api [end] - username:' + username + '   playerid:' + playerid + '   balance:' + playerInfo[0].balance_satoshis);
        result = {status: 'success', msg: playerInfo[0].balance_satoshis};
        return res.send(JSON.stringify(result));
    });
};

exports.updateBalance = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var playerid = req.body.playerid;
    var amount = req.body.amount; // satoshis
    var fee = req.body.fee;

    if (fee == undefined || fee == null) {
        fee = 0;
    }

    fee = Math.round(fee);

    console.log('info update_balance_api - username:' + username + '   playerid:' + playerid + '   amount:' + amount + '   fee:' + fee);
    lib.log('info', 'update_balance_api - username:' + username +  '   playerid:' + playerid + '   amount:' + amount + '   fee:' + fee);

    if (username == undefined || password == undefined || playerid == undefined || amount == undefined) {
        var result = {status: 'failed', msg: 'Parameter is not valid'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        var result = {status: 'failed', msg: 'Wrong password'};
        return res.send(JSON.stringify(result));
    }

    if (amount > 0) {
        // console.log("updateBalance begin: " + playerid + ", " + amount);
        database.updateBalance_api(playerid, amount, fee, function (err, playerInfo) {
            var result = {};
            if (err) {
                result = {status: 'failed', msg: err.message};
                return res.send(JSON.stringify(result));
            } else if (playerInfo.length == 0) {
                result = {status: 'failed', msg: 'There is no user with playerid'};
                return res.send(JSON.stringify(result));
            }

            // console.log("updateBalance end: " + playerid + ", " + amount);
            result = {status: 'success', msg: ''};
            return res.send(JSON.stringify(result));
        });
    } else if (amount < 0) {
        database.getDidDeposit(playerid, function (err, amount_deposit) {
            if (parseInt(amount_deposit) == 0 || amount_deposit == undefined) {
                result = {status: 'failed', msg: 'No Deposit'};
                return res.send(JSON.stringify(result));
            }

            database.updateBalance_api(playerid, amount, fee, function (err, playerInfo) {
                var result = {};
                if (err) {
                    result = {status: 'failed', msg: err.message};
                    return res.send(JSON.stringify(result));
                } else if (playerInfo.length == 0) {
                    result = {status: 'failed', msg: 'There is no user with playerid'};
                    return res.send(JSON.stringify(result));
                }

                // console.log("updateBalance end: " + playerid + ", " + amount);
                result = {status: 'success', msg: ''};
                return res.send(JSON.stringify(result));
            });
        });
    }
};

exports.getCompanyBalance = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;

    if (username == undefined || password == undefined) {
        var result = {status: 'failed', msg: 'Parameter is not valid'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        var result = {status: 'failed', msg: 'Wrong password'};
        return res.send(JSON.stringify(result));
    }

    database.getCompanyBalance_api(function (err, companyInfo) {
        var result = {};
        if (err) {
            result = {status: 'failed', msg: err.message};
            return res.send(JSON.stringify(result));
        } else if (companyInfo.length == 0) {
            result = {status: 'failed', msg: 'There is no company account'};
            return res.send(JSON.stringify(result));
        }

        result = {status: 'success', msg: companyInfo[0].balance_satoshis};
        return res.send(JSON.stringify(result));
    });
};

exports.increaseCompanyBalance = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var amount = req.body.amount;

    if (username == undefined || password == undefined || amount == undefined) {
        var result = {status: 'failed', msg: 'Parameter is not valid'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        var result = {status: 'failed', msg: 'Wrong password'};
        return res.send(JSON.stringify(result));
    }

    database.increaseCompanyBalance_api(amount, function (err, data) {
        var result = {};
        if (err) {
            result = {status: 'failed', msg: err.message};
            return res.send(JSON.stringify(result));
        } else if (data != true) {
            result = {status: 'failed', msg: 'There is no company account'};
            return res.send(JSON.stringify(result));
        }

        // console.log("increaseCompanyBalance end: " + amount);
        result = {status: 'success', msg: ''};
        return res.send(JSON.stringify(result));
    });
};

/**
 * API for Funding Site
 * @param userId
 * @param userPassword
 * @param playerName
 * @param playerPassword
 * @return {status:'success', data:GPbalance}
 * @return {status:'failed', data:'SEVER ERROR'}
 */
exports.confirmInfo = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var playerName = req.body.playerName;
    var playerPassword = req.body.playerPassword;

    lib.log('info', 'api.confirm_info - [begin] username:' + username +

        '   playername:' + playerName +
        '   playerpassword:' + playerPassword);
    console.log('info', 'api.confirm_info - [begin] username:' + username +
        '   password:' + password +
        '   playername:' + playerName +
        '   playerpassword:' + playerPassword);

    if (username == undefined || password == undefined || playerName == undefined || playerPassword == undefined) {
        lib.log('error', 'api.confirm_info - parameter error    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   playerpassword:' + playerPassword);
        console.log('error', 'api.confirm_info - parameter error    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   playerpassword:' + playerPassword);
        var result = {status: 'failed', data: 'PARAMETER ERROR'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'fun_to_mt_' || password != config.TOPUP_PASS) {
        lib.log('error', 'api.confirm_info - wrong password user    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   playerpassword:' + playerPassword);
        console.log('error', 'api.confirm_info - wrong password user    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   playerpassword:' + playerPassword);
        result = {status: 'failed', data: 'NO USER'};
        var result = {status: 'failed', data: 'WRONG PASSWORD'};
        return res.send(JSON.stringify(result));
    }

    database.getUserInfoByUsername_api(playerName, function (err, playerInfo) {
        var result = {};
        if (err) {
            result = {status: 'failed', data: 'SERVER ERROR'};
            return res.send(JSON.stringify(result));
        } else if (playerInfo.length == 0) {
            lib.log('error', 'api.confirm_info - no user    username:' + username +
                '   password:' + password +
                '   playername:' + playerName +
                '   playerpassword:' + playerPassword);
            console.log('error', 'api.confirm_info - no user    username:' + username +
                '   password:' + password +
                '   playername:' + playerName +
                '   playerpassword:' + playerPassword);
            result = {status: 'failed', data: 'NO USER'};
            return res.send(JSON.stringify(result));
        }

        var verified = passwordHash.verify(playerPassword, playerInfo[0].password);
        if (!verified) {
            lib.log('error', 'api.confirm_info - wrong player password    username:' + username +
                '   password:' + password +
                '   playername:' + playerName +
                '   playerpassword:' + playerPassword);
            console.log('error', 'api.confirm_info - wrong player password    username:' + username +
                '   password:' + password +
                '   playername:' + playerName +
                '   playerpassword:' + playerPassword);
            result = {status: 'failed', data: 'WRONG PLAYER PASSWORD'};
            return res.send(JSON.stringify(result));
        }
        lib.log('info', 'api.confirm_info - [end] username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   playerpassword:' + playerPassword);
        console.log('info', 'api.confirm_info - [end] username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   playerpassword:' + playerPassword);
        result = {status: 'success', data: playerInfo[0].balance_satoshis / 100};
        return res.send(JSON.stringify(result));
    });
};

exports.increaseGpBalance = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var playerName = req.body.playerName;
    var amount = req.body.amount;
    var baseunit = req.body.baseunit;
    var currency = req.body.currency;

    lib.log('info', 'api.increase_gp_balance - [begin] username:' + username +
        '   password:' + password +
        '   playername:' + playerName +
        '   amount:' + amount +
        '   baseunit:' + baseunit +
        '   currency:' + currency);
    console.log('info', 'api.increase_gp_balance - [begin] username:' + username +
        '   password:' + password +
        '   playername:' + playerName +
        '   amount:' + amount +
        '   baseunit:' + baseunit +
        '   currency:' + currency);

    if (username == undefined || password == undefined || playerName == undefined || amount == undefined || baseunit == undefined || currency == undefined) {
        lib.log('error', 'api.increase_gp_balance - parameter error    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   amount:' + amount +
            '   baseunit:' + baseunit +
            '   currency:' + currency);
        console.log('error', 'api.increase_gp_balance - parameter error    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   amount:' + amount +
            '   baseunit:' + baseunit +
            '   currency:' + currency);
        var result = {status: 'failed', data: 'PARAMETER ERROR'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'fun_to_mt_' || password != config.TOPUP_PASS) {
        lib.log('error', 'api.increase_gp_balance - wrong password    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   amount:' + amount +
            '   baseunit:' + baseunit +
            '   currency:' + currency);
        console.log('error', 'api.increase_gp_balance - wrong password    username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   amount:' + amount +
            '   baseunit:' + baseunit +
            '   currency:' + currency);
        var result = {status: 'failed', data: 'WRONG PASSWORD'};
        return res.send(JSON.stringify(result));
    }

    amount = amount * 100;
    // var baseunit = amount / 700;
    // var currency = '';
    database.depositFromFundingSite_api(playerName, amount, baseunit, currency, function (err, data) {
        var result = {};
        if (err || data != true) {
            result = {status: 'failed', data: 'SERVER ERROR'};
            return res.send(JSON.stringify(result));
        }

        lib.log('info', 'api.increase_gp_balance - [end] username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   amount:' + amount +
            '   baseunit:' + baseunit +
            '   currency:' + currency);
        console.log('info', 'api.increase_gp_balance - [end] username:' + username +
            '   password:' + password +
            '   playername:' + playerName +
            '   amount:' + amount +
            '   baseunit:' + baseunit +
            '   currency:' + currency);
        result = {status: 'success', data: 'SUCCESS'};
        return res.send(JSON.stringify(result));
    });
};

/**
 * Increase the amount of GPs using tokens
 * @author  pichmuy
 * @param   target      target tokens address GPs of which should be inceased
 * @param   amount      the amount of tokens transferred
 * @param   callback    takes (error, result)
 */
exports.tokenDeposit = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var target = req.body.target;
    var amount = req.body.amount;

    lib.log('info', 'api.tokenDeposit - [begin] username:' + username +
        '   password:' + password +
        '   amount:' + amount +
        '   target:' + target);
    console.log('info', 'api.tokenDeposit - [begin] username:' + username +
        '   password:' + password +
        '   amount:' + amount +
        '   target:' + target);

    if (username == undefined || password == undefined || amount == undefined || target == undefined) {
        lib.log('error', 'api.tokenDeposit - parameter error    username:' + username +
            '   password:' + password +
            '   amount:' + amount +
            '   target:' + target);
        console.log('error', 'api.tokenDeposit - parameter error    username:' + username +
            '   password:' + password +
            '   amount:' + amount +
            '   target:' + target);
        var result = {status: 'failed', data: 'PARAMETER ERROR'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        lib.log('error', 'api.tokenDeposit - wrong password    username:' + username +
            '   password:' + password +
            '   amount:' + amount +
            '   target:' + target);
        console.log('error', 'api.tokenDeposit - wrong password    username:' + username +
            '   password:' + password +
            '   amount:' + amount +
            '   target:' + target);
        var result = {status: 'failed', data: 'WRONG PASSWORD'};
        return res.send(JSON.stringify(result));
    }

    var form = {};

    var formData = querystring.stringify(form);
    var contentLength = formData.length;
    var uri = '';

    if (config.PRODUCTION == 'LOCAL') { uri = config.OTC_URL_LOCAL + 'api/getMadabitAddress'; } else if (config.PRODUCTION == 'LINUX') { uri = config.OTC_URL_TEST_SERVER + 'api/getMadabitAddress'; } else if (config.PRODUCTION == 'WINDOWS') { uri = config.OTC_URL_REAL_SERVER + 'api/getMadabitAddress'; }

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
            return callback(err);
        }
        body = JSON.parse(body);
        if (body.status == 'failed') {
            console.log('error', 'transferToken failed');
            return callback(body.msg);
        }

        var madabit_address_otcmode = body.msg;
        database.tokenDeposit(target, amount, madabit_address_otcmode, function (error, data) {
            if (error) {
                res.json({
                    status: 'failed',
                    data: error
                });
            } else {
                res.json({
                    status: 'success',
                    data: null
                });
            }
        });
    });
};

/**
 * update gps of an account
 * @author  pichmuy
 * @param   target      target tokens address GPs of which should be inceased
 * @param   amount      the amount of tokens transferred
 * @param   callback    takes (error, result)
 */
exports.updateMDC = function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var address = req.body.address;
    var balance = req.body.balance;

    lib.log('info', 'api.updateMDC - [begin] username:' + username +
        '   address:' + address +
        '   balance:' + balance);
    console.log('info', 'api.updateMDC - [begin] username:' + username +
        '   password:' + password +
        '   address:' + address +
        '   balance:' + balance);

    if (username == undefined || password == undefined || balance == undefined || address == undefined) {
        lib.log('error', 'api.updateMDC - parameter error    username:' + username +
            '   address:' + address +
            '   balance:' + balance);
        console.log('error', 'api.updateMDC - parameter error    username:' + username +
            '   password:' + password +
            '   address:' + address +
            '   balance:' + balance);
        var result = {status: 'failed', data: 'PARAMETER ERROR'};
        return res.send(JSON.stringify(result));
    }

    if (username != 'ex_to_mt_' || password != config.MADAEX_PASS) {
        lib.log('error', 'api.updateMDC - wrong password    username:' + username +
            '   address:' + address +
            '   balance:' + balance);
        console.log('error', 'api.updateMDC - wrong password    username:' + username +
            '   address:' + address +
            '   balance:' + balance);
        var result = {status: 'failed', data: 'WRONG PASSWORD'};
        return res.send(JSON.stringify(result));
    }

    database.updateMDC(address, balance, function (error) {
        if (error) {
            lib.log('error', 'api.updateMDC - after operation   username:' + username +
                '   address:' + address +
                '   balance:' + balance + '    ' + error);
            console.log('error', 'api.updateMDC - after operation   username:' + username +
                '   address:' + address +
                '   balance:' + balance + '    ' + error);
            return res.json({ status: 'failed', msg: error});
        }

        lib.log('info', 'api.updateMDC - [end] username:' + username +
            '   address:' + address +
            '   balance:' + balance);
        console.log('info', 'api.updateMDC - [end] username:' + username +
            '   address:' + address +
            '   balance:' + balance);
        return res.json({ status: 'success', msg: null });
    });
};
