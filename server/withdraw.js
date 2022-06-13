
var assert = require('assert');
var bc = require('./bitcoin_client');
var db = require('./database');
var request = require('request');
var config = require('../config/config');
var Tx = require('ethereumjs-tx');
var util = require('ethereumjs-util');
var querystring = require('querystring');
var sendEmail = require('./sendEmail');
// use local ipc provider
// var net = require('net');
// var web3 = new Web3(new Web3.providers.IpcProvider('\\\\.\\pipe\\geth.ipc'));

// use local http provier
var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

function waitForReceipt (hash, cb) {
    web3.eth.getTransaction(hash, function (error, result) {
    // console.clear();
    // console.log('Now transaction offer is pending.');

    // check if the transaction is pending or not
        if (error || result.blockNumber == null) {
            setTimeout(function () {
                waitForReceipt(hash, cb);
            }, 1000);
            return;
        }
        web3.eth.getTransactionReceipt(hash, function (err, receipt) {
            if (err) {
                console.error(err);
                return;
            }
            if (receipt !== null) {
                // Transaction went through
                if (cb) {
                    cb(receipt);
                }
            } else {
                // Try again in 1 second
                setTimeout(function () {
                    waitForReceipt(hash, cb);
                }, 1000);
            }
        });
    });
}

/*
 * perform withdraw process
 */
module.exports = function (user, game_points, withdrawalAddress, withdrawalId, cointype, fee, callback) {
    var minWithdraw = config.MINING_FEE + 10000;
    assert(typeof user.id === 'number');
    assert(game_points >= minWithdraw);
    assert(typeof withdrawalAddress === 'string');
    assert(typeof cointype === 'string');
    assert(typeof callback === 'function');

    db.getDidDeposit(user.id, function (err, did_diposit) {
        if (err) {
            callback('NO_DEPOSIT');
            return;
        }

        if (did_diposit == null) did_diposit = 0;

        db.getCommonSettingWithKey({strkey:'minimum_deposit_amount_for_withdrawal'}, function(err, minimumDepositAmountMap) {
            if(err)
                return callback(err);
            if (parseInt(did_diposit) > parseInt(minimumDepositAmountMap.strvalue)) {
                db.makeWithdrawal(user.id, game_points, withdrawalAddress, withdrawalId, cointype, fee, function (err, wdb_info) {
                    if (err) {
                        if (err.code === '23514') {
                            callback('NOT_ENOUGH_MONEY');
                        } else if (err.code === '23505') {
                            callback('SAME_WITHDRAWAL_ID');
                        } else {
                            callback(err);
                        }
                        return;
                    }

                    assert(wdb_info);

                    var amountToSend;
                    if (cointype === 'BTC') {
                        if (config.MANUAL_WITHDRAW) {
                            var param = {};
                            param.amount = game_points;
                            param.username = user.username;
                            param.cointype = cointype;

                            sendEmail.sendWithdrawNotifyMail(param, function (err) {
                                if (err) {
                                    console.log(err);
                                    console.log('error - send Email');

                                    return callback(err);
                                }
                                return callback(null);
                            });
                        } else {

                            amountToSend = wdb_info.baseunit;

                            console.log('withdrawal game_points to send : ', amountToSend);

                            bc.sendToAddress(withdrawalAddress, amountToSend, function (err, hash) {
                                if (err) {
                                    if (err.message === 'Insufficient funds') {
                                        return callback('PENDING');
                                    }
                                    return callback('FUNDING_QUEUED');
                                }

                                db.setFundingsWithdrawalTxid(wdb_info.funding_id, hash, function (err) {
                                    if (err) {
                                        return callback(new Error('Could not set funding id ' + wdb_info.funding_id + ' to ' + hash + ': \n' + err));
                                    }

                                    return callback(null);
                                });
                            });
                        }
                    } else if (cointype == 'ETH') {
                        if (config.MANUAL_WITHDRAW) {
                            var param = {};
                            param.amount = game_points;
                            param.username = user.username;
                            param.cointype = cointype;

                            sendEmail.sendWithdrawNotifyMail(param, function (err) {
                                if (err) {
                                    console.log(err);
                                    console.log('error - send Email');

                                    return callback(err);
                                }
                                return callback(null);
                            });
                        } else {

                            amountToSend = parseInt(wdb_info.baseunit * 1e18);

                            db.loadCompanyETHInfo(function (err, result) {
                                // load deposit source
                                if (err) return callback(err);

                                fromAccount = result.addr;
                                fromAccountPassword = result.pass;

                                // work with loaded deposit source
                                toAccount = withdrawalAddress;

                                value = web3.utils.toHex(amountToSend);

                                web3.eth.personal.unlockAccount(fromAccount, fromAccountPassword, 600)
                                    .then(function (result) {
                                        web3.eth.sendTransaction({
                                            from: fromAccount,
                                            to: toAccount,
                                            value: value
                                        })
                                            .on('transactionHash', function (hash) {
                                                // waitForReceipt(hash, function (receipt) {
                                                console.log('\n Transaction sent successfully. Check the transaction hash ', hash);

                                                db.setFundingsWithdrawalTxid(wdb_info.funding_id, hash, function (err) {
                                                    if (err) {
                                                        return callback(new Error('Could not set funding_id ' + wdb_info.funding_id + ' to ' + hash + ': \n' + err));
                                                    }
                                                });
                                                // })
                                            })
                                            .on('receipt', function (receipt) {
                                                web3.eth.getBalance('' + toAccount + '').then(function (result) {
                                                    console.log(' Result in getBalance function ', result);
                                                }).catch(function (error) {
                                                    console.log('Error', error);
                                                });
                                            }).catch(function (error) {
                                            // console.log("------------- Transaction receipt error -------------\n", error);
                                            // console.log("Transaction receipt error occured.");
                                        });
                                    }).catch(function (error) {
                                    console.log('------------- Error occurred while unlocking account -------------\n', error);
                                });

                                // web3.eth.personal.lockAccount(fromAccount);

                                return callback(null);
                            });
                        }
                    } else {    //cointype == MDC or Madecoin
                        var form = {
                            username: 'madabit',
                            password: 'fuckfuck'
                        };

                        var formData = querystring.stringify(form);
                        var contentLength = formData.length;
                        var uri = '';

                        if (config.PRODUCTION == 'LOCAL') {
                            uri = config.OTC_URL_LOCAL + 'api/getMadabitAddress';
                        } else if (config.PRODUCTION == 'LINUX') {
                            uri = config.OTC_URL_TEST_SERVER + 'api/getMadabitAddress';
                        } else if (config.PRODUCTION == 'WINDOWS') {
                            uri = config.OTC_URL_REAL_SERVER + 'api/getMadabitAddress';
                        }

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

                            var form = {
                                target: withdrawalAddress,
                                source: madabit_address_otcmode,
                                amount: game_points / 1000.0,
                                username: 'madabit',
                                password: 'fuckfuck'
                            };

                            var formData = querystring.stringify(form);
                            var contentLength = formData.length;
                            var uri = '';

                            if (config.PRODUCTION == 'LOCAL') {
                                uri = config.OTC_URL_LOCAL + 'api/transferToken';
                            } else if (config.PRODUCTION == 'LINUX') {
                                uri = config.OTC_URL_TEST_SERVER + 'api/transferToken';
                            } else if (config.PRODUCTION == 'WINDOWS') {
                                uri = config.OTC_URL_REAL_SERVER + 'api/transferToken';
                            }

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
                                    console.log('error', 'transferToken api ');
                                    return callback(err);
                                }
                                if (body == undefined) {
                                    console.log('error', 'transerToken api no body');
                                    return callback(null);
                                }

                                body = JSON.parse(body);
                                if (body.status == 'failed') {
                                    console.log('error', 'transferToken failed');
                                    return callback(body.msg);
                                }
                                return callback(body.msg);
                            });
                        });
                        // });
                    }
                });
            } else {
                return callback('NOT_ENOUGH_DEPOSIT');
            }
        });
    });
};

// .on('receipt', function(receipt){
//     console.log("--------------------------");
//     console.log(receipt);
//     console.log("--------------------------");
//     web3.eth.getBalance('' + toAccount + '').then(function (result) {
//         console.log(" Result in getbalance function of destination account is ", result);
//     }).catch(function (error) {
//         console.log("[My Error Message] getBalance function raises error : ", error);
//     });
// })
// .on('confirmation', function(confirmationNumber, receipt){
//     console.log("--------------------------");
//     console.log('Confirmation ', confirmationNumber, 'successfully done');
//     console.log("--------------------------");
// })
// .on('error', console.error);
