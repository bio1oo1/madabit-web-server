var assert = require('better-assert');
var lib = require('./lib');
var config = require('../config/config');
var Web3 = require('web3');
var rpc = require('jsonrpc');

var ethUrl;
if (config.PRODUCTION === config.PRODUCTION_LOCAL) ethUrl = config.ETH_URL_LOCAL;
if (config.PRODUCTION === config.PRODUCTION_LINUX) ethUrl = config.ETH_URL_LINUX;
if (config.PRODUCTION === config.PRODUCTION_WINDOWS) ethUrl = config.ETH_URL_WINDOWS;

var client = new Web3(new Web3.providers.HttpProvider(ethUrl));

console.log('web server connected to geth-rpc : [', ethUrl, ']');
lib.log('info', 'web server connected to geth-rpc : [', ethUrl, ']');

client.getTransactionIdsAddresses = function (txIds, callback) {
    lib.chunkRun(doGetTransactionIdsAddresses, txIds, 20, 2, callback);
};

function callRpc (cmd, args, rpc) {
    var fn = args[args.length - 1];

    // If the last argument is a callback, pop it from the args list
    if (typeof fn === 'function') {
        args.pop();
    } else {
        fn = function () {};
    }

    rpc.call(cmd, args, function () {
        var args = [].slice.call(arguments);
        args.unshift(null);
        fn.apply(this, args);
    }, function (err) {
        fn(err);
    });
}

function myCmd () {
    var args = [].slice.call(arguments);
    var cmd = args.shift();
    callRpc(cmd, args, this.rpc);
};

function doGetTransactions (txIds, callback) {
    if (txIds.length === 0) { return callback(null, []); }

    var batch = txIds.map(function (txId) {
        return {
            method: 'client.eth.getTransaction',
            params: [txId]
        };
    });

    var abort = false;
    var transactions = [];
    var count = 0;

    myCmd(batch, function (err, transaction) {
        if (abort) return;

        if (err) {
            abort = true;
            return callback(err);
        }

        transactions.push(transaction);

        if (++count === txIds.length) {
            return callback(null, transactions);
        }

        assert(count < txIds.length);
    });
};

client.getTransactions = function (txIds, callback) {
    return lib.chunkRun(doGetTransactions, txIds, 3, 1, function (err, data) {
        if (err) {
            console.error('error - when fetching transaction_id:' + txIds.length + '   error:' + err);
            lib.log('error', 'error - when fetching transaction_id:' + txIds.length + '   error:' + err);
            return callback(err);
        }
        callback(null, data);
    });
};

/* get the transaction using ethereu */
client.getTransaction = function (transactionHash, callback) {
    client.eth.getTransaction(transactionHash);
};

// returns [{address: amount}])
function transactionsAddresses (transactions) {
    return transactions.map(function (transaction) {
        var addressToAmount = {};

        transaction.vout.forEach(function (out) {
            var addresses = out.scriptPubKey.addresses;
            if (!addresses || addresses.length !== 1) {
                return;
            }

            assert(out.value >= 0);
            var oldAmount = addressToAmount[addresses[0]] || 0;
            addressToAmount[addresses[0]] = oldAmount + out.value;
        });

        return addressToAmount;
    });
}

function doGetTransactionIdsAddresses (txids, callback) {
    doGetTransactions(txids, function (err, transactions) {
        if (err) return callback(err);

        callback(null, transactionsAddresses(transactions));
    });
}

client.getBlockHash = function (blockNumber, callback) {
    client.eth.getBlock(blockNumber, function (err, blockInfo) {
        if (err) {
            console.error('error - getting block:' + blockNumber + '   error:' + err);
            lib.log('error', 'error - getting block:' + blockNumber + '   error:' + err);
            return callback(err);
        }
        if (blockInfo == null) return callback('[MY ERROR LOG] Cannot get block information.');
        return callback(null, blockInfo.hash);
    });
};

client.getBlockNumber = function (callback) {
    client.eth.getBlockNumber(function (err, number) {
        if (err) return callback(err);
        return callback(null, number);
    });
};

module.exports = {
    web3: client
};
