define([
    'react',
    'game-logic/clib',
    'game-logic/stateLib',
    'lodash',
    'components/BetButton',
    'actions/ControlsActions',
    'stores/ControlsStore',
    'game-logic/engine'
], function (
    React,
    Clib,
    StateLib,
    _,
    BetButtonClass,
    ControlsActions,
    ControlsStore,
    Engine
) {
    var BetButton = React.createFactory(BetButtonClass);

    var D = React.DOM;
    var currentTime, currentGamePayout;

    function getState () {
        return {
            betSize: ControlsStore.getBetSize(), // Bet input string in bits 
            extraBetSize: ControlsStore.getExtraBetSize(), // Extra Bet input string in bits : "next game will stop on 0..."
            betInvalid: ControlsStore.getBetInvalid(), // false || string error message
            extraBetInvalid: ControlsStore.getExtraBetInvalid(), // false || string error message
            cashOut: ControlsStore.getCashOut(),
            cashOutInvalid: ControlsStore.getCashOutInvalid(), // false || string error message
            engine: Engine
        };
    }

    return React.createClass({
        displayName: 'Controls',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired,
            controlsSize: React.PropTypes.string.isRequired
        },

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            ControlsStore.addChangeListener(this._onChange);
            Engine.on({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,
                placing_bet: this._onChange,
                bet_placed: this._onChange,
                bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange,
                game_tick: this._onTick
            });

            setTimeout(function () {
                ControlsActions.setBetSize(Engine.nMinBetAmount);
            }, 800);
        },

        componentWillUnmount: function () {
            ControlsStore.removeChangeListener(this._onChange);
            Engine.off({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,
                placing_bet: this._onChange,
                bet_placed: this._onChange,
                bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange,
                game_tick: this._onTick
            });
        },

        _onTick: function () {
            var self = this;
            self.state = getState();
            currentTime = Clib.getElapsedTimeWithLag(self.state.engine);
            currentGamePayout = Clib.calcGamePayout(currentTime);
        },

        _onChange: function () {
            if (this.isMounted()) { this.setState(getState()); }
        },

        _placeBet: function () {
            var bet = StateLib.parseBet(this.state.betSize);
            var extraBet = StateLib.parseBet(this.state.extraBetSize);
            if (isNaN(extraBet)) extraBet = 0;
            var cashOut = StateLib.parseCashOut(this.state.cashOut);
            ControlsActions.placeBet(bet, extraBet, cashOut);
        },

        _finishRound: function () {
            ControlsActions.finishRound(currentTime, currentGamePayout);
        },

        _setNext0: function () {
            ControlsActions.setNext0();
        },

        _cancelBet: function () {
            ControlsActions.cancelBet();
        },

        _cashOut: function () {
            ControlsActions.cashOut();
        },

        _setBetSize: function (betSize) {
            ControlsActions.setBetSize(betSize);
        },

        _setExtraBetSize: function (extraBetSize) {
            ControlsActions.setExtraBetSize(extraBetSize);
        },

        _setAutoCashOut: function (autoCashOut) {
            ControlsActions.setAutoCashOut(autoCashOut);
        },

        _redirectToLogin: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;

            if ((typeof window.orientation !== 'undefined') || (navigator.userAgent.indexOf('IEMobile') !== -1)) { window.location = '/login/?clang=' + languageCode; } else window.location = '/?clang=' + languageCode;
        },

        _onDepositInMobileView: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;

            if (Engine.username === '' || Engine.username === undefined) {
                window.location = '/login/?clang=' + languageCode;
            } else {
                window.location = '/deposit/?clang=' + languageCode;
            }
        },

        render: function () {
            var self = this;
            self.state = getState();
            var isPlayingOrBetting = StateLib.isBetting(Engine) || (Engine.gameState === 'IN_PROGRESS' && StateLib.currentlyPlaying(Engine));

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            // If they're not logged in, let just show a login to play
            if (!Engine.username) {
                if (this.props.isMobileOrSmall) {
                    return D.div({className: 'tab-pane', id: 'tab_manual'},
                        D.div({className: 'row'},
                            D.div({className: 'col-md-3'}),
                            D.div({className: 'col-md-6 col-sm-12'},
                                // D.span({
                                //     style: {
                                //         position: 'absolute',
                                //         top: '0px',
                                //         left: '11px',
                                //         color: '#ec4149',
                                //         width: '30%'
                                //     },
                                //     onClick: this._onDepositInMobileView
                                // },
                                // D.i({className: 'fab fa-btc', style: {fontSize: '2.5em'}}),
                                // D.label({
                                //     style: {
                                //         fontSize: '17px',
                                //         marginLeft: '4px'
                                //     }
                                // }, (languageFlag ? 'Deposit' : ' 存入算力'))
                                //),
                                D.button({
                                    className: 'btn btn-circle-6 btn-circle-custom btn-danger custom-login-play-btn',
                                    onClick: this._redirectToLogin,
                                    style: {
                                        width: '100%',
                                        height: '80px',
                                        // marginTop: '65px',
                                        fontSize: '30px',
                                        // float: 'right',
                                        'WebkitBoxShadow': '0 0 6px 0px white',
                                        'MozBoxShadow': '0 0 6px 0px white',
                                        'boxShadow': '0 0 6px 0px white'
                                    }
                                }, languageFlag ? 'Login to play' : '登陆')
                            ),
                            D.div({className: 'col-md-3'})
                        )
                    );
                } else {
                    return D.div({className: 'tab-pane', id: 'tab_manual'},
                        D.div({className: 'row'},
                            D.div({className: 'col-md-3'}),
                            D.div({className: 'col-md-6'},
                                D.button({
                                    className: 'btn btn-circle-6 btn-circle-custom btn-danger custom-login-play-btn',
                                    onClick: this._redirectToLogin,
                                    style: {
                                        width: '100%',
                                        height: '80px',
                                        marginTop: '65px',
                                        fontSize: '30px',
                                        float: 'right',
                                        'WebkitBoxShadow': '0 0 6px 0px white',
                                        'MozBoxShadow': '0 0 6px 0px white',
                                        'boxShadow': '0 0 6px 0px white'
                                    }
                                }, languageFlag ? 'Login to play' : '登陆')
                            ),
                            D.div({className: 'col-md-3'})
                        )
                    );
                }
            }

            var hotkeyInfoDiv = D.div({className: 'row custom-hotkey-div', style: {marginTop: '20px', display: 'none'}},
                D.div({className: 'col-md-12', style: {textAlign: 'center'}},
                    D.span({style: {marginRight: '20px'}}, D.b(null, languageFlag ? 'Hotkey' : '热键')),
                    D.span({style: {marginRight: '20px'}}, languageFlag ? 'Bet(Space)' : '投入算力(Space)'),
                    D.span({style: {marginRight: '20px'}}, languageFlag ? 'Double bet(C)' : '加倍投入算力(C)'),
                    D.span({style: {marginRight: '20px'}}, languageFlag ? 'Halve bet(X)' : '下半单(X)')
                )
            );

            // For Admin Control Panel with Stop Button
            var isInProgressing = !(Engine.gameState === 'IN_PROGRESS');
            var adminControlDiv = D.div(null,
                D.hr({style: {margin: '0'}}),
                D.div({className: 'row'},
                    D.div({className: 'col-md-1'}),
                    D.div({className: 'col-md-4'},
                        D.button({ className: 'btn btn-circle-6 custom-stop-game btn-danger',
                            disabled: isInProgressing,
                            style: {width: '100%', height: '100%', fontSize: '30px', marginTop: '30px'},
                            onClick: this._finishRound}, languageFlag ? 'Stop' : '停'
                        )
                    ),
                    D.div({className: 'col-md-2'}),
                    D.div({className: 'col-md-4'},
                        D.button({ className: 'btn btn-circle-6 custom-stop-game btn-danger',
                            disabled: isInProgressing,
                            style: {width: '100%', height: '100%', fontSize: '30px', marginTop: '30px'},
                            onClick: this._setNext0}, languageFlag ? 'Next 0' : '下一轮 0'
                        )
                    ),
                    D.div({className: 'col-md-1'})
                )
            );

            var switchDiv = null;

            if (!this.props.isMobileOrSmall) {
                if (Engine.admin) {
                    switchDiv = adminControlDiv;
                    $("#bet_button_tabs .nav.nav-tabs").css('margin-top', '35px');
                } else {
                    switchDiv = D.div(null);
                }
            }

            // calc Total Player Info
            var nTotalPlayers = 0;
            var nTotalBets = 0;

            var nTotalPlayersReal = 0;
            var nTotalBetsReal = 0;
            var nTotalExtraBetsReal = 0;

            for (var user in Engine.playerInfo) {
                nTotalPlayers++;
                nTotalBets += parseInt(Engine.playerInfo[user].bet) / 100;
                nTotalBets += parseInt(Engine.playerInfo[user].extraBet) / 100;
                var nTotalRangeBet = 0;
                Engine.playerInfo[user].rangeBet.forEach(function(rangeInfo) {
                    nTotalRangeBet += rangeInfo.amount / 100;
                });
                nTotalBets += nTotalRangeBet;

                if (Engine.playerInfo[user].demo === false) {
                    nTotalPlayersReal++;
                    nTotalBetsReal += parseInt(Engine.playerInfo[user].bet) / 100;
                    nTotalBetsReal += parseInt(Engine.playerInfo[user].extraBet) / 100;

                    var nTotalRangeBetReal = 0;
                    Engine.playerInfo[user].rangeBet.forEach(function(rangeInfo) {
                        nTotalRangeBetReal += rangeInfo.amount / 100;
                    });
                    nTotalBetsReal += nTotalRangeBetReal;

                    nTotalExtraBetsReal += parseInt(Engine.playerInfo[user].extraBet) / 100;
                }
            }

            var nInComeBits = Engine.in_come_bets;

            var nPoolPercent = (Engine.fakepool * 100 / Engine.bankroll);
            var strPercent = nPoolPercent.toFixed(2);

            var fExtraProfit = Engine.nExtraBetMultiplier * self.state.extraBetSize;
            var nTotalExtraProfit = Engine.nExtraBetMultiplier * nTotalExtraBetsReal;

            var comment = null;
            if (this.props.isMobileOrSmall) {
                comment = null;
            } else {
                comment = D.table(
                    {style: {marginLeft: '35px'}},
                    D.tr(
                        null,
                        D.td({style: {paddingTop:'4x'}}, languageFlag ? 'Max Bet   ' + Engine.nMaxBetAmount + 'bits' : '最大投入算力量   ' + Engine.nMaxBetAmount + '点数')
                    ),
                    D.tr(
                        {style: {fontWeight: '300', color: '#ff474f'}},
                        D.td({style: {paddingTop:'3px'}}, languageFlag ? 'Max Extra Bet   ' + Engine.nMaxExtraBetAmount + ' bits' : '最大额外投入算力   ' + Engine.nMaxExtraBetAmount + ' 点数')
                    ),
                    D.tr(
                        {style: {fontWeight: '300', color: '#ff474f'}},
                        D.td({style: {paddingTop:'3px'}}, languageFlag ? 'Extra Bet Multiplier   ' + Engine.nExtraBetMultiplier + ' x' : '额外投入算力零值（当爆点达到零时，系统自动以' + Engine.nExtraBetMultiplier + ' x 倍率获取）')
                    ),
                    D.tr(
                        {style: {fontWeight: '300', color: '#ff474f'}},
                        D.td({style: {paddingTop:'3px'}}, languageFlag ? 'Your Extra Profit   ' + fExtraProfit + ' bits' : '额外投入算力获取算力   ' + fExtraProfit + ' 点数')
                    )
                );
            }

            var controlInputs = null;
            if (!this.props.isMobileOrSmall) {
                controlInputs = D.div({className: 'col-md-6 col-sm-6 col-xs-12'},
                    D.div({className: 'portlet-body form'},
                        D.form({action: '#', className: 'form-horizontal'},
                            D.div({className: 'form-body custom-form-body', style: {paddingBottom: '0px'}},
                                D.div({className: 'form-group custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-6 col-xs-6 control-label'}, languageFlag ? 'Bet' : '投入算力(需填写整数)'),
                                    D.div({className: 'col-md-6 col-xs-6'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                id: 'id_manual_bet',
                                                className: 'form-control',
                                                type: 'number',
                                                step: 1,
                                                min: 1,
                                                name: 'bet-size',
                                                value: self.state.betSize,
                                                disabled: isPlayingOrBetting,
                                                onChange: function (e) {
                                                    self._setBetSize(e.target.value);
                                                }
                                            })
                                        )
                                    )
                                ),
                                D.div({className: 'form-group custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({
                                        className: 'col-md-6 col-xs-6 control-label',
                                        style: {fontWeight: '300', color: '#ff474f'}
                                    }, languageFlag ? 'Extra Bet' : '额外投入算力零值'),
                                    D.div({className: 'col-md-6 col-xs-6'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'number',
                                                step: 1,
                                                min: 0,
                                                name: 'extra-bet-size',
                                                value: self.state.extraBetSize,
                                                disabled: isPlayingOrBetting,
                                                onChange: function (e) {
                                                    self._setExtraBetSize(e.target.value);
                                                }
                                            })
                                        )
                                    )
                                ),
                                D.div({className: 'form-group last custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-6 col-xs-6 control-label custom-manual-autocashout-label'}, languageFlag ? 'Auto Cash Out' : '自动获取算力资源倍数'),
                                    D.div({className: 'col-md-6 col-xs-6'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'number',
                                                step: 0.01,
                                                min: 1,
                                                value: self.state.cashOut,
                                                name: 'cash-out',
                                                disabled: isPlayingOrBetting,
                                                onChange: function (e) {
                                                    self._setAutoCashOut(e.target.value);
                                                }
                                            })
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    hotkeyInfoDiv
                );
            } else { // mobile
                controlInputs = D.div({className: 'col-md-6 col-xs-12'},
                    D.div({className: 'portlet-body form'},
                        D.form({action: '#', className: 'form-horizontal'},
                            D.div({className: 'form-body custom-form-body', style: {paddingBottom: '0px'}},
                                D.div({className: 'form-group custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-12 col-xs-12 control-label', style: {fontSize: '20px', textAlign: 'center'}}, languageFlag ? 'Normal Bet' : '正常投入算力')
                                ),
                                D.div({className: 'form-group custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-5 col-xs-5 control-label'}, languageFlag ? 'Bet' : '投入算力(需填写整数)'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'number',
                                                step: 1,
                                                min: 1,
                                                name: 'bet-size',
                                                value: self.state.betSize,
                                                disabled: isPlayingOrBetting,
                                                onChange: function (e) {
                                                    self._setBetSize(e.target.value);
                                                }
                                            })
                                        )
                                    )
                                ),
                                D.div({className: 'form-group last custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label'}, languageFlag ? 'Max Bet' : '最大投入算力量'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'text',
                                                value: Engine.nMaxBetAmount + (languageFlag ? 'bits' : '点数'),
                                                disabled: 'disabled',
                                                style: {background: 'none', border: 'none', cursor: 'default', paddingLeft: '0px'}
                                            })
                                        )
                                    )
                                ),

                                D.div({className: 'form-group last custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label'}, languageFlag ? 'Auto Cash Out' : '自动获取算力资源倍数'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'number',
                                                step: 0.01,
                                                min: 1,
                                                value: self.state.cashOut,
                                                name: 'cash-out',
                                                disabled: isPlayingOrBetting,
                                                onChange: function (e) {
                                                    self._setAutoCashOut(e.target.value);
                                                }
                                            })
                                        )
                                    )
                                ),

                                D.div({className: 'form-group custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({className: 'col-md-12 col-xs-12 control-label', style: {fontSize: '20px', textAlign: 'center', color: '#ff474f'}}, languageFlag ? 'Extra Bet' : '额外投入算力')
                                ),

                                D.div({className: 'form-group custom-form-group', style: {marginBottom: '5px'}},
                                    D.label({
                                        className: 'col-md-5 col-xs-5 control-label',
                                        style: {fontWeight: '300', color: '#ff474f'}
                                    }, languageFlag ? 'Extra Bet' : '额外投入算力零值'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'number',
                                                step: 1,
                                                min: 0,
                                                name: 'extra-bet-size',
                                                value: self.state.extraBetSize,
                                                disabled: isPlayingOrBetting,
                                                style: {color: '#ff474f', 'borderColor': '#ff474f'},
                                                onChange: function (e) {
                                                    self._setExtraBetSize(e.target.value);
                                                }
                                            })
                                        )
                                    )
                                ),
                                D.div({className: 'form-group last custom-form-group', style: {marginBottom: '4px', color: '#ff474f'}},
                                    D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label'}, languageFlag ? 'Max Extra Bet' : '最大额外投入算力'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'text',
                                                value: Engine.nMaxExtraBetAmount + (languageFlag ? 'bits' : '点数'),
                                                disabled: 'disabled',
                                                style: {background: 'none', border: 'none', cursor: 'default', color: '#ff474f', paddingLeft: '0px'}
                                            })
                                        )
                                    )
                                ),
                                D.div({className: 'form-group last custom-form-group', style: {marginBottom: '4px', color: '#ff474f', paddingLeft: '0px'}},
                                    D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label', style: {'fontSize': '12.2px'}}, languageFlag ? 'Extra Bet Multiplier' : '额外投入算力零值（当爆点达零时，系统自动以50x倍率获取）'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'text',
                                                value: Engine.nExtraBetMultiplier + ' x',
                                                disabled: 'disabled',
                                                style: {background: 'none', border: 'none', cursor: 'default', color: '#ff474f', paddingLeft: '0px'}
                                            })
                                        )
                                    )
                                ),
                                D.div({className: 'form-group last custom-form-group', style: {marginBottom: '4px', color: '#ff474f'}},
                                    D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label'}, languageFlag ? 'Your Extra Profit' : '额外投入算力获取算力'),
                                    D.div({className: 'col-md-7 col-xs-7'},
                                        D.div({className: 'input-group'},
                                            D.input({
                                                className: 'form-control',
                                                type: 'text',
                                                value: fExtraProfit + (languageFlag ? 'bits' : '点数'),
                                                disabled: 'disabled',
                                                style: {background: 'none', border: 'none', cursor: 'default', color: '#ff474f', paddingLeft: '0px'}
                                            })
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    hotkeyInfoDiv
                );
            }

            var objBetBox = null;
            if (this.props.isMobileOrSmall) {
                objBetBox = D.div({ className: 'row' },
                    controlInputs,
                    D.div({className: 'col-md-5 col-sm-6 col-xs-12'},
                        D.div({ className: 'row button-container' },
                            BetButton({
                                engine: this.state.engine,
                                placeBet: this._placeBet,
                                cancelBet: this._cancelBet,
                                cashOut: this._cashOut,
                                isMobileOrSmall: this.props.isMobileOrSmall,
                                betSize: this.state.betSize.toString(),
                                extraBetSize: this.state.extraBetSize.toString(),
                                betInvalid: this.state.betInvalid,
                                extraBetInvalid: this.state.extraBetInvalid,
                                cashOutInvalid: this.state.cashOutInvalid,
                                controlsSize: this.props.controlsSize,
                                autoRangeBet: this.state.engine.autoRangeBet,
                                username: this.state.engine.username

                            }),
                            comment
                        )
                    ),
                    D.div({className: 'col-md-6 col-sm-6 col-xs-12'},
                        D.div({className: 'portlet-body form'},
                            D.form({action: '#', className: 'form-horizontal'},
                                D.div({className: 'form-body custom-form-body', style: {paddingBottom: '0px'}},
                                    D.div({className: 'form-group last custom-form-group', style: {marginBottom: '40px'}},
                                        D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label',
                                            style: {paddingLeft: '0px', paddingRight: '10px', textAlign:'right'}
                                        }, (languageFlag ? 'Total Players' : '玩家总数') + ' : ' + nTotalPlayers),
                                        D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label',
                                            style: {paddingLeft: '10px', paddingRight: '0px', textAlign:'left'}
                                        }, (languageFlag ? 'Total Bet' : '总投入算力量') + ' : ' + nTotalBets + ' ' + (languageFlag ? 'bits' : '点数'))
                                    )
                                )
                            )
                        )
                    )
                );
            } else {
                objBetBox = D.div({ className: 'row' },
                    controlInputs,
                    D.div({className: 'col-md-5 col-sm-6 col-xs-12'},
                        D.div({ className: 'row button-container' },
                            BetButton({
                                engine: this.state.engine,
                                placeBet: this._placeBet,
                                cancelBet: this._cancelBet,
                                cashOut: this._cashOut,
                                isMobileOrSmall: this.props.isMobileOrSmall,
                                betSize: this.state.betSize.toString(),
                                extraBetSize: this.state.extraBetSize.toString(),
                                betInvalid: this.state.betInvalid,
                                extraBetInvalid: this.state.extraBetInvalid,
                                cashOutInvalid: this.state.cashOutInvalid,
                                controlsSize: this.props.controlsSize,
                                autoRangeBet: this.state.engine.autoRangeBet,
                                username: this.state.engine.username
                            }),
                            comment
                        )
                    )
                );
            }

            var objTotalInfo =
                D.div({ className: 'row', style: {fontSize: '16px'} },
                    D.div({ className: 'row' },
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({className: 'pull-right'}, languageFlag ? 'Gaming Pool' : '算力资源池')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, Engine.bankroll),
                            D.span({style: {marginLeft: '3px'}}, languageFlag ? 'bits' : '点数')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({className: 'pull-right'}, languageFlag ? 'Fake Pool' : '虚拟资金池')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, Engine.fakepool),
                            D.span({style: {marginLeft: '3px'}}, (languageFlag ? 'bits' : '点数') + ' (' + strPercent + '%)')
                        )
                    ),
                    D.div({ className: 'row' },
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({className: 'pull-right'}, languageFlag ? 'Total Bet' : '总投入算力量')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, nTotalBetsReal),
                            D.span({style: {marginLeft: '3px'}}, languageFlag ? 'bits' : '点数'),
                            D.span({style: {marginRight: '3px'}}, '   ('),
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, nInComeBits),
                            D.span({style: {marginLeft: '3px'}}, languageFlag ? 'bits' : '点数'),
                            D.span({style: {marginLeft: '3px'}}, ')')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({className: 'pull-right'}, languageFlag ? 'Total Players' : '玩家总数')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, nTotalPlayersReal)
                        )
                    ),
                    D.div({ className: 'row' },
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({className: 'pull-right'}, languageFlag ? 'Total Extra Bet' : '额外投入算力额 ')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, nTotalExtraBetsReal),
                            D.span({style: {marginLeft: '3px'}}, languageFlag ? 'bits' : '点数')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({className: 'pull-right'}, languageFlag ? 'Expected Extra Profit' : '额外预期总赔数')
                        ),
                        D.div({className: 'col-md-3 col-xs-2'},
                            D.span({style: {fontSize: '20px', color: '#ff0000'}}, nTotalExtraProfit),
                            D.span({style: {marginLeft: '3px'}}, languageFlag ? 'bits' : '点数')
                        )
                    )
                );

            var topDiv = null;
            // if(!this.props.isMobileOrSmall) {
            if (Engine.admin) {
                if (!this.props.isMobileOrSmall) { topDiv = objTotalInfo; }
            } else if (Engine.staff) {
                topDiv = D.div({style: {backgroundColor: '0 0', height: '100%'}},
                    D.div({style: {textAlign: 'center', fontSize: '30px', marginTop: '50px'}}, languageFlag ? 'Yor are not allowed to play game.' : '你不可能开始这个项目。')
                );
            } else {
                topDiv = objBetBox;
            }
            // }
            // If the user is logged in render the controls
            var className = 'tab-pane';
            if(Engine.admin)
                className += ' active';
            return D.div({className: className, id: 'tab_manual', style: {marginBottom: '3px', height: '100%'}},
                topDiv,
                switchDiv
            );
        }
    });
});
