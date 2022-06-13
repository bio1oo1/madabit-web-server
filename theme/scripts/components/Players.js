define([
    'react',
    'game-logic/clib',
    'lodash',
    'game-logic/engine',
    'classnames'
], function (
    React,
    Clib,
    _,
    Engine,
    CX
) {
    var D = React.DOM;

    function calcProfit (bet, extraBet, rangeBetInfo, stoppedAt) {
        var profit = 0;
        if (stoppedAt) {
            if (stoppedAt === 0) {
                if (extraBet > 0) { // extraBet success
                    profit = extraBet * Engine.nExtraBetMultiplier;
                } else {
                    profit = -bet;
                }
            } else if (rangeBetInfo.amount > 0) {
                if (stoppedAt >= rangeBetInfo.range_from && stoppedAt <= rangeBetInfo.range_to) {
                    profit = rangeBet.amount * rangeBetInfo.range_bet_multiplier;
                }
            } else {
                profit = ((stoppedAt - 100) * bet) / 100 - extraBet;
            }
        } else {
            profit = (-bet - extraBet - rangeBetInfo.amount);
        }

        return profit;
    }

    function getState () {
        return {
            engine: Engine
        };
    }

    return React.createClass({
        displayName: 'usersPlaying',

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            Engine.on({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange
            });
        },

        componentWillUnmount: function () {
            Engine.off({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange
            });
        },

        _onChange: function () {
            if (this.isMounted()) { this.setState(getState()); }
        },

        render: function () {
            var current_time = new Date();
            var imgAppendStr = current_time.getFullYear() + current_time.getMonth() + current_time.getDate() + current_time.getHours() + current_time.getMinutes();

            function generatingRangeString (range_from, range_to) {
                var from;
                var to;
                if (range_from == range_to) { from = range_from / 100; }
                // else from = (range_from-1)/100;
                else from = (range_from) / 100;

                if (range_to == -1) {
                    from = from + ' ~ ';
                    to = '';
                } else if (range_from == range_to) {
                    to = '';
                } else {
                    to = ' ~ ' + range_to / 100;
                }
                return from + to;
            }

            var self = this;

            var usersWonCashed = [];
            var usersLostPlaying = [];

            var trUsersWonCashed;
            var trUsersLostPlaying;

            var tBody;

            var game = self.state.engine;

            /** Separate and sort the users depending on the game state **/
            if (game.gameState === 'STARTING') {
                usersLostPlaying = self.state.engine.joined.map(function (player) {
                    var bet; // can be undefined
                    var extraBet;
                    var rangeBetInfo = {};
                    var demo;

                    if (player === self.state.engine.username) {
                        bet = self.state.engine.nextBetAmount;
                        extraBet = self.state.engine.nextExtraBetAmount;
                        rangeBetInfo.amount = self.state.engine.nextRangeBetAmount;
                        demo = self.state.engine.demo;
                    }

                    return {
                        username: player,
                        bet: bet,
                        extraBet: extraBet,
                        rangeBet: rangeBetInfo,
                        demo: demo
                    };
                });
            } else {
                _.forEach(game.playerInfo, function (player, username) {
                    if (self.state.engine.admin == true && player.demo == true)
                        ;
                    else if (player.stopped_at) {
                        if (player.rangeBet.length > 0) {
                            for (var i = 0; i < player.rangeBet.length; i++) {
                                var player_tmp = JSON.parse(JSON.stringify(player));
                                player_tmp.rangeBet = JSON.parse(JSON.stringify(player.rangeBet[i]));
                                usersWonCashed.push(JSON.parse(JSON.stringify(player_tmp)));
                            }
                        } else {
                            var player_tmp = player;
                            player_tmp.rangeBet = {};
                            usersWonCashed.push(JSON.parse(JSON.stringify(player_tmp)));
                        }
                    } else {
                        if (player.rangeBet.length > 0) {
                            for (var i = 0; i < player.rangeBet.length; i++) {
                                var player_tmp = JSON.parse(JSON.stringify(player));
                                player_tmp.rangeBet = JSON.parse(JSON.stringify(player.rangeBet[i]));
                                usersLostPlaying.push(JSON.parse(JSON.stringify(player_tmp)));
                            }
                        } else {
                            var player_tmp = player;
                            player_tmp.rangeBet = {};
                            usersLostPlaying.push(JSON.parse(JSON.stringify(player_tmp)));
                        }
                    }
                });

                usersWonCashed.sort(function (a, b) {
                    var r = b.stopped_at - a.stopped_at;
                    if (r !== 0) return r;
                    return a.username < b.username ? 1 : -1;
                });

                usersLostPlaying.sort(function (a, b) {
                    var r = b.bet - a.bet;
                    if (r !== 0) return r;
                    return a.username < b.username ? 1 : -1;
                });
            }

            /** Create the rows for the table **/

            // Users Playing and users cashed
            if (game.gameState === 'IN_PROGRESS' || game.gameState === 'STARTING') {
                var i, length;
                trUsersLostPlaying = [];
                for (i = 0, length = usersLostPlaying.length; i < length; i++) {
                    var user = usersLostPlaying[i];

                    var classes = CX({
                        'user-playing': true,
                        'me': self.state.engine.username === user.username
                    });

                    var styleLine = {};
                    if (i % 2) { styleLine = { color: '#ddd' }; } else { styleLine = { color: '#ddd', backgroundColor: '#6a6a6a' }; }

                    var bet = '?';
                    var extraBet = '?';
                    var rangeBet = '?';
                    var rangeBet_range = '?';
                    if (user.bet) {
                        bet = Clib.formatSatoshis(user.bet, 0);

                        if (user.extraBet) {
                            extraBet = Clib.formatSatoshis(user.extraBet, 0);
                        } else {
                            extraBet = '-';
                        }
                    }

                    if (user.rangeBet.amount) {
                        rangeBet = Clib.formatSatoshis(user.rangeBet.amount, 0);
                        rangeBet_range = generatingRangeString(user.rangeBet.range_from, user.rangeBet.range_to);
                        // bet = '-';
                        bet = rangeBet;
                        extraBet = '-';
                    } else {
                        rangeBet = '?';
                        rangeBet_range = '?';
                    }

                    if (!(self.state.engine.admin == true && self.state.engine.demos[user.username] == true)) {
                        trUsersLostPlaying.push(D.tr({ className: classes, key: 'user' + i, style: styleLine },
                            D.td(null,
                                D.img({ className: 'players-avatar', style: {float: 'left'}, src: '/img/photos/' + user.username + '.jpg?v=' + imgAppendStr }),
                                D.div({className: 'players-line-name', style: {float: 'left'}}, D.a({ className: 'players-name', style: {color: '#ddd'}, href: '/user/' + user.username, target: '_blank' }, user.username))
                            ),
                            D.td({className: 'players-line'}, D.span(null, '-')),
                            D.td({className: 'players-line'}, D.span(null, bet)),
                            // D.td({className: 'players-line'}, D.span(null, extraBet)),
                            // D.td({className: 'players-line'}, D.span(null, rangeBet)),
                            D.td({className: 'players-line'}, D.span(null, rangeBet_range)),
                            D.td({className: 'players-line'}, D.span(null, '?'))
                        ));
                    }
                }

                trUsersWonCashed = [];
                for (i = 0, length = usersWonCashed.length; i < length; i++) {
                    user = usersWonCashed[i];
                    var profit = calcProfit(user.bet, user.extraBet, user.rangeBet, user.stopped_at);

                    if (Engine.topPlayer.profit == null || Engine.topPlayer.profit < profit) {
                        Engine.topPlayer.profit = profit;
                        Engine.topPlayer.name = user.username;
                    }

                    classes = CX({
                        'user-cashed': true,
                        'me': self.state.engine.username === user.username
                    });

                    styleLine = {};
                    if (usersLostPlaying.length % 2) {
                        if (i % 2) {
                            styleLine = { color: '#00dc76', backgroundColor: '#6a6a6a' };
                        } else {
                            styleLine = { color: '#00dc76' };
                        }
                    } else {
                        if (i % 2) {
                            styleLine = { color: '#00dc76' };
                        } else {
                            styleLine = { color: '#00dc76', backgroundColor: '#6a6a6a' };
                        }
                    }

                    trUsersWonCashed.push(D.tr({ className: classes, key: 'user' + i, style: styleLine },
                        D.td(null,
                            D.img({ className: 'players-avatar', style: {float: 'left'}, src: '/img/photos/' + user.username + '.jpg?v=' + imgAppendStr }),
                            D.div({className: 'players-line-name', style: {float: 'left'}}, D.a({ className: 'players-name', style: {color: '#00dc76'}, href: '/user/' + user.username, target: '_blank' }, user.username))
                        ),
                        D.td({className: 'players-line'}, D.span(null, user.stopped_at / 100 + 'x')),
                        D.td({className: 'players-line'}, D.span(null, user.rangeBet.amount == 0 ? Clib.formatSatoshis(user.bet, 0) : Clib.formatSatoshis(user.rangeBet.amount, 0))),
                        // D.td({className: 'players-line'}, D.span(null, user.extraBet != 0 ? Clib.formatSatoshis(user.extraBet, 0) : '-')),
                        // D.td({className: 'players-line'}, D.span(null, user.rangeBet.amount != 0 ? Clib.formatSatoshis(user.rangeBet.amount, 0) : '-')),
                        D.td({className: 'players-line'}, D.span(null, user.rangeBet.amount != 0 ? generatingRangeString(user.rangeBet.range_from, user.rangeBet.range_to) : '-')),
                        D.td({className: 'players-line'}, D.span(null, Clib.formatSatoshis(profit)))
                    ));
                }

                tBody = D.tbody({ className: '' },
                    trUsersLostPlaying,
                    trUsersWonCashed
                );
            } else if (game.gameState === 'ENDED') { // Users Lost and users Won
                trUsersLostPlaying = usersLostPlaying.map(function (entry, i) {
                    var bet = entry.bet;
                    var extraBet = entry.extraBet;
                    var rangeBet = entry.rangeBet.amount;

                    var profit = -bet - extraBet - rangeBet;

                    if (Engine.topPlayer.profit == null || Engine.topPlayer.profit < profit) {
                        Engine.topPlayer.profit = profit;
                        Engine.topPlayer.name = entry.username;
                    }

                    var classes = CX({
                        'user-lost': true,
                        'me': self.state.engine.username === entry.username
                    });

                    var styleLine = {};
                    if (i % 2) {
                        styleLine = { color: '#f5533c' };
                    } else {
                        styleLine = { color: '#f5533c', backgroundColor: '#6a6a6a' };
                    }

                    // success : extra bet
                    if (entry.stopped_at === 0) {
                        if (i % 2) { styleLine = { color: '#00dc76', backgroundColor: '#6a6a6a' }; } else { styleLine = { color: '#00dc76' }; }

                        bet = entry.bet;
                        extraBet = entry.extraBet;
                        profit = extraBet * Engine.nExtraBetMultiplier;
                    } else if (entry.rangeBet.amount > 0) {
                        var crash_point = Engine.tableHistory[0].game_crash;
                        if (crash_point >= entry.rangeBet.range_from && crash_point <= entry.rangeBet.range_to) { profit = rangeBet * entry.rangeBet.range_multiplier; } else profit = -rangeBet;
                    }

                    if (Engine.topPlayer.profit == null || Engine.topPlayer.profit < profit) {
                        Engine.topPlayer.profit = profit;
                        Engine.topPlayer.name = entry.username;
                    }

                    return D.tr({ className: classes, key: 'user' + i, style: styleLine },
                        D.td(null,
                            D.img({ className: 'players-avatar', style: {float: 'left'}, src: '/img/photos/' + entry.username + '.jpg?v=' + imgAppendStr }),
                            D.div({className: 'players-line-name', style: {float: 'left'}}, D.a({ className: 'players-name', style: {color: '#f5533c'}, href: '/user/' + entry.username, target: '_blank' }, entry.username))
                        ),
                        D.td({className: 'players-line'}, D.span(null, '-')),
                        D.td({className: 'players-line'}, D.span(null, entry.rangeBet.amount === 0 ? Clib.formatSatoshis(entry.bet, 0) : Clib.formatSatoshis(entry.rangeBet.amount, 0))),
                        // D.td({className: 'players-line'}, D.span(null, entry.extraBet !== 0 ? Clib.formatSatoshis(entry.extraBet, 0) : '-')),
                        // D.td({className: 'players-line'}, D.span(null, entry.rangeBet.amount !== 0 ? Clib.formatSatoshis(entry.rangeBet.amount, 0) : '-')),
                        D.td({className: 'players-line'}, D.span(null, entry.rangeBet.amount !== 0 ? generatingRangeString(entry.rangeBet.range_from, entry.rangeBet.range_to) : '-')),
                        D.td({className: 'players-line'}, D.span(null, Clib.formatSatoshis(profit)))
                    );
                });

                trUsersWonCashed = usersWonCashed.map(function (entry, i) {
                    var bet = entry.bet;
                    var extraBet = entry.extraBet;
                    var rangeBet = entry.rangeBet.amount;
                    var rangeBet_range = generatingRangeString(entry.rangeBet.range_from, entry.rangeBet.range_to);
                    var stopped = entry.stopped_at;
                    var profit = calcProfit(bet, extraBet, entry.rangeBet, stopped);

                    if (Engine.topPlayer.profit == null || Engine.topPlayer.profit < profit) {
                        Engine.topPlayer.profit = profit;
                        Engine.topPlayer.name = entry.username;
                    }

                    var classes = CX({
                        'user-won': true,
                        'me': self.state.engine.username === entry.username
                    });

                    var styleLine = {};
                    if (usersLostPlaying.length % 2) {
                        if (i % 2) { styleLine = {color: '#00dc76', backgroundColor: '#6a6a6a'}; } else { styleLine = { color: '#00dc76'}; }
                    } else {
                        if (i % 2) { styleLine = {color: '#00dc76'}; } else { styleLine = {color: '#00dc76', backgroundColor: '#6a6a6a'}; }
                    }

                    return D.tr({ className: classes, key: 'user' + i, style: styleLine },
                        D.td(null,
                            D.img({ className: 'players-avatar', style: {float: 'left'}, src: '/img/photos/' + entry.username + '.jpg?v=' + imgAppendStr }),
                            D.div({className: 'players-line-name', style: {float: 'left'}}, D.a({ className: 'players-name', style: {color: '#00dc76'}, href: '/user/' + entry.username, target: '_blank' }, entry.username))
                        ),
                        D.td({className: 'players-line'}, D.span(null, stopped / 100, 'x')),
                        D.td({className: 'players-line'}, D.span(null, rangeBet === 0 ? Clib.formatSatoshis(bet, 0) : rangeBet)),
                        // D.td({className: 'players-line'}, D.span(null, extraBet !== 0 ? Clib.formatSatoshis(extraBet, 0) : '-')),
                        // D.td({className: 'players-line'}, D.span(null, rangeBet !== 0 ? rangeBet : '-')),
                        D.td({className: 'players-line'}, D.span(null, rangeBet !== 0 ? rangeBet_range : '-')),
                        D.td({className: 'players-line'}, D.span(null, Clib.formatSatoshis(profit)))
                    );
                });

                tBody = D.tbody({ className: '' },
                    trUsersLostPlaying,
                    trUsersWonCashed
                );
            }

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            return D.div({className: 'portlet box', style: {marginBottom: '0px'}},
                D.div({className: 'portlet-body'},
                    D.div({id: 'round_info', className: 'scroller', 'data-always-visible': 1, 'data-rail-visible': 1},
                        D.table({className: 'table table-hover'},
                            D.thead({style: {color: '#fefefe'}},
                                D.tr(null,
                                    D.th({width: '25%'}, languageFlag ? 'USER' : '用户'),
                                    D.th({width: '15%'}, '@'),
                                    D.th({width: '20%'}, languageFlag ? 'BET' : '投入算力'),
                                    // D.th(null, languageFlag ? 'EXTRA BET' : '额外投入算力'),
                                    // D.th(null, languageFlag ? 'RANGE BET' : '投入算力范围'),
                                    D.th({width: '20%'}, languageFlag ? 'RANGE BET' : '投入算力范围'),
                                    D.th({width: '20%'}, languageFlag ? 'PROFIT' : '获取算力')
                                )
                            ),
                            tBody
                        )
                    )
                )
            );
        }

    });
});
