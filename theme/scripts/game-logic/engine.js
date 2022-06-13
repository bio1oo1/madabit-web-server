/* eslint-disable padded-blocks */
define([
    'socketio',
    'lib/events',
    'lodash',
    'game-logic/clib',
    'constants/AppConstants',
    'dispatcher/AppDispatcher'
], function (
    io,
    Events,
    _,
    Clib,
    AppConstants,
    AppDispatcher
) {
    function Engine () {
        var self = this;

        /**
         * Engine inherits from BackBone events:
         * http://backbonejs.org/#Events
         * which means it has events like .on, off, .trigger, .once, .listenTo, .stopListening
         */
        _.extend(this, Events);

        self.ws = io(AppConstants.Engine.HOST);

        // Dev functions
        // window.disconnect = function() {
        //    self.ws.io.disconnect();
        // };
        //
        // window.reconnect = function() {
        //    self.ws.io.connect();
        // };

        /** The engine is connected to the server, if not connected, all fields are unreadable */
        self.isConnected = false;

        /** The username or null if is not logged in */
        self.username = null;
        self.demo = null;
        self.admin = null;
        self.superadmin = null;
        self.staff = null;

        /** The balance of the user */
        self.balanceSatoshis = null;
        self.warnBalance = false;

        /** Array containing chat history */
        // self.chat = [];

        /** Object containing the game history */
        self.tableHistory = [];

        /** Array of the user names of the current players who joined the game, while the game is STARTING
         * sorted by bet by the server but the client doesn't know the bet amount
         * its empty in the other states */
        self.joined = [];
        self.demos = {};

        /** Object containing the current game players and their status, this is saved in game history every game crash
         * cleared in game_starting.
         * e.g: { user1: { bet: satoshis, stopped_at: 200 }, user2: { bet: satoshis } }
         */
        self.playerInfo = null;

        /**
         * The state of the game
         * Possible states: IN_PROGRESS, ENDED, STARTING
         */
        self.gameState = null;

        /** Creation time of current game. This is the server time, not clients.. **/
        self.created = null;

        /** The game id of the current game */
        self.gameId = null;

        /** How much can be won this game */
        self.maxWin = null;

        /** gaming pool */
        self.bankroll = 0;
        self.fakepool = 0;
        self.agent_sys_fee_pro = 0;
        self.in_come_bets = 0;

        /**
         * Client side times:
         * if the game is pending, startTime is how long till it starts
         * if the game is running, startTime is how long its running for
         * if the game is ended, startTime is how long since the game started
         */
        self.startTime = null;

        /** time from the game_starting event to game_started event **/
        self.timeTillStart = null;

        /** If you are currently placing a bet
         * True if the bet is queued (nextBetAmount)
         * True if the bet was sent to the server but the server has not responded yet
         *
         * Cleared in game_started, its possible to receive this event before receiving the response of
         */
        self.placingBet = false;
        self.placingRangeBet = false;

        /** True if cashing out.. */
        self.cashingOut = false;

        /**
         * If a number, how much to bet next round
         * Saves the queued bet if the game is not 'game_starting', cleared in 'bet_placed' by us and 'game_started' and 'cancel bet'
         */
        self.nextBetAmount = null;
        self.nextExtraBetAmount = null;
        self.nextRangeBetAmount = null;
        self.nextRangeBetID = {};

        /** Complements nextBetAmount queued bet with the queued autoCashOut */
        self.nextAutoCashout = null;

        /** Store the id of the timer to check for lag **/
        self.tickTimer = null;

        /** Tell if the game is lagging but only  when the game is in progress **/
        self.lag = false;

        /** The hash of the last game **/
        self.lastHash = null;

        self.nMinBetAmount = 1;
        self.nMaxBetAmount = 1000000;
        self.nMinExtraBetAmount = 1;
        self.nMaxExtraBetAmount = 1000000;
        self.nMinRangeBetAmount = 1;
        self.nMaxRangeBetAmount = 1000000;
        self.nMaxBetStop = 1000000;
        self.autoRangeBet = false;

        self.rangeInfo = null;

        self.gotUpdate = false;

        self.nExtraBetMultiplier = 50;
        self.bet_mode = 'auto_bet';
        self.bet_mode_mobile = 'custom_show';
        self.show_hash = 'show_hash';

        self.is_parent = null;
        self.topPlayer = {name: '', profit: 0};

        /** Replied messages for notification **/
        // self.reply = [];

        /**
         * Events triggered by the engine
         *
         * 'connected': The client is connected to the server
         * 'disconnected': The client got disconnected to the server
         * 'game_started': The game just started
         * 'game_crash': The game just crashed
         * 'game_starting': The game is going to start in X ms
         *
         * 'player_bet': A player bet
         * 'cashed_out': A player cashed out
         * 'msg': A player sent a message to the chat
         *
         * 'placing_bet':
         * 'bet_placed':
         * 'bet_queued':
         * 'cashing_out':
         * 'cancel_bet':
         *
         * 'lag_change': The engine changed its lag state
         *
         * 'error': Socket io errors
         * 'err': Server errors
         */

        toastr.options = {
            'closeButton': true,
            'debug': false,
            'positionClass': 'toast-top-right',
            'onclick': null,
            'showDuration': '1000',
            'hideDuration': '1000',
            'timeOut': '5000',
            'extendedTimeOut': '2000',
            'showEasing': 'swing',
            'hideEasing': 'linear',
            'showMethod': 'fadeIn',
            'hideMethod': 'fadeOut'
        };

        /**
         * Event called at the moment when the game starts
         */
        self.ws.on('game_started', function (startInfo) {

            var bets = startInfo.bets;
            var extraBets = startInfo.extraBets;
            var rangeBets = startInfo.rangeBets;
            var demos = startInfo.demos;

            // console.log('game_started', self.autoRangeBet, self.nextRangeBetID);
            self.in_come_bets = startInfo.in_come_bets;

            self.joined = [];

            self.gameState = 'IN_PROGRESS';
            // console.log('Engine - Getting Game State IN PROGRESS');
            self.startTime = Date.now();
            self.lastGameTick = self.startTime;
            self.placingBet = false;
            self.placingRangeBet = false;
            self.timeTillStart = null;

            self.nextBetAmount = null;
            self.nextExtraBetAmount = null;
            self.nextRangeBetAmount = null;
            if (self.autoRangeBet != 'true' && self.autoRangeBet != true) { self.nextRangeBetID = {}; }
            self.nextAutoCashout = null;

            // Create the player info object with bet and username
            // If you are in the bets rest your bet from your balance
            Object.keys(bets).forEach(function (username) {
                if (self.username === username) {
                    self.balanceSatoshis -= bets[username];
                }

                self.playerInfo[username] = {
                    bet: bets[username],
                    username: username,
                    demo: demos[username]
                };
            });

            // Create the player info object with bet and username
            // If you are in the extra bets rest your bet from your balance
            if (extraBets != undefined && extraBets != null) {
                Object.keys(extraBets).forEach(function (username) {
                    if (self.username === username) {
                        self.balanceSatoshis -= extraBets[username];
                    }

                    self.playerInfo[username].extraBet = extraBets[username];
                });
            }

            if (rangeBets != undefined && rangeBets != null) {
                Object.keys(rangeBets).forEach(function (username) {
                    if (self.username === username) {
                        rangeBets[username].forEach(function (rangeBet) {
                            self.balanceSatoshis -= rangeBet.amount;
                        });
                    }

                    self.playerInfo[username].rangeBet = rangeBets[username];
                });
            }

            // alert when balance < 500
            if (self.warnBalance == false && self.balanceSatoshis < 50000 && self.balanceSatoshis !== null) {
                if (self.admin != true) {
                    $('.balance-modal').slideDown(110);
                }
                self.warnBalance = true;
            }

            if (self.balanceSatoshis > 50000 && self.balanceSatoshis !== null) {
                self.warnBalance = false;
            }

            self.trigger('game_started', self.playerInfo);
        });

        /**
         * Event called each 150ms telling the client the game is still alive
         * @param {number} data - elapsed time
         */
        self.ws.on('game_tick', function (elapsed) {
            /** Time of the last tick received */
            self.lastGameTick = Date.now();
            if (self.lag === true) {
                self.lag = false;
                self.trigger('lag_change');
            }

            /** Correct the time of startTime every gameTick **/
            var currentLatencyStartTime = self.lastGameTick - elapsed;
            if (self.startTime > currentLatencyStartTime) { self.startTime = currentLatencyStartTime; }

            if (self.tickTimer) { clearTimeout(self.tickTimer); }

            self.tickTimer = setTimeout(self.checkForLag.bind(self), AppConstants.Engine.STOP_PREDICTING_LAPSE);

            self.trigger('game_tick');
        });

        /** Socket io errors */
        self.ws.on('error', function (x) {
            console.log('on error: ', x);
            self.trigger('error', x);
        });

        /** Server Errors */
        self.ws.on('err', function (err) {
            console.error('Server sent us the error: ', err, 'AppConstants.Engine.HOST', AppConstants.Engine.HOST);
        });

        /**
         * Event called at game crash
         * @param {object} data - JSON payload
         * @param {number} data.elapsed - Total game elapsed time
         * @param {number} data.game_crash - Crash payout quantity in percent eg. 200 = 2x. Use this to calculate payout!
         * @param {string} data.hash - Revealed hash of the game
         */
        self.ws.on('game_crash', function (data) {
            if (self.tickTimer) { clearTimeout(self.tickTimer); }

            self.lastHash = data.hash;

            var gameInfo = {
                created: self.created,
                ended: true,
                game_crash: data.game_crash,
                game_id: self.gameId,
                hash: data.hash,
                player_info: self.playerInfo
            };

            // Add the current game info to the game history and if the game history is larger than 40 remove one element
            if (self.tableHistory.length >= 40) { self.tableHistory.pop(); }
            self.tableHistory.unshift(gameInfo);

            // Clear current game properties
            self.gameState = 'ENDED';
            // console.log('Engine - Getting Game State ENDED');
            self.cashingOut = false;
            self.lag = false;

            self.trigger('game_crash', data);
        });

        /**
         * Event called before starting the game to let the client know when the game is going to start
         * @param {object} info - JSON payload
         * @param {number} info.game_id - The next game id
         * @param {number} info.time_till_start - Time lapse for the next game to begin
         */
        self.ws.on('game_starting', function (info) {
            // console.log('Engine - Getting Game State STARTING');
            self.playerInfo = {};
            self.joined = [];

            self.gameState = 'STARTING';
            self.gameId = info.game_id;
            self.timeTillStart = info.time_till_start;
            self.startTime = new Date(Date.now() + info.time_till_start);
            self.maxWin = info.max_win;

            // Every time the game starts checks if there is a queue bet and send it

            if (self.nextBetAmount) {
                if (self.nextExtraBetAmount) {
                    // console.log("self.doBet : balance : ", self.balanceSatoshis, "bet : ", self.nextBetAmount, "extraBet : ", self.nextExtraBetAmount, "autoCashOut : ", self.nextAutoCashout);
                    self.doBet(self.nextBetAmount, self.nextExtraBetAmount, self.nextAutoCashout, function (err) {
                        if (err) { console.log('Response from placing a bet: ', err); }
                    });
                } else {
                    // console.log("self.doBet : balance : ", self.balanceSatoshis, "bet : ", self.nextBetAmount, "extraBet : ", 0, "autoCashOut : ", self.nextAutoCashout);
                    self.doBet(self.nextBetAmount, 0, self.nextAutoCashout, function (err) {
                        if (err) { console.log('Response from placing a bet: ', err); }
                    });
                }
            }

            if (Object.keys(self.nextRangeBetID).length != 0) {
                self.doRangeBet(self.nextRangeBetID, function (err) {
                    if (err) {
                        console.log('Response from placing a range bet: ' + err);
                    }
                });
            }

            self.trigger('game_starting', info);
        });

        /**
         * Event called every time a user places a bet
         * the user that placed the bet could be me so we check for that
         * @param {object} resp - JSON payload
         * @param {string} resp.username - The player username
         * @param {number} resp.bet - The player bet in satoshis
         */
        self.ws.on('player_bet', function (data) {
            if (self.username === data.username) {
                self.placingBet = false;
                self.nextBetAmount = null;
                self.nextExtraBetAmount = null;
                self.nextRangeBetAmount = null;
                self.nextAutoCashout = null;
            }

            self.joined.splice(data.index, 0, data.username);
            self.demos[data.username] = data.demo;

            self.trigger('player_bet', data);
        });

        /**
         * Event called every time the server cash out a user
         * if we call cash out the server is going to call this event
         * with our name.
         * @param {object} resp - JSON payload
         * @param {string} resp.username - The player username
             * @param {number} resp.stopped_at -The percentage at which the user cashed out
         */
        self.ws.on('cashed_out', function (resp) {
            // Add the cashout percentage of each user at cash out
            if (!self.playerInfo[resp.username]) { return console.warn('Username not found in playerInfo at cashed_out: ', resp.username); }

            self.playerInfo[resp.username].stopped_at = resp.stopped_at;

            if (self.username === resp.username) {
                self.cashingOut = false;
            }

            self.trigger('cashed_out', resp);
        });

        self.ws.on('add_satoshis', function (totalUserProfitMap) {
            if (totalUserProfitMap == null) return;
            var userArray = Object.keys(totalUserProfitMap);
            var profit = 0;
            for (var i = 0; i < userArray.length; i++) {
                var userProfitMap = totalUserProfitMap[userArray[i]];

                if (self.username == userArray[i]) { profit += userProfitMap.profit_for_player; }
                if (self.username == userProfitMap.user_master_ib) { profit += userProfitMap.profit_for_master_ib; }
                if (self.username == userProfitMap.user_parent1) { profit += userProfitMap.profit_for_parent1; }
                if (self.username == userProfitMap.user_parent2) { profit += userProfitMap.profit_for_parent2; }
                if (self.username == userProfitMap.user_parent3) { profit += userProfitMap.profit_for_parent3; }
            }

            if (profit != 0) {
                self.balanceSatoshis += profit;
                self.trigger('add_satoshis');
            }
        });

        self.ws.on('got_login_bonus', function (ptf) {
            var ptf_username = ptf.username;
            var got_login_bonus = ptf.got_login_bonus;

            if (ptf_username == self.username && ptf_username != null) {
                got_login_bonus = parseFloat(got_login_bonus);
                if (!isNaN(got_login_bonus) && got_login_bonus != 0) {
                    self.balanceSatoshis += got_login_bonus;
                    got_login_bonus /= 100;
                    var strTString = strBonusMessage4 + got_login_bonus + strBonusMessage5;
                    toastr['success'](strTString);
                    self.trigger('got_login_bonus', ptf);
                }
            }
        });

        self.ws.on('got_first_deposit_fee', function (fdf) {
            fdf_username = fdf.username;
            fdf_clientname = fdf.clientname;
            fAvailableFee = fdf.fAvailableFee;

            if (fdf_username == self.username && fdf_username != null) {
                fAvailableFee = parseFloat(fAvailableFee);
                if (!isNaN(fAvailableFee) && fAvailableFee != 0) {
                    self.balanceSatoshis += Math.round(fAvailableFee * 100);

                    var strTString = strBonusMessage6 + fdf_clientname + strBonusMessage7 + fAvailableFee + strBonusMessage8;
                    toastr['success'](strTString);
                    self.trigger('got_first_deposit_fee', fdf);
                }
            }
        });

        self.ws.on('update_bankroll', function (bankroll) {
            self.bankroll = parseInt(bankroll.bankroll / 100);
            self.fakepool = parseInt(bankroll.fakepool / 100);
            self.agent_sys_fee_pro = parseFloat(bankroll.agent_sys_fee_pro);
            if (isNaN(self.agent_sys_fee_pro)) self.agent_sys_fee_pro = 0;

            self.trigger('update_bankroll', bankroll);
        });

        self.ws.on('update_bet_info', function (bet_info) {
            self.nMinBetAmount = parseInt(bet_info.min_bet_amount);
            self.nMaxBetAmount = parseInt(bet_info.max_bet_amount);
            self.nMinExtraBetAmount = parseInt(bet_info.min_extra_bet_amount);
            self.nMaxExtraBetAmount = parseInt(bet_info.max_extra_bet_amount);
            self.nExtraBetMultiplier = parseInt(bet_info.extrabet_multiplier);
            self.nMinRangeBetAmount = parseInt(bet_info.min_range_bet_amount);
            self.nMaxRangeBetAmount = parseInt(bet_info.max_range_bet_amount);
            self.bet_mode = bet_info.bet_mode;
            self.bet_mode_mobile = bet_info.bet_mode_mobile;
            self.show_hash = bet_info.show_hash;

            self.gotUpdate = true;

            self.trigger('update_bet_info', bet_info);
        });

        self.ws.on('update_range_info', function (range_info) {
            self.rangeInfo = range_info;
            self.trigger('update_range_info', range_info);
        });

        /** Triggered by the server to let users the have to reload the page */
        self.ws.on('update', function () {
            alert(strGameplayAlert0);
        });

        self.ws.on('setMaintenance', function (res) {
            self.maintenance = res.maintenance;
        });

        self.ws.on('connect', function () {
            requestOtt(function (err, ott) {
                if (err && err != 401) { // If the error is 401 means the user is not logged in
                    console.error('request ott error:', err);
                    if (confirm(strGameplayAlert9 + err)) { location.reload(); }
                    return;
                }

                // If there is a Dev ott use it
                self.ws.emit('join', { ott: window.DEV_OTT ? window.DEV_OTT : ott },
                    function (err, resp) {
                        if (err) {
                            console.error('Error when joining the game...', err);
                            return;
                        }

                        self.balanceSatoshis = resp.balance_satoshis;

                        // self.chat = resp.chat;

                        /** If username is a falsey  value the user is not logged in */
                        self.username = resp.username;
                        self.demo = resp.demo;

                        /** Variable to check if we are connected to the server */
                        self.isConnected = true;
                        self.gameState = resp.state;
                        self.playerInfo = resp.player_info;

                        // set current game properties
                        self.gameId = resp.game_id;
                        self.maxWin = resp.max_win;
                        self.lastHash = resp.last_hash;
                        self.created = resp.created;
                        self.startTime = new Date(Date.now() - resp.elapsed);
                        self.joined = resp.joined;
                        self.admin = resp.admin;
                        self.superadmin = resp.superadmin;
                        self.staff = resp.staff;
                        self.is_parent = resp.is_parent;
                        self.tableHistory = resp.table_history;
                        self.maintenance = resp.maintenance;

                        // self.reply = resp.reply;    // replied messages for notification

                        if (self.gameState === 'IN_PROGRESS') { self.lastGameTick = Date.now(); }

                        // Attach username to each user for sorting proposes
                        for (var user in self.playerInfo) {
                            self.playerInfo[user].username = user;
                        }

                        self.trigger('connected');
                    }
                );
            });
        });

        self.ws.on('disconnect', function (data) {
            self.isConnected = false;

            console.log('Client disconnected |', data, '|', typeof data);
            self.trigger('disconnected');
        });
    }

    /**
     * STOP_PREDICTING_LAPSE milliseconds after game_tick we put the game in lag state
     */
    Engine.prototype.checkForLag = function () {
        this.lag = true;
        this.trigger('lag_change');
    };

    /**
     * Sends chat message
     * @param {string} msg - String containing the message, should be longer than 1 and shorter than 500.
     */
    // Engine.prototype.say = function(msg) {
    //    console.assert(msg.length > 1 && msg.length < 500);
    //    this.ws.emit('say', msg);
    // };

    /**
     * Places a bet with a giving amount.
     * @param {number} amount - Bet amount in bits
     * * @param {number} extraBet - Extra Bet amount in bits
     * @param {number} autoCashOut - Percentage of self cash out
     * @param {function} callback(err, result)
     */
    Engine.prototype.bet = function (amount, extraBet, autoCashOut, callback) {
        if (amount == undefined && extraBet == undefined && autoCashOut == undefined) { return console.error('bet : amount : error'); }

        if (extraBet == undefined || extraBet == null) extraBet = 0;

        console.assert(typeof amount === 'number');
        console.assert(Clib.isInteger(amount));
        console.assert(Clib.isInteger(extraBet));
        console.assert(!autoCashOut || (typeof autoCashOut === 'number' && autoCashOut >= 100));

        if (!Clib.isInteger(amount) || !((amount % 100) == 0)) { return console.error('The bet amount should be integer and divisible by 100'); }

        if (!Clib.isInteger(extraBet) || !((extraBet % 100) == 0)) { return console.error('The bet extra-bet should be integer and divisible by 100'); }

        this.nextBetAmount = amount;
        this.nextExtraBetAmount = extraBet;
        this.nextAutoCashout = autoCashOut;
        this.placingBet = true;
        this.placingRangeBet = false;

        if (this.gameState === 'STARTING') {
            // console.log("engine.bet : doBet : balance : ", this.balanceSatoshis, "bet : ", amount, "extraBet : ", extraBet, "autoCashOut : ", autoCashOut);
            return this.doBet(amount, extraBet, autoCashOut, callback);
        }

        // otherwise, lets queue the bet
        if (callback) { callback(null, 'WILL_JOIN_NEXT'); }

        this.trigger('bet_queued');
    };

    Engine.prototype.rangeBet = function (rangeBetInfo, callback) {

        // console.assert(Clib.isInteger(rangeBetInfo.amount));

        Object.keys(rangeBetInfo).forEach(function (key) {
            if (rangeBetInfo[key] != undefined && rangeBetInfo[key] != null) {
                // if (!Clib.isInt(rangeBetInfo[key]) || !((rangeBetInfo[key] % 100) == 0)) {
                if (!((rangeBetInfo[key] % 100) == 0)) {
                    return console.error('The bet range-bet should be integer and divisible by 100');
                }
            }
        });

        // this.nextExtraBetAmount = Bet;
        // this.nextRangeBetAmount = rangeBetInfo.amount;
        this.nextRangeBetID = rangeBetInfo;
        this.placingBet = false;
        this.placingRangeBet = true;

        if (this.gameState === 'STARTING') {
            // console.log("engine.bet : doBet : balance : ", this.balanceSatoshis, "bet : ", amount, "extraBet : ", extraBet, "autoCashOut : ", autoCashOut);
            return this.doRangeBet(rangeBetInfo, callback);
        }

        // otherwise, lets queue the bet
        if (callback) { callback(null, 'WILL_JOIN_NEXT'); }

        this.trigger('range_bet_queued');
    };

    Engine.prototype.setAutoRangeBet = function (autoRangeBet, rangeBetID) {

        this.autoRangeBet = autoRangeBet;
        this.trigger('set_auto_range_bet');

        if (autoRangeBet == 'true' || autoRangeBet == true) {
            this.rangeBet(rangeBetID);
        } else {
            this.cancelRangeBet();
        }
    };

    Engine.prototype.finishRound = function (currentTime, currentPoint) {
        // if(this.gameState === 'STARTING' || )
        if (currentPoint == undefined || currentPoint <= 1) { return; }
        this.ws.emit('finish_round', currentTime, currentPoint, this.gameId, function (error) {
            if (error) {
                console.warn('place_bet error: ', error);
            }
        });
    };

    Engine.prototype.setNext0 = function () {
        this.ws.emit('set_next_0', function (error) {
            if (error) {
                console.warn('Set Next 0 Error: ', error);
            }
        });
    };

    /** Throw the bet at the server **/
    Engine.prototype.doBet = function (amount, extraBet, autoCashOut, callback) {
        var self = this;

        var rangeBetInfo = {};

        this.ws.emit('place_bet', amount, extraBet, autoCashOut, rangeBetInfo, function (error) {
            if (error) {
                if (error !== 'GAME_IN_PROGRESS' && error !== 'ALREADY_PLACED_BET') {
                    bootbox.alert(strGameplayAlert2 + error);
                }
                if (callback) { callback(error); }
                return;
            }

            self.trigger('bet_placed');

            if (callback) { callback(null); }
        });
        self.trigger('placing_bet');
    };

    /** Throw the range bet at the server **/
    Engine.prototype.doRangeBet = function (rangeBetInfo, callback) {
        var self = this;

        var totalRangeBetAmount = 0;
        Object.keys(rangeBetInfo).forEach(function (range_id) {
            if (rangeBetInfo[range_id] == undefined || rangeBetInfo[range_id] == null ||
                rangeBetInfo[range_id] == '' || rangeBetInfo[range_id] == 0) { delete rangeBetInfo[range_id]; } else { totalRangeBetAmount += parseInt(rangeBetInfo[range_id]); }
        });
        if (totalRangeBetAmount > this.balanceSatoshis || totalRangeBetAmount == 0) {
            this.autoRangeBet = false;
            this.nextRangeBetID = {};
            self.trigger('range_bet_queued');
            return;
        }

        this.ws.emit('place_bet', 0, 0, 0, rangeBetInfo, function (error) {
            if (error) {
                if (error !== 'GAME_IN_PROGRESS' && error !== 'ALREADY_PLACED_BET') {
                    bootbox.alert(strGameplayAlert2 + error);
                }
                if (callback) { callback(error); }
                return;
            }

            self.trigger('range_bet_placed');

            if (callback) { callback(null); }
        });
        self.trigger('placing_range_bet');
        if (this.autoRangeBet == 'true' || this.autoRangeBet == true) {
            self.trigger('range_bet_queued');
        }
    };

    /** Cancels a bet, if the game state is able to do it so */
    Engine.prototype.cancelBet = function () {
        if (!this.nextBetAmount) { return console.error('Can not cancel next bet, wasn\'t going to make it...'); }

        this.nextBetAmount = null;
        this.nextExtraBetAmount = null;
        this.placingBet = false;

        this.trigger('cancel_bet');
    };

    /** Cancels a bet, if the game state is able to do it so */
    Engine.prototype.cancelRangeBet = function () {
        // if (Object.keys(this.nextRangeBetID).length != 0) {
        //     return console.error('Can not cancel next range bet, wasn\'t going to make it...');
        // }

        this.nextRangeBetAmount = null;
        this.nextRangeBetID = {};
        this.placingRangeBet = false;

        this.trigger('cancel_range_bet');
    };

    /**
     * Request the server to cash out
     */
    Engine.prototype.cashOut = function () {
        var self = this;
        this.cashingOut = true;
        this.ws.emit('cash_out', function (error) {
            if (error) {
                self.cashingOut = false;
                console.warn('Cashing out error: ', error);
                self.trigger('cashing_out_error');
            }
        });
        this.trigger('cashing_out');
    };

    /**
     * Function to request the one time token to the server
     */
    function requestOtt (callback) {
        try {
            var ajaxReq = new XMLHttpRequest();

            if (!ajaxReq) { throw new Error("Your browser doesn't support xhr"); }

            ajaxReq.open('POST', '/ott', true);
            ajaxReq.setRequestHeader('Accept', 'text/plain');
            ajaxReq.send();
        } catch (e) {
            console.error(e);
            alert(strGameplayAlert3 + e);
            location.reload();
        }

        ajaxReq.onload = function () {
            if (ajaxReq.status == 200) {
                var response = ajaxReq.responseText;
                callback(null, response);
            } else if (ajaxReq.status == 401) {
                callback(ajaxReq.status);
            } else callback(ajaxReq.responseText);
        };
    }

    /** Create engine Singleton **/
    var EngineSingleton = new Engine();

    /**
     * Here is the other virtual part of the store:
     * The actions created by flux views are converted
     * to calls to the engine which will case changes there
     * and they will be reflected here through the event listener
     */
    AppDispatcher.register(function (payload) {
        var action = payload.action;

        switch (action.actionType) {
            case AppConstants.ActionTypes.PLACE_BET:
                EngineSingleton.bet(action.bet, action.extraBet, action.cashOut);
                break;

            case AppConstants.ActionTypes.PLACE_RANGE_BET:
                EngineSingleton.rangeBet(action.rangeBet);
                break;

            case AppConstants.ActionTypes.CANCEL_BET:
                EngineSingleton.cancelBet();
                break;

            case AppConstants.ActionTypes.CANCEL_RANGE_BET:
                EngineSingleton.cancelRangeBet();
                break;

            case AppConstants.ActionTypes.CASH_OUT:
                EngineSingleton.cashOut();
                break;
            case AppConstants.ActionTypes.SET_AUTO_RANGE_BET:
                EngineSingleton.setAutoRangeBet(action.autoRangeBet, action.rangeBetID);
                break;
            case AppConstants.ActionTypes.FINISH_ROUND:
                EngineSingleton.finishRound(action.currentTime, action.currentPoint);
                break;
            case AppConstants.ActionTypes.SET_NEXT_0:
                EngineSingleton.setNext0();
                break;
            //
            // case AppConstants.ActionTypes.SAY_CHAT:
            //    EngineSingleton.say(action.msg);
            //    break;
        }

        return true; // No errors. Needed by promise in Dispatcher.
    });

    // Singleton Engine
    return EngineSingleton;
});
