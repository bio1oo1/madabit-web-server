
var assert = require('assert');
var async = require('async');
var database = require('./database');
var config = require('../config/config');
var lib = require('./lib');
var Jimp = require('jimp');
var sendEmail = require('./sendEmail');
var querystring = require('querystring');
var request = require('request');
var excel = require('excel4node');

/**
 * The req.user.admin is inserted in the user validation middleware
 */

exports.giveAway = function (req, res) {
    var user = req.user;
    assert(user.admin);

    res.render('giveaway', {
        user: user
    });
};

exports.giveAwayHandle = function (req, res, next) {
    var user = req.user;
    assert(user.admin);

    if (config.PRODUCTION === config.PRODUCTION_LINUX || config.PRODUCTION === config.PRODUCTION_WINDOWS) {
        var ref = req.get('Referer');
        if (!ref) return next(new Error('Possible free bit fee')); // Interesting enough to log it as an error

        var giveUrl;
        if (config.PRODUCTION === config.PRODUCTION_LOCAL) {
            var strIP = ip.address();
            giveUrl = 'http://' + strIP + '/admin-giveaway';
        }

        if (config.PRODUCTION === config.PRODUCTION_LINUX) giveUrl = 'https://' + config.SITE_URL_LINUX + '/admin-giveaway';
        if (config.PRODUCTION === config.PRODUCTION_WINDOWS) giveUrl = 'https://' + config.SITE_URL_WINDOWS + '/admin-giveaway';

        if (ref.lastIndexOf(giveUrl, 0) !== 0) { return next(new Error('Bad referrer got: ' + ref)); }
    }

    var giveAwayUsers = req.body.users.split(/\s+/);
    var bits = parseFloat(req.body.bits);

    if (!Number.isFinite(bits) || bits <= 0) { return next('Problem with bits...'); }

    var satoshis = Math.round(bits * 100);

    database.addRawGiveaway(giveAwayUsers, satoshis, function (err) {
        if (err) return res.redirect('/admin-giveaway');

        res.redirect('/admin-giveaway');
    });
};

/**
 * Render Company Stataistics(not used)
 * @author SilveStar
 */
exports.company = function (req, res, next) {
    var user = req.user;
    assert(user.admin);

    var strEngineHost = lib.getEngineHost();

    res.render('admin_company', {
        user: user,
        enginehost: strEngineHost
    });
};

/**
 * Get Company Profit for Statistics (not used)
 * @author Bio
 */
exports.getCompanyProfitForGraph = function (req, res) {
    var user = req.user;
    assert(user.admin);
    database.getCompanyProfitPerMonth(function (err, profitPerMonth) {
        database.getCompanyProfitPerWeek(function (err, profitPerWeek) {
            database.getCompanyProfitPerDay(function (err, profitPerDay) {
                var result = {};
                result['profitPerMonth'] = profitPerMonth;
                result['profitPerWeek'] = profitPerWeek;
                result['profitPerDay'] = profitPerDay;
                res.send(result);
            });
        });
    });
};

/**
 * Render Players' Statistics Page (not used)
 * @author Bio
 */
exports.customer = function (req, res, next) {
    var user = req.user;
    assert(user.admin);

    var strEngineHost = lib.getEngineHost();

    res.render('admin_customer', {
        user: user,
        enginehost: strEngineHost
    });
};

/**
 * Get Players' Statistics Page (not used)
 * @author Bio
 */
exports.getCustomerProfitForGraph = function (req, res, next) {
    var user = req.user;
    assert(user.admin);

    database.getCustomerProfitPerGame(function (err, profitPerGame) {
        database.getCustomerProfitPerDay(function (err, profitPerDay) {
            var result = {};
            result.profitPerGame = profitPerGame;
            result.profitPerDay = profitPerDay;
            res.send(result);
        });
    });
};

/**
 * Render Game Settin Page on Admin Side.
 * @author Bio
 */
exports.setting = function (req, res, next) {
    var user = req.user;
    assert(user.superadmin);

    database.getSettings(function (err, settings) {
        database.getIntervals(function (err, intervals) {
            database.getBetRanges(function (err, ranges) {
                database.getTutorials(function (err, tutorials) {
                    var strEngineHost = lib.getEngineHost();

                    res.render('admin_setting', {
                        user: user,
                        enginehost: strEngineHost,

                        intervals: intervals,
                        ranges: ranges,
                        tutorials: tutorials,
                        agentProfitPercents: settings.agentProfitPercents,
                        withdrawable_bet_amount: settings.withdrawable_bet_amount,
                        minimum_deposit_amount_for_withdrawal: settings.minimum_deposit_amount_for_withdrawal,
                        first_deposit_percent: settings.first_deposit_percent,
                        first_deposit_multiplier: settings.first_deposit_multiplier,
                        min_bet_amount: settings.min_bet_amount,
                        max_bet_amount: settings.max_bet_amount,
                        min_extra_bet_amount: settings.min_extra_bet_amount,
                        max_extra_bet_amount: settings.max_extra_bet_amount,
                        extrabet_multiplier: settings.extrabet_multiplier,
                        min_range_bet_amount: settings.min_range_bet_amount,
                        max_range_bet_amount: settings.max_range_bet_amount,
                        range_bet_multiplier: settings.range_bet_multiplier,
                        range_bet_from: settings.range_bet_from,
                        range_bet_to: settings.range_bet_to,
                        tipfee: settings.tipfee,
                        min_transfer_amount: settings.min_transfer_amount,
                        max_transfer_amount: settings.max_transfer_amount,
                        max_tipfee_amount: settings.max_tipfee_amount,
                        max_profit: settings.max_profit,
                        to_be_agent_deposit_multiplier: settings.to_be_agent_deposit_multiplier,
                        to_be_agent_client_count: settings.to_be_agent_client_count,
                        company_mail: settings.company_mail,
                        company_password: settings.company_password,
                        bet_mode: settings.bet_mode,
                        bet_mode_mobile: settings.bet_mode_mobile,
                        show_hash: settings.show_hash,
                        no_commission_from: settings.no_commission_from,
                        no_commission_to: settings.no_commission_to,
                        welcome_free_bit: settings.welcome_free_bit,
                        welcome_bits_multiplier: settings.welcome_bits_multiplier,
                        collect_free_days: settings.collect_free_days,
                        eth_address: settings.eth_address,
                        eth_password: settings.eth_password,
                        add_gaming_pool: settings.add_gaming_pool,
                        contactus_email: settings.contactus_email
                    });
                });
            });
        });
    });
};

/**
 * Render Exchange Rate(Admin only)
 * @author Bio
 */
exports.exchangeRate = function (req, res, next) {
    var user = req.user;

    assert(user.admin);
    database.getExchangeRate(function (err, result) {
        var exchangeRates = {};
        for (var i = 0; i < result.length; i++) { exchangeRates[result[i]['strkey']] = result[i]['strvalue']; }
        res.render('admin_rate', {
            user: user,
            exchangeRates: exchangeRates
        });
    });
};

/**
 * Save Exchange Rate(Admin only)
 * @author Bio
 */
exports.saveExchangeRate = function (req, res, next) {
    var user = req.user;
    assert(user.admin);

    var rate_USD_bit = req.body.USD_bit;
    var rate_BTC_USD = req.body.BTC_USD;
    var rate_ETH_USD = req.body.ETH_USD;

    database.saveExchangeRate(rate_USD_bit, rate_BTC_USD, rate_ETH_USD, function (err, result) {
        if (err) { return res.send(false); }
        return res.send(result);
    });
};

/**
 * Get Exchange Rate(Admin only)
 * @author Bio
 */
exports.getExchangeRate = function (req, res) {
    database.getExchangeRate(function (err, result) {
        var exchangeRates = {};
        for (var i = 0; i < result.length; i++) { exchangeRates[result[i]['strkey']] = result[i]['strvalue']; }
        res.send(exchangeRates);
    });
};

/**
 * Save Agent Profit Percent(Admin only)
 * @author Bio
 */
exports.saveAgentProfitPercent = function (req, res, next) {
    var user = req.user;
    assert(user.admin);

    var agent_percent_parent1 = req.body.agent_percent_parent1;
    var agent_percent_parent2 = req.body.agent_percent_parent2;
    var agent_percent_parent3 = req.body.agent_percent_parent3;
    var agent_percent_masterib = req.body.agent_percent_masterib;
    var agent_percent_agent = req.body.agent_percent_agent;
    var agent_percent_company = req.body.agent_percent_company;
    var agent_percent_staff = req.body.agent_percent_staff;

    database.saveAgentProfitPercent(agent_percent_parent1, agent_percent_parent2, agent_percent_parent3, agent_percent_masterib,
        agent_percent_agent, agent_percent_company, agent_percent_staff,
        function (err, result) {
            res.send(result);
        });
};

/**
 * Get Agent Profit Percent(Admin only)
 * @author Bio
 */
exports.getAgentProfitPercent = function (req, res) {
    database.getAgentProfitPercent(function (err, result) {
    // var agentProfitPercent = {};
        var agentProfitPercent = result;
        // for(var i = 0; i < result.length; i++)
        //     agentProfitPercent[result[i]['strkey']] = result[i]['strvalue'];
        res.send(agentProfitPercent);
    });
};

/**
 * Render Game Page in Admin Panel(Admin only)
 * @author Bio
 * @since 2018.5.2
 */
exports.game = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.game_id = lib.removeNullsAndTrim(req.body.game_id);
    param.page = req.body.page;
    param.count_per_page = 200;
    if (param.page == undefined || param.page == '') { param.page = 1; }

    database.getGameListForAdminUserPage(param, function (err, result) {
        if (err) return callback(err);
        res.render('admin_game', {
            game_id: param.game_id,
            user: user,
            games: result.data,
            page: result.page,
            total: result.total
        });
    });
};

/**
 * Render User Page in Admin Panel(Admin only)
 * @author Bio
 */
exports.user = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.username = lib.removeNullsAndTrim(req.body.username);
    param.time_zone = user.time_zone;
    param.page = req.body.page;
    param.count_per_page = 200;
    if (param.page == undefined || param.page == '') { param.page = 1; }

    database.getUserListForAdminUserPage(param, function (err, result) {
        res.render('admin_user', {
            username: param.username,
            user: user,
            users: result.users,
            page: result.page,
            total: result.total
        });
    });
};

/**
 * Render Manual Withdraw Page in Admin Panel(Pagination)
 * @author Bio
 * @since 2018.5.31
 * @param status 0(in progress) / 1(completed)
 * @param time_zone
 * @param page
 * @param count_per_page
 * @return [{id, user_id, amount, fee, withdrawal_txid, withdrawal_address, created, baseunit, currency, username}]
 */
exports.manualWithdraw = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.status = lib.removeNullsAndTrim(req.body.status);
    if (param.status == undefined) { param.status = 0; }
    param.time_zone = user.time_zone;
    param.page = req.body.page;
    param.count_per_page = 50;
    if (param.page == undefined || param.page == '') { param.page = 1; }

    database.getWithdrawListForAdminManual(param, function (err, result) {
        if (err) { return callback(err); }

        return res.render('admin_withdraw', {
            status: param.status,
            user: user,
            fundings: result.fundings,
            page: result.page,
            total: result.total
        });
    });
};

/**
 * Save TransactionID of BTC(ETH) withdraw using funding_id in Admin Panel
 * @author Bio
 * @since 2018.5.31
 * @param funding_id
 * @param transaction_id
 * @return true/false
 */
exports.saveTransactionID = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.funding_id = lib.removeNullsAndTrim(req.body.funding_id);
    param.transaction_id = lib.removeNullsAndTrim(req.body.transaction_id);

    database.saveTransactionID(param, function (err, result) {
        if (err) {
            return res.send(false);
        }
        return res.send(result);
    });
};

/**
 * Get New Inserted BTC(ETH) withdraw using last_funding_id in Admin Panel
 * @author Bio
 * @since 2018.5.31
 * @param last_funding_id
 * @return [{id, user_id, amount, fee, withdrawal_txid, withdrawal_address, created, baseunit, currency, username}]
 */
exports.getNewWithdraws = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.last_funding_id = lib.removeNullsAndTrim(req.body.last_funding_id);
    param.time_zone = user.time_zone;

    database.getNewWithdraws(param, function (err, result) {
        if (err) {
            result = [];
            return res.send(result);
        }
        return res.send(result);
    });
};

exports.agentTree = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.sort_field = req.query.sort_field;
    param.sort_direction = req.query.sort_direction;
    param.user_id = req.params.userId;
    param.date_from = lib.removeNullsAndTrim(req.query.date_from); ;
    param.date_to = lib.removeNullsAndTrim(req.query.date_to); ;
    param.time_zone_name = req.query.time_zone_name;
    param.is_admin = true;

    database.getAgentUserList(function (err, agent_user_list) {
        if (err) return callback(err);

        if (param.user_id == undefined || param.user_id == 'undefined' || param.user_id == 'no_user') {
            var d = new Date();
            var month = '' + (d.getMonth() + 1);
            var day = '' + d.getDate();
            var year = d.getFullYear();

            if (month.length < 2) month = '0' + month;
            if (day.length < 2) day = '0' + day;

            var today_str = [year, month, day].join('-');

            return res.render('admin_agent', {
                user: user,
                user_id: param.user_id,
                agent_users: agent_user_list,
                sort_field: param.sort_field,
                sort_direction: param.sort_direction,
                date_from: today_str,
                date_to: today_str
            });
        } else {
            database.getAgentProfitStatistics(param, function (err, statistics) {
                if (statistics == null) { statistics = ''; }

                param.user = user;
                param.agent_users = agent_user_list;
                param.statistics = statistics;

                res.render('admin_agent', {
                    user: user,
                    user_id: param.user_id,
                    agent_users: agent_user_list,
                    statistics: statistics,
                    sort_field: param.sort_field,
                    sort_direction: param.sort_direction,
                    date_from: param.date_from,
                    date_to: param.date_to
                });
            });
        }
    }, param);
};

/**
 * Render User Statistics Page in Admin Panel(Admin only)
 * @author Bio
 */
exports.userDetail = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var sort_field = req.query.sort_field;
    var sort_direction = req.query.sort_direction;

    var param = {};
    param.username = lib.removeNullsAndTrim(req.query.username);
    param.sort_field = req.query.sort_field;
    param.sort_direction = req.query.sort_direction;
    param.show_all = req.query.show_all;
    param.page = req.query.page;
    param.count_per_page = 200;
    if (param.page == undefined || param.page == '') { param.page = 1; }
    if (param.show_all == undefined || param.show_all == '') { param.show_all = 'false'; }

    database.getUserDetailForAdminUserPage(param, function (err, results) {
        res.render('admin_user_detail', {
            username: param.username,
            user: user,
            users: results.users,
            sort_field: param.sort_field,
            sort_direction: param.sort_direction,
            page: results.page,
            show_all: param.show_all,
            total: results.total
        });
    });
};
/**
 * Export Excel of Statistics in Admin Panel
 * @author Bio
 * @since 2018.4.23
 */
exports.userDetailToExcel = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var sort_field = req.body.sort_field;
    var sort_direction = req.body.sort_direction;

    var param = {};
    param.username = lib.removeNullsAndTrim(req.body.username);
    param.sort_field = req.body.sort_field;
    param.sort_direction = req.body.sort_direction;
    param.page = req.body.page;
    param.show_all = req.body.show_all;
    param.count_per_page = 200;
    if (param.page == undefined || param.page == '') { param.page = 1; }
    if (param.show_all == undefined || param.show_all == '') { param.page = 1; }

    database.getUserDetailForAdminUserPage(param, function (err, results) {
        var users = results.users;
        var workbook = new excel.Workbook();

        var worksheet = workbook.addWorksheet('Sheet 1');

        var style = workbook.createStyle({
            font: {
                color: '#000000',
                size: 14,
                bold: true
            },
            numberFormat: '$#,##0.00; ($#,##0.00); -'
        });

        if (users == undefined) { res.send({state: 'failed'}); }

        worksheet.cell(1, 1).string(res.req.i18n_texts.global_no).style(style);
        worksheet.cell(1, 2).string(res.req.i18n_texts.global_username).style(style);
        worksheet.cell(1, 3).string(res.req.i18n_texts.admin_userdetail_grossprofit).style(style);
        worksheet.cell(1, 4).string(res.req.i18n_texts.admin_userdetail_netprofit).style(style);
        worksheet.cell(1, 5).string(res.req.i18n_texts.admin_userdetail_totalvolumes).style(style);
        worksheet.cell(1, 6).string(res.req.i18n_texts.admin_userdetail_loginplaybonus).style(style);
        worksheet.cell(1, 7).string(res.req.i18n_texts.admin_userdetail_fundingbonus).style(style);
        worksheet.cell(1, 8).string(res.req.i18n_texts.admin_userdetail_welcomebonus).style(style);
        worksheet.cell(1, 9).string(res.req.i18n_texts.admin_userdetail_deposit).style(style);
        worksheet.cell(1, 10).string(res.req.i18n_texts.admin_userdetail_withdraw).style(style);
        worksheet.cell(1, 11).string(res.req.i18n_texts.admin_userdetail_balance).style(style);
        worksheet.cell(1, 12).string(res.req.i18n_texts.admin_userdetail_agentprofit).style(style);
        worksheet.cell(1, 13).string(res.req.i18n_texts.admin_userdetail_transfer).style(style);

        var row = 2;
        for (var i = 0; i < users.length; i++) {
            var info = users[i];
            worksheet.cell(row, 1).number(i + 1);
            worksheet.cell(row, 2).string(info.username);
            worksheet.cell(row, 3).number(parseInt(info.gross_profit));
            worksheet.cell(row, 4).number(parseInt(info.net_profit));
            worksheet.cell(row, 5).number(parseInt(info.sum_bet));
            worksheet.cell(row, 6).number(parseInt(info.login_play_bonus));
            worksheet.cell(row, 7).number(parseInt(info.funding_bonus));
            worksheet.cell(row, 8).number(parseInt(info.welcome_bonus));
            worksheet.cell(row, 9).number(parseInt(info.sum_deposit));
            worksheet.cell(row, 10).number(parseInt(info.sum_withdraw));
            worksheet.cell(row, 11).number(parseInt(info.balance_satoshis));
            worksheet.cell(row, 12).number(parseInt(info.agent_profit));
            worksheet.cell(row, 13).number(parseInt(info.transfer));
            row++;
        }
        // worksheet.cell(1,1).number(100).style(style);
        // worksheet.cell(1,2).number(200).style(style);
        // worksheet.cell(1,3).formula('A1 + B1').style(style);
        // worksheet.cell(2,1).string('string').style(style);
        // worksheet.cell(3,1).bool(true).style(style).style({font: {size: 14}});

        var strExcelFile = 'report.xlsx';
        workbook.write(strExcelFile, function(err, stats) {
            if (err) {
                console.error(err);
            } else {
                console.log(stats); // Prints out an instance of a node.js fs.Stats object
                setTimeout(function () {
                    res.send({state: 'success'});
                }, 1000);
            }
        });

    // res.render('admin_user_detail', {
    //     username:username,
    //     user:user,
    //     users:users
    // });
    });
};

/**
 * Export Excel of Games in Admin Panel
 * @author Bio
 * @since 2018.8.9
 */
exports.gameToExcel = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var param = {};
    param.page = req.body.page;
    param.count_per_page = 200;

    database.getGamesByPage(param, function (err, result) {
        var workbook = new excel.Workbook();
        var worksheet = workbook.addWorksheet('Sheet 1');

        var style = workbook.createStyle({
            font: {
                color: '#000000',
                size: 14,
                bold: true
            },
            numberFormat: '$#,##0.00; ($#,##0.00); -'
        });

        if (result == undefined) { res.send({state: 'failed'}); }

        worksheet.cell(1, 1).string(res.req.i18n_texts.global_no).style(style);
        worksheet.cell(1, 2).string(res.req.i18n_texts.admin_game_table_header_id).style(style);
        worksheet.cell(1, 3).string(res.req.i18n_texts.admin_game_table_header_crashat).style(style);
        worksheet.cell(1, 4).string(res.req.i18n_texts.admin_game_table_header_created).style(style);
        worksheet.cell(1, 5).string(res.req.i18n_texts.admin_game_table_header_hash).style(style);

        var row = 2;
        for (var i = 0; i < result.length; i++) {
            var info = result[i];
            worksheet.cell(row, 1).number(i + 1);
            worksheet.cell(row, 2).string(info.id.toString());
            worksheet.cell(row, 3).string(info.game_crash.toString());
            worksheet.cell(row, 4).string(info.created.toString());
            worksheet.cell(row, 5).string(info.hash.toString());
            row++;
        }
        // worksheet.cell(1,1).number(100).style(style);
        // worksheet.cell(1,2).number(200).style(style);
        // worksheet.cell(1,3).formula('A1 + B1').style(style);
        // worksheet.cell(2,1).string('string').style(style);
        // worksheet.cell(3,1).bool(true).style(style).style({font: {size: 14}});

        var strExcelFile = 'report.xlsx';
        workbook.write(strExcelFile, function(err, stats) {
            if (err) {
                console.error(err);
            } else {
                console.log(stats); // Prints out an instance of a node.js fs.Stats object
                setTimeout(function () {
                    res.send({state: 'success'});
                }, 1000);
            }
        });
    });
};

exports.demo = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var strEngineHost = lib.getEngineHost();

    database.getDemoAccountList(function (demo_list) {
        res.render('admin_demo', {
            user: user,
            enginehost: strEngineHost,
            demo_list: demo_list
        });
    });
};

exports.ibRanking = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var strEngineHost = lib.getEngineHost();

    database.getIBRanking(function (err, result) {
        res.render('admin_ib_ranking', {
            user: user,
            enginehost: strEngineHost,
            rankings: result
        });
    });
};

/**
 * Get Capture Pay List
 * @author Bio
 * @param param['time_zone']
 * @return [{id, user_id, amount, fee, withdrawal_txid, withdrawal_address,
 *          created, description, deposit_txid, withdrawal_id baseunit,
 *          currency created_timezone, username}]
 * Modified By Bio 2018.6.1
 */
exports.capturePay = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var strEngineHost = lib.getEngineHost();
    var param = {};
    param.time_zone = user.time_zone;

    database.getCapturePayList(param, function (err, result) {
        res.render('admin_capture_pay', {
            user: user,
            enginehost: strEngineHost,
            cp_users: result.cp_users,
            cp_types: result.cp_types,
            cp_history: result.cp_history
        });
    });
};

exports.saveIBRanking = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var ibRanking = req.body.ib_ranking;

    database.saveIBRanking(ibRanking, function (err, result) {
        res.send(result);
    });
};

exports.depositCapturePay = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var cpPayInfo = req.body.cpPayInfo;

    database.depositCapturePay(cpPayInfo, function (err, result) {
        if (err) {
            console.log('depositCapturePay failed :', err);
            res.send('failed');
        }
        res.send(result);
    });
};

/**
 * Unlock Password in Admin Capture Pay Page
 * @author Bio
 * @since 2018.5.30
 * @param current_password
 * @return true/false
 */
exports.capturePayUnlockPassword = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};

    param.current_password = lib.removeNullsAndTrim(req.body.current_password);
    if (param.current_password == undefined || param.current_password == null || param.current_password == 'undefined') { param.current_password = ''; }

    database.capturePayUnlockPassword(param, function (err, result) {
        if (err) {
            console.log('Unlock CapturePay failed :', err);
        }
        res.send(result);
    });
};

/**
 * Update Password in Admin Capture Pay Page
 * @author Bio
 * @since 2018.5.30
 * @param new_password
 * @return true/false
 */
exports.capturePayUpdatePassword = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};

    param.new_password = lib.removeNullsAndTrim(req.body.new_password);
    if (param.new_password == undefined || param.new_password == null || param.new_password == 'undefined') { param.new_password = ''; }

    database.capturePayUpdatePassword(param, function (err, result) {
        if (err) {
            console.log('Update CapturePay Password failed :', err);
        }
        res.send(result);
    });
};

exports.loginBonus = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var strEngineHost = lib.getEngineHost();

    database.getLoginBonusBet(function (err, login_bonus_bet) {
        database.getLoginBonusList(function (err, login_bonus_list) {
            res.render('admin_login_bonus', {
                user: user,
                enginehost: strEngineHost,
                login_bonus_bet: login_bonus_bet,
                login_bonus_list: login_bonus_list
            });
        });
    });
};

/**
 * read all the messages from supports table and render the page
 */
exports.support = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var type = lib.removeNullsAndTrim(req.params.type);

    if (!(type === 'all' || type === 'replied' || type === 'waiting' || type === 'unread')) { type = 'all'; }

    var total_msg = 0;
    var unread_msg = 0;
    var replied_msg = 0;
    var waiting_msg = 0;
    var result = [];

    database.getSupportList('all', user.time_zone, function (err, supports) {
        total_msg = supports.length;

        for (var i = 0; i < total_msg; i++) {
            if (supports[i]['message_to_admin'] === null) supports[i]['message_to_admin'] = '';

            if (supports[i]['message_to_user'] === null) supports[i]['message_to_user'] = '';

            supports[i]['message_to_admin'] = supports[i]['message_to_admin'].replace(/(?:\\[rn]|[\r\n]+)+/g, 'ELM');
            supports[i]['message_to_user'] = supports[i]['message_to_user'].replace(/(?:\\[rn]|[\r\n]+)+/g, 'ELM');

            if (type === 'all') {
                result[i] = supports[i];
            }
            if (!supports[i].read) {
                if (type === 'unread') result[unread_msg] = supports[i];
                unread_msg++;
            } else if (supports[i].message_to_user) {
                if (type === 'replied') result[replied_msg] = supports[i];
                replied_msg++;
            } else if (!supports[i].message_to_user) {
                if (type === 'waiting') result[waiting_msg] = supports[i];
                waiting_msg++;
            }
        }

        res.render('admin_support', {
            user: user,
            type: type,
            total_msg: total_msg,
            replied_msg: replied_msg,
            unread_msg: unread_msg,
            waiting_msg: waiting_msg,
            supports: result
        });
    });
};

/**
 * set the read flag of support message
 */
exports.setSupportReadFlag = function (req, res) {
    var supportId = req.body.supportId;
    var flag = req.body.flag;
    database.setSupportReadFlag(supportId, flag, function (err, result) {
        res.send(result);
    });
};

/**
 * read all the messages from database and shows them
 */
exports.showSupportMessage = function (req, res) {
    var user_id = req.body.user_selected;
    var user = req.user;
    database.getSupportList('all', user.time_zone, function (err, supports) {
        database.getSupportFromUserId(user_id, function (error, result) {
            if (error) console.error(error);
            res.render('admin_support', {
                user: user,
                shows: result.rows,
                supports: supports
            });
        });
    });
};

/**
 * send a reply message to user and return the alert message
 *      if user has a mail, send mail to users
 *      otherwise, send notification
 */
exports.replySupport = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var supportId = req.body.supportId;
    var email = req.body.email;
    var msg2User = req.body.msg2User;

    if (email && email !== '---') { // there is registered email
    // send mail
        sendEmail.contact(email, msg2User, function (err, result) {
            if (err) {
                return res.send({error: 'Error occurred during email contact to staff', data: err, result: result});
            }
            // update database supports table
            database.replySupport(supportId, msg2User, function (error, result) {
                if (error) {
                    return res.send({error: 'Error occurred in database update.', data: error, result: result});
                }
                return res.send({result: result});
            });
        });
    } else { // there is no email
        database.replySupport(supportId, msg2User, function (error, result) {
            if (error) {
                return res.send({error: 'Error occurred in database update', data: error, result: result});
            }
            return res.send({result: result});
        });
    }
};

exports.contactUs = function (req, res) {
    var name = req.body.name;
    var email = req.body.email;
    var message = req.body.message;

    console.log('info', 'admin.js - name: ' + name + '   email:' + email + '   message:' + message);
    lib.log('info', 'admin.js - name: ' + name + '   email:' + email + '   message:' + message);

    var emailNotValid = lib.isInvalidEmail(email);
    var nameNotValid = lib.isInvalidUsername(name);

    if (emailNotValid || nameNotValid) {
        return res.render('contactus', {
            err: 'Parameter Invalid',
            success: false
        });
    }

    assert(name && email && message);
    sendEmail.contactus(email, name, message, function (err, result) {
        return res.render('contactus', {
            err: err,
            success: result
        });
    });
};

/**
 * Upload Image for Advertisement(Admin only)
 * @author Bio
 */
exports.uploadAdvertisement = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var adsId = req.body.ads_id;
    var upload_path = __dirname + '/../upload/' + req.files.advertisement.name;
    var result_path = __dirname + '/../theme/img/ads_' + adsId + '.png';
    if (config.PRODUCTION === config.PRODUCTION_LINUX || config.PRODUCTION === config.PRODUCTION_WINDOWS) {
        result_path = __dirname + '/../build/img/ads_' + adsId + '.png';
    }

    let sampleFile = req.files.advertisement;

    sampleFile.mv(upload_path, function (err) {
        if (err) return res.status(500).send(err);
        Jimp.read(upload_path).then(function (results) {
            results.quality(60)
                .write(result_path);
            res.redirect('/setting');
        }).catch(function (err) {
            console.error(err);
            res.redirect('/setting');
        });
    });
};

// Set the Tip Fee
exports.setTipFee = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var tipFee = req.body.tipFee;
    database.setTipFee(tipFee, function (err, result) {
        if (err) { throw err; }
        res.send(result);
    });
};

/**
 * Save Intervals to Set Game Crash Point manually(Admin only)
 * @author Bio
 */
exports.saveIntervals = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var intervals = req.body.intervals;
    database.saveIntervals(intervals, function (err, result) {
        res.send(result);
    });
};

/**
 * Save Bet Ranges
 * @author Bio
 * @since 2018.6.5
 */
exports.saveBetRanges = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var betRanges = req.body.betRanges;
    database.saveBetRanges(betRanges, function (err, result) {
        res.send(result);
    });
};

/**
 * Set Control Status of Crash Point Range
 * @author Bio
 */
exports.setIntervalStatus = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var status = req.body.status;
    database.setIntervalStatus(status, function (err, result) {
        res.send(result);
    });
};

exports.saveDemoAccount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var demo_account_info = req.body.demo_account_info;

    database.saveDemoAccount(demo_account_info, function (result) {
        res.send(result);
    });
};

exports.deleteDemoAccount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var strName = req.body.name;

    database.deleteDemoAccount(strName, function (result) {
        res.send(result);
    });
};

/**
 *  Set the Title and URL of Tutorial(Admin only)
 *  URL is a youTube video link for iframe
 *  @author Bio
 */
exports.saveTutorials = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var tutorials = req.body.tutorials;
    database.saveTutorials(tutorials, function (err, result) {
        res.send(result);
    });
};

/**
 * Set Usercalss of users in User Page in Admin Panel(Admin on
 * @author Bio
 */
exports.setUserClass = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var userId = req.body.userId;
    var userClass = req.body.userClass;

    if (userClass == 'admin' || userClass == 'superadmin') {
        database.setUserClassToAdmin(userId, userClass, function (err, result) {
            if (err) callback(err);
            res.send(result);
        });
    } else {
        database.setUserClass(userId, userClass, function (err, result) {
            if (err) callback(err);
            res.send(result);
        });
    }
};

/**
 * Delete a user(only userclass = user)
 * Only userclass = user and set is_deleted = true in users table
 * @author Bio
 * @since  2018.3.30
 * ** delete all data that is relat
 */
exports.deleteUser = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var userId = req.body.userId;
    var username = req.body.username;

    database.getUserFromUsername(username, function (err, info) {
        if (info.userclass == 'user') {
            database.deleteUser(userId, function (err, result) {
                res.send(result);
            });
        } else {
            res.send(false);
        }
    });
};

exports.sendMessageToMultiUsers = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var userIds = req.body.userIds;
    var message = req.body.message;

    database.sendMessageToMultiUsers(userIds, message, function (err, result) {
        res.send(result);
    });
};

exports.sendSMSToMultiUsers = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var phoneNumbers = req.body.phoneNumbers;
    var message = req.body.message;

    if (phoneNumbers === undefined) {
        console.log('sendSMSToMultiUsers - error - PHONE_NUMBER_UNDEFINED');
        return res.send('PHONE_NUMBER_UNDEFINED');
    }

    var tasks = [];
    phoneNumbers.forEach(function (phoneNumber, index) {
        tasks.push(function (callback) {
            sendSMS(phoneNumber, message, callback);
        });
    });

    async.series(tasks, function (err, result) {
        if (err) { return res.send(err); }
        return res.send(true);
    });
};

/**
 * convert utf8 to utf16be
 * @author : Bio
 * @since : 20180719
 */
function utf8to16 (str) {
    var out, i, len, c;
    out = '';
    len = str.length;
    i = 0;
    while (i < len) {
        c = str.charCodeAt(i++);
        var hexString = c.toString(16);
        if (hexString.length == 2) hexString = '00' + hexString;
        // console.log(hexString);
        out += hexString;
    }

    return out;
}

/**
 * Send SMS in User Page(Admin only);
 * @param strPhoneNumber
 * @param strMessage
 * @param strCodec (en/zh)
 * @param callback
 *
 * if(strCodec is zh --> you have to convert utf8 to utf16be)
 */
function sendSMS (strPhoneNumber, strMessage, callback) {
    var codec = '8';
    var strMsg = utf8to16(strMessage);

    var form = {
        Src: 'A13269127729',
        Pwd: 'abc123456',
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
            console.log('err-code', body);
            return callback(err);
        }

        console.log('SMS : ', strPhoneNumber, body);
        return callback(null);
    });
}

/**
 * get all the information about staff and render the result
 */
exports.staffAdmin = function (req, res) {
    var staffname;
    var user = req.user;
    assert(user.admin);
    var emp_id = lib.removeNullsAndTrim(req.params.staff_id);
    /* emp_id is a string or undefined */
    if (emp_id == 'favicon.ico') {
    /* console.log('in favicon section'); *//* console.log('in favicon section'); */
        res.status(204).end();
    } else {
        database.getStaffInfo(emp_id, function (err, result) {
            if (err) {
                throw new Error('Something bad happened.');
            }
            for (var i = 0; i < result.staff.length; i++) {
                if (result.staff[i].emp_id == emp_id) {
                    staffname = result.staff[i].emp_name;
                    break;
                }
            }
            res.render('admin_staff', {
                user: user,
                staff: result.staff,
                userlist: result.userlist,
                staffname: staffname,
                total_bet: result.total_bet,
                total_extra_bet: result.total_extra_bet,
                total_profit_for_company: result.total_profit_for_company
            });
        });
    }
};

/**
 * add a new staff to the database
 */
exports.addNewStaff = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var name = req.body.name;
    var mail = req.body.mail;
    // var pass = req.body.pass;
    database.addNewStaff(name, mail, /* pass, */function (err, result) {
        if (err) return res.send(err);
        return res.send('success');
    });
};

/**
 * update staff information from database
 */
exports.updateStaff = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var id = req.body.emp_id;
    var newname = req.body.name;
    var newmail = req.body.mail;
    database.updateStaff(id, newname, newmail, function (err, result) {
        if (err) return res.send(err);
        return res.send('success');
    });
};

/**
 * delete a staff from staff table in database
 */
exports.deleteStaff = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var emp_name = req.body.emp_name;
    database.deleteStaff(emp_name, function (err, result) {
        if (err) return res.send(err);
        return res.send('success');
    });
};

// exports.makeReport = function(req, res){
//     var body = req.body;
//     var total_volume = body.total_bet + body.total_extra_bet,
//         total_for_company = body.total_for_company,
//         net_profit = body.net_profit,
//         games_played = body.games_played,
//         users_count = body.total_user_count,
//         staffname = staffname,
//         userlist = userlist;
// };

/**
 * get the user list according to the staff
 */
exports.getUsersFromStaff = function (req, res) {
    var id = req.body.emp_id;
    var user = req.user;
    assert(user.admin);
    database.getUserFromStaff(id, function (error, result) {
        if (error) {
            res.send({error: error});
        } else {
            res.send(result);
        }
    });
};

/**
 * search user by keyword (can be username, phone number, email)
 */
exports.getUsersFromSearch = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var keyword = req.body.keyword;
    database.getUsersFromSearch(keyword, function (error, result) {
        if (error) {
            res.send({ error: error });
        } else {
            res.send({ result: result });
        }
    });
};

/**
 * add users to a staff
 */
exports.saveStaffInformation = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var user_id = req.body.user_id;
    var emp_id = req.body.emp_id;
    database.saveStaffInformation(user_id, emp_id, function (error, result) {
        if (error) {
            res.send({ error: error });
        } else {
            res.send(result);
        }
    });
};

exports.setWelcomeFreeBits = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var welcome_free_bit = req.body.welcome_free_bit;
    database.setWelcomeFreeBits(welcome_free_bit, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setWithdrawableBetAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var withdrawable_bet_amount = req.body.withdrawable_bet_amount;
    database.setWithdrawableBetAmount(withdrawable_bet_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setBetMode = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var bet_mode = req.body.bet_mode;
    database.setBetMode(bet_mode, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

/**
 * Set Mobile Bet Mode (Custom-Bet show or hide)
 * @author Bio
 * @since 2018.3.25
 */
exports.setMobileBetMode = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var bet_mode_mobile = req.body.bet_mode_mobile;
    database.setMobileBetMode(bet_mode_mobile, function (err, result) {
        if (err) { throw err; }
        res.send(result);
    });
};

/**
 * Set Hash Visiblity (show_hash/hide_hash)
 * @author Bio
 * @since 2018.3.26
 */
exports.setShowHash = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var show_hash = req.body.show_hash;
    database.setShowHash(show_hash, function (err, result) {
        if (err) { throw err; }
        res.send(result);
    });
};

exports.setFirstDepositPercent = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var first_deposit_percent = req.body.first_deposit_percent;
    database.setFirstDepositPercent(first_deposit_percent, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setToBeAgentDepositMultiplier = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var to_be_agent_deposit_multiplier = req.body.to_be_agent_deposit_multiplier;
    database.setToBeAgentDepositMultiplier(to_be_agent_deposit_multiplier, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setToBeAgentClientCount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var to_be_agent_client_count = req.body.to_be_agent_client_count;
    database.setToBeAgentClientCount(to_be_agent_client_count, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setFirstDepositMultiplier = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var first_deposit_multiplier = req.body.first_deposit_multiplier;
    database.setFirstDepositMultiplier(first_deposit_multiplier, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMinBetAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var min_bet_amount = req.body.min_bet_amount;
    database.setMinBetAmount(min_bet_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMaxBetAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var max_bet_amount = req.body.max_bet_amount;
    database.setMaxBetAmount(max_bet_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMinExtraBetAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var min_extra_bet_amount = req.body.min_extra_bet_amount;
    database.setMinExtraBetAmount(min_extra_bet_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMaxExtraBetAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var max_extra_bet_amount = req.body.max_extra_bet_amount;
    database.setMaxExtraBetAmount(max_extra_bet_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setWelcomeBitsMultiplier = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var welcome_bits_multiplier = req.body.welcome_bits_multiplier;
    database.setWelcomeBitsMultiplier(welcome_bits_multiplier, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setCollectFreeDays = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var collect_free_days = req.body.collect_free_days;
    database.setCollectFreeDays(collect_free_days, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMinTransferAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var min_transfer_amount = req.body.min_transfer_amount;
    database.setMinTransferAmount(min_transfer_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMaxTransferAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var max_transfer_amount = req.body.max_transfer_amount;
    database.setMaxTransferAmount(max_transfer_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMaxTipFeeAmount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var max_tipfee_amount = req.body.max_tipfee_amount;
    database.setMaxTipFeeAmount(max_tipfee_amount, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setMaxProfit = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var max_profit = req.body.max_profit;
    database.setMaxProfit(max_profit, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setContactUsEmail = function (req, res) {
    var contactus_email = req.body.contactus_email;
    var name = req.body.name;
    var message = req.body.message;
    database.setContactUsEmail(contactus_email, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.depositFakePool = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var deposit_fakepool = req.body.deposit_fakepool;
    database.depositFakePool(deposit_fakepool, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.depositFakeAccount = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var demo_account_info = req.body.demo_account_info;

    database.depositFakeAccount(demo_account_info, function (result) {
        res.send(result);
    });
};

exports.setAddGamingPool = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var add_gaming_pool = req.body.add_gaming_pool;
    database.setAddGamingPool(add_gaming_pool, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setETHAddress = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var eth_address = req.body.eth_address;
    database.setETHAddress(eth_address, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setETHPassword = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var eth_password = req.body.eth_password;
    database.setETHPassword(eth_password, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.setLoginBonusBet = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var login_bonus_bet = req.body.login_bonus_bet;
    database.setLoginBonusBet(login_bonus_bet, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.saveLoginBonus = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var login_bonus_data = req.body.login_bonus_data;
    database.saveLoginBonus(login_bonus_data, function (err, result) {
        if (err) { throw err; }
        res.send('success');
    });
};

exports.setExtraBetMultiplier = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var extrabet_multiplier = req.body.extrabet_multiplier;
    database.setExtraBetMultiplier(extrabet_multiplier, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

exports.saveCommonSetting = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var param = {};
    param.strkey = req.body.strkey;
    param.strvalue = req.body.strvalue;
    database.saveCommonSetting(param, function (err, result) {
        if (err) { throw err; }

        res.send(result);
    });
};

/**
 * Get Statistics of Company
 * @author Bio
 * be careful about the timezone
 */
exports.getStatisticsForAdminPage = function (req, res) {
    var user = req.user;

    var date_from = lib.removeNullsAndTrim(req.body.date_from);
    var date_to = lib.removeNullsAndTrim(req.body.date_to);
    var time_zone_name = lib.removeNullsAndTrim(req.body.time_zone_name);

    if (date_from == undefined || date_from == '' || date_to == undefined || date_to == '') {
        var d = new Date(),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        var today_str = [year, month, day].join('-');

        return res.render('admin_statistics', {
            user: user,
            date_from: today_str,
            date_to: today_str
        });
    }

    // var client_time_str = server_time.toLocaleString('en-US', { timeZone: time_zone_name });
    database.getFirstLastGameInfo(time_zone_name, function (err, first_last_game_array) {
        var last = {};
        var first = {};
        if (first_last_game_array.length == 3) {
            last = first_last_game_array[0];
            first = first_last_game_array[2];
            if (last.ended == false) { last = first_last_game_array[1]; }
        } else if (first_last_game_array.length == 2) {
            last = first_last_game_array[0];
            first = first_last_game_array[1];
        } else {
            return res.render('admin_statistics', {
                user: user,
                date_from: today_str,
                date_to: today_str
            });
        }

        var first_time = first.created.toLocaleString();
        var first_date_str = first_time.split(' ')[0];
        first_date_str = first_date_str.split('-')[0] + '-' + ((first_date_str.split('-')[1] < 10) ? ('0' + first_date_str.split('-')[1]) : first_date_str.split('-')[1]) + '-' +
        ((first_date_str.split('-')[2] < 10) ? ('0' + first_date_str.split('-')[2]) : first_date_str.split('-')[2]);
        var last_time = last.created.toLocaleString();
        var last_date_str = last_time.split(' ')[0];
        last_date_str = last_date_str.split('-')[0] + '-' + ((last_date_str.split('-')[1] < 10) ? '0' + last_date_str.split('-')[1] : last_date_str.split('-')[1]) + '-' +
            ((last_date_str.split('-')[2] < 10) ? '0' + last_date_str.split('-')[2] : last_date_str.split('-')[2]);

        if (date_from <= first_date_str && last_date_str <= date_to) {
            database.getStatisticsForAdminPage2(last.id, function (err, statistics) {
                res.render('admin_statistics', {
                    user: user,
                    statistics: statistics,
                    date_from: date_from,
                    date_to: date_to
                });
            });
        } else {
            database.getStatisticsForAdminPage(date_from + ' 00:00', date_to + ' 24:00', time_zone_name, function (err, statistics) {
                res.render('admin_statistics', {
                    user: user,
                    statistics: statistics,
                    date_from: date_from,
                    date_to: date_to
                });
            });
        }
    });
};

exports.changeMail = function (req, res) {
    var newmail = req.body.mail;
    var password = req.body.password;

    database.changeMail(newmail, password, function (error, result) {
        if (error) {
            res.send({ result: result, error: error });
        } else {
            res.send({ result: result });
        }
    });
};

exports.setUserCanChatStatus = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var userId = req.body.userId;
    var status = req.body.status;

    database.setUserCanChatStatus(userId, status, function (error, result) {
        if (error) {
            res.send({ result: result, error: error });
        } else {
            res.send({ result: result });
        }
    });
};

/**
 * Save Phone Number in User Page of Admin Panel
 * @author Bio
 * @since 2018.4.2
 */
exports.savePhoneNumber = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var user_id = req.body.user_id;
    var phone_number = req.body.phone_number;
    phone_number = lib.clearPhoneNumber(phone_number);

    database.savePhoneNumber(user_id, phone_number, function (error, result) {
        console.log('savePhoneNumber', phone_number);

        if (error) {
            res.send({ result: result, error: error });
        } else {
            res.send(phone_number);
        }
    });
};

/**
 * Save Referral ID in User Page of Admin Panel
 * @author Bio
 * @since 2018.5.10
 */
exports.saveRefId = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var user_id = req.body.user_id;
    var ref_id = req.body.ref_id;

    console.log('save_ref_id - [begin]    user_id:' + user_id + '   ref_id:' + ref_id);
    lib.log('info', 'save_ref_id - [begin]    user_id:' + user_id + '   ref_id:' + ref_id);
    database.saveRefId(user_id, ref_id, function (error, result) {
        if (error) {
            console.log('save_ref_id -   user_id:' + user_id + '   ref_id:' + ref_id + '   error:' + error);
            lib.log('error', 'save_ref_id -   user_id:' + user_id + '   ref_id:' + ref_id + '   error:' + error);
            res.send({error: error});
        } else {
            console.log('save_ref_id - [end]    user_id:' + user_id + '   ref_id:' + ref_id);
            lib.log('info', 'save_ref_id - [end]    user_id:' + user_id + '   ref_id:' + ref_id);
            res.send(result);
        }
    });
};

/**
 * Save No Agent Commission Region in Setting Page of Admin Panel
 * @author Bio
 * @no agent commission region ??
 * if the agents cash out in "No Agent Commission Region",
 * they can't receive the agent profit of agent system
 */
exports.saveNoAgentCommissionRegion = function (req, res) {
    var user = req.user;
    assert(user.admin);

    var no_commission_from = req.body.point_from;
    var no_commission_to = req.body.point_to;

    database.saveNoAgentCommissionRegion(no_commission_from, no_commission_to, function (error, result) {
        if (error) {
            res.send(error);
        } else {
            res.send(result);
        }
    });
};

exports.gameHistory = function (req, res) {
    var user = req.user;
    assert(user.admin);
    var date_from = lib.removeNullsAndTrim(req.body.date_from);
    var date_to = lib.removeNullsAndTrim(req.body.date_to);
    var time_zone_name = lib.removeNullsAndTrim(req.body.time_zone_name);
    var userId = parseInt(req.params.userId);

    if (date_from == undefined || date_from == '' || date_to == undefined || date_to == '') {
        var d = new Date(),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        var today_str = [year, month, day].join('-');

        return res.render('admin_gamehistory', {
            user: user,
            date_from: today_str,
            date_to: today_str,
            userId: userId
        });
    }

    database.getUserGameHistory(userId, date_from + ' 00:00', date_to + ' 24:00', time_zone_name, function (err, histories) {
        if (err) callback(err);

        res.render('admin_gamehistory', {
            user: user,
            histories: histories,
            date_from: date_from,
            date_to: date_to,
            userId: userId
        });
    });
};
