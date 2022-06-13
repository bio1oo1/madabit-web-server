define([
    'react',
    'game-logic/clib',
    'game-logic/engine'
], function (
    React,
    Clib,
    Engine
) {
    /** Constants **/
    var MAX_GAMES_SHOWED = 50;

    var D = React.DOM;

    function getState () {
        return {
            engine: Engine
        };
    }

    return React.createClass({
        displayName: 'gamesLog',

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            Engine.on({
                game_crash: this._onChange
            });
        },

        componentWillUnmount: function () {
            Engine.off({
                game_crash: this._onChange
            });
        },

        _onChange: function () {
            // Check if its mounted because when Game view receives the disconnect event from EngineVirtualStore unmounts all views
            // and the views unregister their events before the event dispatcher dispatch them with the disconnect event
            if (this.isMounted()) { this.setState(getState()); }
        },

        render: function () {
            var self = this;
            var rows = self.state.engine.tableHistory.slice(0, MAX_GAMES_SHOWED).map(function (game, nIdRow) {
                var cashed_at, bet, extraBet, rangeBet, profit;
                var player = game.player_info[self.state.engine.username];

                if (player) {
                    bet = player.bet;
                    extraBet = player.extraBet;
                    rangeBet = player.rangeBet;
                    if (rangeBet == null) rangeBet = 0;

                    profit = 0;

                    if (game.game_crash == 0) {
                        if (extraBet > 0) { // extraBet success
                            profit = extraBet * Engine.nExtraBetMultiplier;
                            cashed_at = '0';
                            extraBet = Clib.formatSatoshis(extraBet);
                        } else {
                            profit = -bet;
                            cashed_at = 'Busted';
                            extraBet = '-';
                        }
                        bet = Clib.formatSatoshis(bet);
                        rangeBet = '-';
                    } else if (rangeBet.length > 0 && rangeBet[0].amount != 0) { // rangeBet
                        var succeedIndex = -1;
                        var rangeBetAmount = 0;
                        for (var i = 0; i < rangeBet.length; i++) {
                            if (game.game_crash >= rangeBet[i].range_from && game.game_crash <= rangeBet[i].range_to) { // rangeBet success
                                profit += rangeBet[i].amount * rangeBet[i].range_multiplier;
                                profit -= rangeBet[i].amount;
                                succeedIndex = i;
                            } else profit = profit - rangeBet[i].amount;
                            rangeBetAmount += rangeBet[i].amount;
                        }
                        rangeBet = Clib.formatSatoshis(rangeBetAmount);
                        cashed_at = '-';
                        bet = '-';
                        extraBet = '-';
                    } else {
                        if (player.stopped_at) {
                            profit = ((player.stopped_at - 100) * bet) / 100 - extraBet;
                            cashed_at = Clib.formatSatoshis(player.stopped_at);
                        } else {
                            cashed_at = 'Busted';
                            profit -= (bet + extraBet);
                            for (var i = 0; i < rangeBet.length; i++) { profit -= rangeBet[i].amount; }
                        }

                        if (extraBet == 0) {
                            extraBet = '-';
                        } else {
                            extraBet = Clib.formatSatoshis(extraBet);
                        }
                        bet = Clib.formatSatoshis(bet);
                        rangeBet = '-';
                    }

                    profit = Clib.formatSatoshis(profit);

                    // sound lost / win - effect audio
                    if (nIdRow === 0 && self.state.engine.gameState === 'ENDED') {
                        if (profit > 0 && enableEtc === true) {
                            new Audio('/sounds/winmoney.mp3').play();
                        } else if (profit < 0 && enableEtc === true) {
                            new Audio('/sounds/lostmoney.mp3').play();
                        }
                    }

                    // If we didn't play
                } else {
                    cashed_at = '-';
                    bet = '-';
                    extraBet = '-';
                    rangeBet = '-';
                    profit = '-';
                }

                var className;
                if (game.game_crash >= 198) {
                    className = 'games-log-goodcrash';
                } else if (game.game_crash <= 197) { className = 'games-log-badcrash'; } else { className = ''; }

                var styleLine = {color: '#ddd'};

                var strShortHash = game.hash.substring(0, 20);
                var tbody_tr = null;

                if (Engine.show_hash == 'show_hash') {
                    tbody_tr = D.tr({style: styleLine, className: 'class_gameLogTableTr'},
                        D.td(null,
                            D.a({href: '/game/' + game.game_id, target: '_blank', className: className},
                                Clib.formatSatoshis(game.game_crash), D.i(null, 'x'))
                        ),
                        D.td({className: className}, cashed_at),
                        D.td({className: className}, bet),
                        // D.td({className: className}, extraBet),
                        D.td({className: className}, rangeBet),
                        D.td({className: className}, profit),
                        D.td(null,
                            D.div({ className: 'hash-copy-cont',
                                style: {float: 'left', marginRight: '5px'},
                                'data-clipboard-text': '' + game.hash
                            },
                            D.label({className: 'games-log-hash'}, strShortHash)
                            )
                        )
                    );
                } else {
                    tbody_tr = D.tr({style: styleLine, className: 'class_gameLogTableTr'},
                        D.td(null,
                            D.a({href: '/game/' + game.game_id, target: '_blank', className: className},
                                Clib.formatSatoshis(game.game_crash), D.i(null, 'x'))
                        ),
                        D.td({className: className}, cashed_at),
                        D.td({className: className}, bet),
                        // D.td({className: className}, extraBet),
                        D.td({className: className}, rangeBet),
                        D.td({className: className}, profit)
                    );
                }
                return tbody_tr;
            });

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode == 'en');

            var thead = null;
            if (Engine.show_hash == 'show_hash') {
                thead = D.thead(null,
                    D.tr({style: {'color': '#efefef'}},
                        D.th({width: '20%'}, languageFlag ? 'CRASH' : '停止在'),
                        D.th({width: '10%'}, '@'),
                        D.th({width: '17%'}, languageFlag ? 'BET' : '投入算力'),
                        // D.th(null, languageFlag ? 'EXTRA BET' : '额外投入算力'),
                        D.th({width: '18%'}, languageFlag ? 'RANGE BET' : '投入算力范围'),
                        D.th({width: '15%'}, languageFlag ? 'PROFIT' : '获取算力'),
                        D.th({width: '20%'}, languageFlag ? 'HASH' : '哈希')
                    )
                );
            } else {
                thead = D.thead(null,
                    D.tr({style: {'color': '#efefef'}},
                        D.th({width: '20%'}, languageFlag ? 'CRASH' : '停止在'),
                        D.th({width: '20%'}, '@'),
                        D.th({width: '20%'}, languageFlag ? 'BET' : '投入算力'),
                        // D.th(null, languageFlag ? 'EXTRA BET' : '额外投入算力'),
                        D.th({width: '20%'}, languageFlag ? 'RANGE BET' : '投入算力范围'),
                        D.th({width: '20%'}, languageFlag ? 'PROFIT' : '获取算力')
                    )
                );
            }

            return D.div({className: 'portlet box', style: {marginBottom: '0px'}},
                D.div({className: 'portlet-body'},
                    D.div(
                        {
                            id: 'id_divGamesLog',
                            className: 'scroller',
                            style: {'height': '400px'},
                            'data-always-visible': '1',
                            'data-rail-visible': '1'
                        },
                        D.table({className: 'table table-hover', id: 'id_tableHistory'},
                            thead,
                            D.tbody(null,
                                rows
                            )
                        )
                    )
                )
            );
        }
    });
});
