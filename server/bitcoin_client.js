
var bitcoin = require('bitcoin');
var config = require('../config/config');

var btcHost;
var btcPort;
var btcUser;
var btcPass;

if (config.PRODUCTION === config.PRODUCTION_LOCAL) {
    btcHost = config.BITCOIND_HOST_LOCAL;
    btcPort = config.BITCOIND_PORT_LOCAL;
    btcUser = config.BITCOIND_USER_LOCAL;
    btcPass = config.BITCOIND_PASS_LOCAL;
} else if (config.PRODUCTION === config.PRODUCTION_LINUX) {
    btcHost = config.BITCOIND_HOST_LINUX;
    btcPort = config.BITCOIND_PORT_LINUX;
    btcUser = config.BITCOIND_USER_LINUX;
    btcPass = config.BITCOIND_PASS_LINUX;
} else if (config.PRODUCTION === config.PRODUCTION_WINDOWS) {
    btcHost = config.BITCOIND_HOST_WINDOWS;
    btcPort = config.BITCOIND_PORT_WINDOWS;
    btcUser = config.BITCOIND_USER_WINDOWS;
    btcPass = config.BITCOIND_PASS_WINDOWS;
}

var client = new bitcoin.Client({
    host: btcHost,
    port: btcPort,
    user: btcUser,
    pass: btcPass,
    timeout: 240000
});

module.exports = client;
