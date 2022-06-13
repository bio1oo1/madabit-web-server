/**
 * For development you can set the variables by creating a .env file on the root
 */

var fs = require('fs');

var productLocal = 'LOCAL';
var productLinux = 'LINUX';
var productWindows = 'WINDOWS';

var production;
production = productLocal;
// production = productLinux;
// production = productWindows;

var prodConfig;
if (production === productLinux || production === productWindows) {
    prodConfig = JSON.parse(fs.readFileSync('./config/build-config.json'));
    console.log('-- [', prodConfig['main.min.js'], '] loaded.');
}

module.exports = {

    TESTNET: true,

    PRODUCTION: production,

    PRODUCTION_LOCAL: productLocal,
    PRODUCTION_LINUX: productLinux,
    PRODUCTION_WINDOWS: productWindows,

    DATABASE_URL_LOCAL: 'postgres://postgres:123456@localhost/bustabitdb', // database url for local developmennt
    DATABASE_URL_LINUX: 'postgres://postgres:123456@47.75.43.93/bustabitdb', // database url for linux server - test
    DATABASE_URL_WINDOWS: 'postgres://postgres:bmUgswMNVK9n4J7S@172.17.0.6/bustabitdb', // database url for windows server - production

    BIP32_DERIVED: 'xprv9wUy87KN49Dwz4Y7KZuJLV9o4a7qvkU51RzYZC8EJ6VeJadtbXvvXjJAvxWzz7aw5fho3fb4CWrevd8B1gwpykp1dSXYsKwrmSzn7qJET5y',
    BIP32_PRIV: 'xprv9wUy87KN49Dwz4Y7KZuJLV9o4a7qvkU51RzYZC8EJ6VeJadtbXvvXjJAvxWzz7aw5fho3fb4CWrevd8B1gwpykp1dSXYsKwrmSzn7qJET5y',

    ENGINE_HOST_LINUX: 'madabit.net',
    ENGINE_HOST_WINDOWS: 'madexnow.com',

    SITE_URL_LINUX: 'madabit.net',
    SITE_URL_WINDOWS: 'madabit.com',

    ETH_URL_LOCAL: 'http://localhost:8545', // eth rpc url for local - developmennt
    ETH_URL_LINUX: 'http://localhost:8545', // eth rpc url for linux server - test
    ETH_URL_WINDOWS: 'http://172.17.0.4:8545', // eth rpc url for windows server - production

    OTC_URL_LOCAL: 'http://192.168.1.100:8080/',
    OTC_URL_TEST_SERVER: 'http://47.52.174.9/',
    OTC_URL_REAL_SERVER: 'https://172.17.0.2/',

    OTC_WITHDRAW_URL_LOCAL: 'http://192.168.1.100:8080/',
    OTC_WITHDRAW_URL_TEST_SERVER: 'http://47.52.174.9/',
    OTC_WITHDRAW_URL_REAL_SERVER: 'https://www.otcmode.com/',

    // bitcoind for development
    BITCOIND_HOST_LOCAL: 'localhost',
    BITCOIND_PORT_LOCAL: 8332,
    BITCOIND_USER_LOCAL: 'bio',
    BITCOIND_PASS_LOCAL: '3HTJFDMaDxiRc71jUkdyFcMFLwbB7rZHtY',
    // bitcoind for test
    BITCOIND_HOST_LINUX: 'localhost',
    BITCOIND_PORT_LINUX: 8332,
    BITCOIND_USER_LINUX: 'bio',
    BITCOIND_PASS_LINUX: '3HTJFDMaDxiRc71jUkdyFcMFLwbB7rZHtY',
    // bitcoind for production
    BITCOIND_HOST_WINDOWS: 'localhost',
    BITCOIND_PORT_WINDOWS: 8332,
    BITCOIND_USER_WINDOWS: 'hmm4JzdD8cHT7e2u',
    BITCOIND_PASS_WINDOWS: 'T4ZKxSsE6hx3rw4RBjs4Uh6Cy5zQRp4X',

    ENC_KEY: 'enc_key_bio',
    SIGNING_SECRET: 'secret_bio',
    BANKROLL_OFFSET: 0,
    // RECAPTCHA_PRIV_KEY: '6LcesEwUAAAAALbBU_LT8tCj_RWJlh_ozgRzasMM',
    // RECAPTCHA_SITE_KEY: '6LcesEwUAAAAAPVX0x-_dirJQjDOP4Kiq6SRibG3',
    PORT_HTTP_W: 80,
    PORT_HTTPS_W: 443,
    PORT_HTTP_G: 3880,
    PORT_HTTPS_G: 3443,
    MINING_FEE: 10000,
    BUILD: prodConfig,
    HTTPS_KEY: './ssl/private.key',
    HTTPS_CERT: './ssl/certificate.crt',
    HTTPS_CA: './ssl/ca_bundle.crt',
    COMPANY_PASS: 'companypass', // company
    STAFF_PASS: 'staffpass', // staff
    MADAEX_PASS: 'madaexpass', // ex_to_mt_
    TOPUP_PASS: 'topuppass', // fun_to_mt_

    GAME_CLOSE: true,
    USE_BTC_ETH_DEPOSIT: true,
    USE_BTC_ETH_WITHDRAW: true,
    MANUAL_WITHDRAW: true
};
