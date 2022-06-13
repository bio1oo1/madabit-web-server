
var admin = require('./admin');
var assert = require('better-assert');
var lib = require('./lib');
var database = require('./database');
var user = require('./user');
var api = require('./api');
var games = require('./games');
var sendEmail = require('./sendEmail');
var stats = require('./stats');
var config = require('../config/config');
var fs = require('fs');
var mime = require('mime');
var ip = require('ip');
// var recaptchaValidator = require('recaptcha-validator');

function staticPageLogged (page, loggedGoTo) {
    return function (req, res) {
        var user = req.user;
        if (!user) {
            if (page === 'register') {
                // console.log('= Register With REF_ID : url - ' + req.url);
                var ref_id;
                ref_id = req.params.ref_id;
                req.i18n_lang = 'zh';
                if (ref_id) {
                    ref_id = lib.decIntroUrl(ref_id);
                    console.log('= Register With REF_ID : decode - ' + ref_id);
                    console.log('= Register With REF_ID : render - register with ref_id = ' + ref_id);
                    return res.render('register', {
                        ref_id: ref_id
                    });
                }
                // console.log('= Register With REF_ID : render - register without ref_id');
                return res.render('register');
            }

            return res.render(page);
        }

        if (loggedGoTo) return res.redirect(loggedGoTo);

        return res.render(page, { user: user });
    };
};

function contact (origin) {
    assert(typeof origin === 'string');

    return function (req, res, next) {
        var ret = '\tUser Information\n' + req.user + '\n\tEmail\n' + req.body.email + '\n\tMessage' + req.body.message;
        var user = req.user;
        var from = req.body.email;
        var message = req.body.message;

        if (!from) {
            return res.render(origin, {
                user: user,
                warning: 'email required'
            });
        }

        if (!message) {
            return res.render(origin, {
                user: user,
                warning: 'message required'
            });
        }

        if (user) message = 'user_id: ' + req.user.id + '\n' + message;

        sendEmail.contact(from, message, null, function (err) {
            if (err) { return next(new Error('Error sending email: \n' + err)); }

            return res.render(origin, {
                user: user,
                success: 'Thank you for writing, one of my humans will write you back very soon :) ',
                ret: ret
            });
        });
    };
}

function restrict (req, res, next) {
    if (!req.user) {
        res.status(401);
        if (req.header('Accept') === 'text/plain') { res.send('Not authorized'); } else { res.render('401'); }
    } else { next(); }
};

function restrictRedirectToHome (req, res, next) {
    if (!req.user) {
        res.redirect('/');
        return;
    }
    next();
};

function adminRestrict (req, res, next) {
    if (!req.user || !req.user.admin) {
        res.status(401);
        if (req.header('Accept') === 'text/plain') { res.send('Not authorized'); } else { res.render('401'); } // Not authorized page.
        return;
    }
    next();
}

function recaptchaRestrict (req, res, next) {
//    console.log('recaptchaRestrict');
    next();
    // var recaptcha = lib.removeNullsAndTrim(req.body['g-recaptcha-response']);
    // if (!recaptcha) {
    //   return res.send('No recaptcha submitted, go back and try again');
    // }
    //
    // recaptchaValidator.callback(config.RECAPTCHA_PRIV_KEY, recaptcha, req.ip, function(err) {
    //   if (err) {
    //     if (typeof err === 'string')
    //       res.send('Got recaptcha error: ' + err + ' please go back and try again');
    //     else {
    //       console.error('[INTERNAL_ERROR] Recaptcha failure: ', err);
    //       res.render('error');
    //     }
    //     return;
    //   }
    //
    //   next();
    // });
}

function table () {
    var strEngineHost = lib.getEngineHost();

    return function (req, res) {
        var user = req.user;

        var type = req.query.t;

        if (!user) {
            return res.render('table', {
                enginehost: strEngineHost,
                buildConfig: config.BUILD,
                type: type
            });
        }

        database.getReplyCheck(user.id, function (error, reply) {
            if (error) {
                console.log('Error: ', error);
                return res.render('error');
            }

            user['reply'] = reply;
            return res.render('table', {
                user: user,
                enginehost: strEngineHost,
                buildConfig: config.BUILD,
                type: type
            });
        });
    };
}

module.exports = function (app) {
    app.get('/', user.index);
    app.get('/register', staticPageLogged('register', '/play'));
    app.get('/register/:ref_id', staticPageLogged('register', '/play'));
    app.get('/login', staticPageLogged('login', '/play'));
    app.get('/reset/:recoverId', user.validateResetPassword);
    app.get('/faq_en', staticPageLogged('faq_en'));
    app.get('/faq_zh', staticPageLogged('faq_zh'));
    app.get('/ads_1', staticPageLogged('ads_1'));
    app.get('/ads_2', staticPageLogged('ads_2'));
    app.get('/mobile-qr/:type', restrict, user.mobileQR);
    app.get('/contactus', staticPageLogged('contactus'));
    app.post('/contactus', admin.contactUs);
    app.get('/request', restrict, user.request);
    app.get('/deposit', restrict, user.deposit);
    app.get('/withdraw-request', restrict, user.withdraw_request);
    app.get('/withdraw', restrict, user.withdraw);
    app.get('/withdraw/request', restrict, user.withdrawRequest);

    app.get('/support', restrict, user.support);
    app.get('/gamehistory', restrict, user.gamehistory);
    app.post('/gamehistory', restrict, user.gamehistory);
    app.get('/account', restrict, user.account);
    app.post('/account', restrict, user.account);
    app.get('/security', restrict, user.security);
    app.get('/forgot-password', staticPageLogged('forgot-password'));
    app.get('/calculator', staticPageLogged('calculator'));
    app.get('/guide', staticPageLogged('guide'));
    app.get('/tutorial', user.tutorial);
    app.get('/agent', restrict, user.agent);
    app.post('/agent', restrict, user.agent);
    app.get('/giveaway', user.giveawayRequest);
    app.post('/delete-mail', restrict, user.deleteMail);

    app.get('/transfer', restrict, user.transfer);
    app.get('/transfer.json', restrict, user.transferJson);
    app.get('/transfer-request', restrict, user.transferRequest);

    app.get('/play', table());

    app.get('/leaderboard', games.leaderboard);
    app.get('/game/:id', games.show);
    app.get('/no_user', staticPageLogged('profile_no_user'));
    app.get('/no_user_msg', staticPageLogged('profile_no_user_msg'));
    app.get('/user/:name', user.profile);

    // Admin Pages
    app.get('/company', restrict, admin.company);
    app.get('/customer', restrict, admin.customer);
    app.get('/setting', restrict, admin.setting);
    app.get('/exchangerate-admin', restrict, admin.exchangeRate);
    app.get('/ib-ranking-admin', restrict, admin.ibRanking);
    app.get('/capture-pay', restrict, admin.capturePay);
    app.get('/game-admin', restrict, admin.game);
    app.post('/game-admin', restrict, admin.game);
    app.get('/user-admin', restrict, admin.user);
    app.get('/withdraw-admin', restrict, admin.manualWithdraw);
    app.post('/withdraw-admin', restrict, admin.manualWithdraw);
    app.post('/user-admin', restrict, admin.user);
    app.get('/agent-admin', restrict, admin.agentTree);
    app.get('/agent-admin/:userId', restrict, admin.agentTree);
    app.post('/agent-admin', restrict, admin.agentTree);
    app.get('/user-detail-admin', restrict, admin.userDetail);
    // app.post('/user-detail-admin', restrict, admin.userDetail);
    app.get('/gamehistory-admin/:userId', restrict, admin.gameHistory);
    app.post('/gamehistory-admin/:userId', restrict, admin.gameHistory);
    app.get('/demo', restrict, admin.demo);
    app.get('/login_bonus', restrict, admin.loginBonus);
    app.get('/support-admin/:type', restrict, admin.support);
    app.get('/staff-admin/:staff_id?', restrict, admin.staffAdmin);
    app.get('/statistics-admin', restrict, admin.getStatisticsForAdminPage);
    app.post('/statistics-admin', restrict, admin.getStatisticsForAdminPage);
    app.post('/depositCapturePay', restrict, admin.depositCapturePay);
    app.post('/capturePayUnlockPassword', restrict, admin.capturePayUnlockPassword);
    app.post('/capturePayUpdatePassword', restrict, admin.capturePayUpdatePassword);

    app.post('/build_excel_report', restrict, admin.userDetailToExcel);
    app.post('/build_game_excel_report', restrict, admin.gameToExcel);
    app.get('/get_excel_report', function (req, res, next) {
        var file = 'report.xlsx';
        var mimetype = mime.lookup(file);

        res.setHeader('Content-disposition', 'attachment; filename=report.xlsx');
        res.setHeader('Content-type', mimetype);

        var filestream = fs.createReadStream(file);
        filestream.pipe(res);
    });

    app.get('/privacypolicy',
        // staticPageLogged('privacypolicy')
        // function(req, res) {
        // var file = 'policy.pdf';
        // var mimetype = mime.lookup(file);
        //
        // res.setHeader('Content-disposition', 'attachment; filename=policy.pdf');
        // res.setHeader('Content-type', mimetype);
        //
        // var filestream = fs.createReadStream(file);
        // filestream.pipe(res);
        // }
        function (req, res) {
            var file = 'policy.pdf';
            fs.readFile(file, function (err, data) {
                res.contentType('application/pdf');
                res.send(data);
            });
        }
    );

    app.get('/termsofservice',
        // staticPageLogged('termofservice')
        // function (req, res, next) {
        // var file = 'service.pdf';
        // var mimetype = mime.lookup(file);
        //
        // res.setHeader('Content-disposition', 'attachment; filename=service.pdf');
        // res.setHeader('Content-type', mimetype);
        //
        // var filestream = fs.createReadStream(file);
        // filestream.pipe(res);
        // }
        function (req, res) {
            var file = 'service.pdf';
            fs.readFile(file, function (err, data) {
                res.contentType('application/pdf');
                res.send(data);
            });
        }
    );

    // app.get('/company', staticPageLogged('admin-company'));
    // app.get('/customer', staticPageLogged('admin-customer'));
    // app.get('/setting', staticPageLogged('admin-setting'));

    app.get('/error', function (req, res, next) { // Sometimes we redirect people to /error
        return res.render('error');
    });

    app.post('/request', restrict, recaptchaRestrict, user.giveawayRequest);
    app.post('/sent-reset', user.resetPasswordRecovery);
    app.post('/sent-recover', recaptchaRestrict, user.sendPasswordRecover);
    app.post('/reset-password', restrict, user.resetPassword);
    app.post('/security/reset-password', restrict, user.resetPassword);
    app.post('/random-password', user.randomPassword);
    app.post('/edit-email', restrict, user.editEmail);
    app.post('/enable-2fa', restrict, user.enableMfa);
    app.post('/disable-2fa', restrict, user.disableMfa);
    app.post('/withdraw', restrict, user.handleWithdrawRequest);
    app.post('/withdraw-verify', restrict, user.withdraw);

    app.post('/support', restrict, user.saveSupport);
    app.post('/replySupport', restrict, admin.replySupport);
    app.post('/showSupportMessage', restrict, admin.showSupportMessage);
    app.post('/setSupportReadFlag', restrict, admin.setSupportReadFlag);
    app.post('/staff-add', restrict, admin.addNewStaff);
    app.post('/staff-update', restrict, admin.updateStaff);
    app.post('/staff-delete', restrict, admin.deleteStaff);
    app.post('/clickStaff', restrict, admin.getUsersFromStaff);
    app.post('/search', restrict, admin.getUsersFromSearch);
    app.post('/save_staff', restrict, admin.saveStaffInformation);
    // app.post('/make-report', restrict, admin.makeReport);

    app.post('/contact', contact('contact'));
    app.post('/logout', restrictRedirectToHome, user.logout);
    app.post('/login', recaptchaRestrict, user.login);
    app.post('/register', recaptchaRestrict, user.register);
    app.post('/register-verify', recaptchaRestrict, user.registerVerify);
    app.post('/resendRegisterVerifyCode', recaptchaRestrict, user.resendRegisterVerifyCode);
    app.post('/resendRegisterVerifyCodeToEmail', recaptchaRestrict, user.resendRegisterVerifyCodeToEmail);
    app.post('/uploadAdvertisement', restrict, admin.uploadAdvertisement);

    app.post('/saveNoAgentCommissionRegion', restrict, admin.saveNoAgentCommissionRegion);

    app.post('/uploadAvatar', restrict, user.uploadAvatar);
    app.post('/getBalanceSatoshis', restrict, user.getBalanceSatoshis);
    app.post('/setWelcomeFreeBits', restrict, admin.setWelcomeFreeBits);
    app.post('/setWithdrawableBetAmount', restrict, admin.setWithdrawableBetAmount);
    app.post('/setMinBetAmount', restrict, admin.setMinBetAmount);
    app.post('/setMaxBetAmount', restrict, admin.setMaxBetAmount);
    app.post('/setMinExtraBetAmount', restrict, admin.setMinExtraBetAmount);
    app.post('/setMaxExtraBetAmount', restrict, admin.setMaxExtraBetAmount);
    app.post('/setCollectFreeDays', restrict, admin.setCollectFreeDays);
    app.post('/setWelcomeBitsMultiplier', restrict, admin.setWelcomeBitsMultiplier);

    app.post('/setFirstDepositPercent', restrict, admin.setFirstDepositPercent);
    app.post('/setFirstDepositMultiplier', restrict, admin.setFirstDepositMultiplier);
    app.post('/setToBeAgentDepositMultiplier', restrict, admin.setToBeAgentDepositMultiplier);
    app.post('/setToBeAgentClientCount', restrict, admin.setToBeAgentClientCount);
    app.post('/setMinTransferAmount', restrict, admin.setMinTransferAmount);
    app.post('/setMaxTransferAmount', restrict, admin.setMaxTransferAmount);
    app.post('/setMaxProfit', restrict, admin.setMaxProfit);
    app.post('/setContactUsEmail', admin.setContactUsEmail);

    app.post('/depositFakePool', restrict, admin.depositFakePool);
    app.post('/depositFakeAccount', restrict, admin.depositFakeAccount);
    app.post('/setAddGamingPool', restrict, admin.setAddGamingPool);
    app.post('/setETHAddress', restrict, admin.setETHAddress);
    app.post('/setETHPassword', restrict, admin.setETHPassword);
    app.post('/setLoginBonusBet', restrict, admin.setLoginBonusBet);
    app.post('/saveLoginBonus', restrict, admin.saveLoginBonus);
    app.post('/setExtraBetMultiplier', restrict, admin.setExtraBetMultiplier);
    app.post('/setMaxTipFeeAmount', restrict, admin.setMaxTipFeeAmount);
    app.post('/setTipFee', restrict, admin.setTipFee);
    app.post('/saveIntervals', restrict, admin.saveIntervals);
    app.post('/saveBetRanges', restrict, admin.saveBetRanges);
    app.post('/setIntervalStatus', restrict, admin.setIntervalStatus);
    app.post('/change-mail', restrict, admin.changeMail);
    app.post('/setUserCanChatStatus', restrict, admin.setUserCanChatStatus);
    app.post('/savePhoneNumber', restrict, admin.savePhoneNumber);
    app.post('/saveRefId', restrict, admin.saveRefId);

    app.post('/requestVerifyCode', restrict, user.requestVerifyCode);
    app.post('/saveCommonSetting', restrict, admin.saveCommonSetting);

    app.post('/saveDemoAccount', restrict, admin.saveDemoAccount);
    app.post('/deleteDemoAccount', restrict, admin.deleteDemoAccount);
    app.post('/saveTutorials', restrict, admin.saveTutorials);
    app.post('/getCompanyProfitForGraph', restrict, admin.getCompanyProfitForGraph);
    app.post('/getCustomerProfitForGraph', restrict, admin.getCustomerProfitForGraph);
    app.post('/saveExchangeRate', restrict, admin.saveExchangeRate);
    app.post('/getExchangeRate', admin.getExchangeRate);
    app.post('/saveAgentProfitPercent', restrict, admin.saveAgentProfitPercent);
    app.post('/getAgentProfitPercent', restrict, admin.getAgentProfitPercent);
    app.post('/setUserClass', restrict, admin.setUserClass);
    app.post('/deleteUser', restrict, admin.deleteUser);
    app.post('/sendMessageToMultiUsers', restrict, admin.sendMessageToMultiUsers);
    app.post('/sendSMSToMultiUsers', restrict, admin.sendSMSToMultiUsers);
    app.post('/setBetMode', restrict, admin.setBetMode);
    app.post('/setMobileBetMode', restrict, admin.setMobileBetMode);
    app.post('/setShowHash', restrict, admin.setShowHash);
    app.post('/getLeaderBoardTop5', games.getLeaderboardTop5);
    app.post('/getAgentUserList', user.getAgentUserList);
    app.post('/saveIBRanking', restrict, admin.saveIBRanking);
    app.post('/transfer-request', user.handleTransferRequest);
    app.post('/saveTransactionID', admin.saveTransactionID);
    app.post('/getNewWithdraws', admin.getNewWithdraws);
    app.post('/get-notifications', restrict, user.getNotification);

    app.post('/ott', restrict, function (req, res, next) {
        var user = req.user;
        var time_zone = req.user.time_zone;
        var ipAddress = req.ip;
        var userAgent = req.get('user-agent');
        assert(user);
        // console.log('routes.js : app.post/ott');
        database.createOneTimeToken(user.id, ipAddress, userAgent, time_zone, function (err, token) {
            if (err) {
                console.error('[INTERNAL_ERROR] unable to get OTT got ' + err);
                res.status(500);
                return res.send('Server internal error');
            }
            res.send(token);
        });
    });
    app.get('/stats', stats.index);

    app.post('/saveETHUserAddress', user.saveETHUserAddress);

    // Admin stuff
    app.get('/admin-giveaway', adminRestrict, admin.giveAway);
    app.post('/admin-giveaway', adminRestrict, admin.giveAwayHandle);

    app.get('*', function (req, res) {
        res.status(404);
        res.render('404');
    });

    app.post('/eurocrypt', function (req, res, next) {
        name = req.body.data;

        res.send('name');
    });

    app.post('/setLanguage', function (req, res, next) {
        var current_url = req.body.current_url;
        var language_code = req.body.language_code;

        if (current_url.includes('faq')) {
            current_url = current_url.replace(/en/g, language_code);
            current_url = current_url.replace(/zh/g, language_code);
        } else {
            if (current_url.includes('clang')) {
                current_url = current_url.replace('clang=en', 'clang=' + language_code);
                current_url = current_url.replace('clang=zh', 'clang=' + language_code);
            } else if (current_url.includes('?')) {
                current_url = current_url + '&clang=' + language_code;
                // current_url = current_url.replace('?', '?clang=' + language_code + '&');
            } else {
                current_url = current_url + '?clang=' + language_code;
            }
        }
        res.redirect(current_url);
    });

    //= ===== Exchange Site ======
    app.post('/api/getPlayerInfo', api.getPlayerInfo);
    app.post('/api/getBalanceById', api.getBalanceById);
    app.post('/api/updateBalance', api.updateBalance);
    app.post('/api/getCompanyBalance', api.getCompanyBalance);
    app.post('/api/increaseCompanyBalance', api.increaseCompanyBalance);
    //= ===== Funding Site ======
    app.post('/api/confirmInfo', api.confirmInfo);
    app.post('/api/increaseGpBalance', api.increaseGpBalance);
    //= ===== Funding Site ======
    app.post('/api/tokenDeposit', api.tokenDeposit);
    app.post('/api/updateMDC', api.updateMDC);
};
