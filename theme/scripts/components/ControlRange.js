define([
    'react',
    'game-logic/clib',
    'game-logic/stateLib',
    'lodash',
    'components/BetButton',
    'components/RangeBetButton',
    'actions/ControlsActions',
    'stores/ControlsStore',
    'game-logic/engine'
], function (
    React,
    Clib,
    StateLib,
    _,
    BetButtonClass,
    RangeBetButtonClass,
    ControlsActions,
    ControlsStore,
    Engine
) {
    // var BetButton = React.createFactory(BetButtonClass);
    var RangeBetButton = React.createFactory(RangeBetButtonClass);

    var D = React.DOM;
    var currentTime, currentGamePayout;

    function getState () {
        return {
            // betSize: ControlsStore.getBetSize(), // Bet input string in bits
            // extraBetSize: ControlsStore.getExtraBetSize(), // Extra Bet input string in bits : "next game will stop on 0..."
            rangeBetSize: ControlsStore.getRangeBetSize(), // Extra Bet input string in bits : "next game will stop on 0..."
            rangeBetID: ControlsStore.getRangeBetID(), // Extra Bet input string in bits : "next game will stop on 0..."
            betInvalid: ControlsStore.getBetInvalid(), // false || string error message
            // extraBetInvalid: ControlsStore.getExtraBetInvalid(), // false || string error message
            rangeBetInvalid: ControlsStore.getRangeBetInvalid(), // false || string error message
            // cashOut: ControlsStore.getCashOut(),
            // cashOutInvalid: ControlsStore.getCashOutInvalid(), // false || string error message
            engine: Engine
        };
    }

    return React.createClass({
        displayName: 'ControlRange',

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
                range_bet_placed: this._onChange,
                range_bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_range_bet: this._onChange,
                game_tick: this._onTick,
                set_auto_range_bet: this._onChange
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
                range_bet_placed: this._onChange,
                range_bet_queued: this._onChange,
                cashing_out: this._onChange,
                cancel_range_bet: this._onChange,
                game_tick: this._onTick,
                set_auto_range_bet: this._onChange
            });
        },

        _onTick: function () {
            var self = this;
            self.state = getState();
        },

        _onChange: function () {
            if (this.isMounted()) { this.setState(getState()); }
        },

        _placeRangeBet: function () {
            // var bet = StateLib.parseBet(this.state.betSize);
            // var extraBet = StateLib.parseBet(this.state.extraBetSize);
            //var rangeBet = StateLib.parseRangeBet(this.state.rangeBetSize);
            var rangeBetSize = JSON.parse(JSON.stringify(this.state.rangeBetSize));
            var rangeBetID = JSON.parse(JSON.stringify(this.state.rangeBetID));

            Object.keys(rangeBetSize).forEach(function(rangeID) {
                if (isNaN(rangeBetSize[rangeID]))
                    rangeBetSize[rangeID] = 0;
                rangeBetSize[rangeID] = rangeBetSize[rangeID] * 100;

                if(rangeBetID[rangeID] != undefined || rangeBetID[rangeID] != null)
                    rangeBetID[rangeID] = rangeBetSize[rangeID];
            });

            if(Object.keys(rangeBetID).length == 0)
                return;
            ControlsActions.placeRangeBet(rangeBetID);
        },

        _setAutoRangeBet: function(autoRangeBet) {
            var rangeBetID = null;
            if(autoRangeBet == 'true' || autoRangeBet == true) {
                var rangeBetSize = JSON.parse(JSON.stringify(this.state.rangeBetSize));
                rangeBetID = JSON.parse(JSON.stringify(this.state.rangeBetID));

                Object.keys(rangeBetSize).forEach(function (rangeID) {
                    if (isNaN(rangeBetSize[rangeID]))
                        rangeBetSize[rangeID] = 0;
                    rangeBetSize[rangeID] = rangeBetSize[rangeID] * 100;

                    if (rangeBetID[rangeID] != undefined || rangeBetID[rangeID] != null)
                        rangeBetID[rangeID] = rangeBetSize[rangeID];
                });

                if(Object.keys(rangeBetID).length == 0)
                    return;
            }
            ControlsActions.setAutoRangeBet(autoRangeBet, rangeBetID);
        },

        _setNext0: function () {
            ControlsActions.setNext0();
        },

        _cancelRangeBet: function () {
            console.log('cancel range bet');
            ControlsActions.cancelRangeBet();
        },

        _cashOut: function () {
            ControlsActions.cashOut();
        },

        _setRangeBetSize: function (rangeBetSize, rangeBetID) {
            ControlsActions.setRangeBetSize(rangeBetSize, rangeBetID);
        },

        _setRangeBetID: function (rangeBetID) {
            ControlsActions.setRangeBetID(rangeBetID);
        },

        _unsetRangeBetID: function (rangeBetID) {
            ControlsActions.unsetRangeBetID(rangeBetID);
        },

        _redirectToLogin: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;

            if ((typeof window.orientation !== 'undefined') || (navigator.userAgent.indexOf('IEMobile') !== -1)) { window.location = '/login/?clang=' + languageCode; } else window.location = '/?clang=' + languageCode;
        },
        render: function () {
            var self = this;
            self.state = getState();
            var isPlayingOrBetting = StateLib.isBetting(Engine) || (Engine.gameState === 'IN_PROGRESS' && StateLib.currentlyPlaying(Engine));

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            // For Admin Control Panel with Stop Button

            var rangeInfoElements_left = [];
            var rangeInfoElements_right = [];
            // var rangeInfo = Engine.rangeInfo.map(function(range, i) {
            //     return range;
            // });
            var window_height = $(window).height();
            var lineBlockMarginTop = (window_height/2 - 100) / 8 - 27;
            if($(window).width() < 992)
                lineBlockMarginTop = 10;

            var rangeInfo = JSON.parse(JSON.stringify(Engine.rangeInfo));
            rangeInfo.forEach(function (range, index) {
                var id = range.id;
                var from;
                var to;
                if (range.range_from == range.range_to)
                    from = range.range_from / 100;
                //else from = (range.range_from-1)/100;
                else from = (range.range_from)/100;

                if(range.range_to == -1) {
                    from = from + ' ~ ';
                    to = '';
                } else if (range.range_from == range.range_to) {
                    to = '';
                } else {
                    to = ' ~ ' + range.range_to/100;
                }

                var element = D.div({key:'check_div_'+id, className: 'md-checkbox custom-md-radio row', style:{margin:lineBlockMarginTop + 'px 3px'}},
                    D.div({className:'col-md-5 col-sm-4 col-xs-5', style:{paddingLeft:'5px', paddingRight:'5px'}},
                        D.input({
                            type: 'checkbox',
                            id: 'checkbox_range_' + range.id,
                            name: 'checkbox_range',
                            className: 'md-check',
                            value: range.id,
                            onChange: function (e) {
                                var ischecked= $("#checkbox_range_" + e.target.value).is(':checked');
                                if(!ischecked)
                                    self._unsetRangeBetID(e.target.value);
                                else
                                    self._setRangeBetID(e.target.value);
                            }
                        }),
                        D.label({htmlFor: 'checkbox_range_' + range.id},
                            D.span(null),
                            D.span({className: 'check'}),
                            D.span({className: 'check addon'}),
                            D.span({className: 'box'}),
                            D.span({style:{marginTop:'-5px', marginLeft:'25px', fontSize:'12px'}}, from + to),
                            D.span({style:{marginTop:'-5px', marginLeft:'92px', fontSize:'12px'}}, self.props.isMobileOrSmall ? '(x' + range.range_multiplier + ')' : '( x' + range.range_multiplier + ' )')
                        )
                    ),
                    D.div({className:'col-md-3 col-sm-4 col-xs-3', style:{paddingLeft:'5px', paddingRight:'5px'}},
                        D.input({
                            key: 'key_inputRangeBetAmount_' + range.id,
                            className: 'class_inputRangeBetAmount',
                            id: 'id_inputRangeBetAmount_' + range.id,
                            style: {width: '100%'},
                            type: 'number',
                            step: 1,
                            min: 1,
                            name: 'bet-size',
                            value: self.state.rangeBetSize[range.id],
                            disabled: isPlayingOrBetting,
                            onChange: function (e) {
                                var splitArray = e.target.id.split('_');
                                self._setRangeBetSize(e.target.value, splitArray[splitArray.length-1]);
                            }
                        }, null)
                    ),
                    D.div({className:'col-md-4 col-sm-4 col-xs-4', style:{paddingLeft:'5px', paddingRight:'5px'}},
                        D.button({
                                className: 'class_spanRangeBetAmountControl_minus',
                                id :'id_spanRangeBetAmountControl_minus_' + range.id,
                                onClick: function (e) {
                                    var splitArray = e.target.id.split("_");
                                    var index = '#id_inputRangeBetAmount_' + splitArray[splitArray.length-1];
                                    var currentRangeBetSize = $(index).val();
                                    if(currentRangeBetSize == undefined || currentRangeBetSize == "")
                                        currentRangeBetSize = 0;
                                    var newRangeBetSize = parseInt(currentRangeBetSize) - 100;
                                    if(newRangeBetSize < 0)
                                        newRangeBetSize = 0;
                                    $(index).val(newRangeBetSize);
                                    self._setRangeBetSize(newRangeBetSize, splitArray[splitArray.length-1]);
                                }
                            }, '-'
                        ),
                        D.button({className: 'class_inputRangeBetFixedAmount', 'disabled':'disabled'}, '100'),
                        D.button({
                                className: 'class_spanRangeBetAmountControl_plus',
                                id :'id_spanRangeBetAmountControl_plus_' + range.id,
                                onClick: function (e) {
                                    var splitArray = e.target.id.split("_");
                                    var index = '#id_inputRangeBetAmount_' + splitArray[splitArray.length-1];
                                    var currentRangeBetSize = $(index).val();
                                    if(currentRangeBetSize == undefined || currentRangeBetSize == '')
                                        currentRangeBetSize = 0;
                                    var newRangeBetSize = parseInt(currentRangeBetSize) + 100;
                                    $(index).val(newRangeBetSize);
                                    self._setRangeBetSize(newRangeBetSize, splitArray[splitArray.length-1]);
                                },
                            }, '+'
                        )
                    )
                );

                // var element = D.label(null,
                //         D.input({className: 'icheck', type:'checkbox'}, "Checkbox")
                //     );

                if(self.state.rangeBetID[id] != undefined)
                    element = D.div({key:'check_div_'+id,className: 'md-checkbox custom-md-radio row', style:{margin:lineBlockMarginTop + 'px 3px'}},
                        D.div({className:'col-md-5 col-sm-4 col-xs-5', style:{paddingLeft:'5px', paddingRight:'5px'}},
                            D.input({
                                type: 'checkbox',
                                id: 'checkbox_range_' + range.id,
                                name: 'checkbox_range',
                                className: 'md-check',
                                value: range.id,
                                checked: 'checked',
                                onChange: function (e) {
                                    var ischecked= $("#checkbox_range_" + e.target.value).is(':checked');
                                    if(!ischecked)
                                        self._unsetRangeBetID(e.target.value);
                                    else
                                        self._setRangeBetID(e.target.value);
                                }
                            }),
                            D.label({htmlFor: 'checkbox_range_' + range.id},
                                D.span(null),
                                D.span({className: 'check'}),
                                D.span({className: 'check addon'}),
                                // D.span({
                                //     className: 'check', style: {
                                //         width: '11.5px',
                                //         height: '11.5px',
                                //         border: '3px solid #5a5a5a',
                                //         top: '6.5px',
                                //         left: '5px'
                                //     }
                                // }),
                                D.span({className: 'box'}),
                                D.span({style:{marginTop:'-5px', marginLeft:'25px', fontSize:'12px'}}, from + to),
                                D.span({style:{marginTop:'-5px', marginLeft:'92px', fontSize:'12px'}}, self.props.isMobileOrSmall ? '(x' + range.range_multiplier + ')' : '( x' + range.range_multiplier + ' )')
                            )
                        ),
                        D.div({className:'col-md-3 col-sm-4 col-xs-3', style:{paddingLeft:'5px', paddingRight:'5px'}},
                            D.input({
                                key: 'key_inputRangeBetAmount_' + range.id,
                                className: 'class_inputRangeBetAmount',
                                id: 'id_inputRangeBetAmount_' + range.id,
                                style: {width: '100%'},
                                type: 'number',
                                step: 1,
                                min: 1,
                                name: 'bet-size',
                                value: self.state.rangeBetSize[range.id],
                                disabled: isPlayingOrBetting,
                                onChange: function (e) {
                                    var splitArray = e.target.id.split('_');

                                    self._setRangeBetSize(e.target.value, splitArray[splitArray.length-1]);
                                }
                            }, null)
                        ),
                        D.div({className:'col-md-4 col-sm-4 col-xs-4', style:{paddingLeft:'5px', paddingRight:'5px'}},
                            D.button({
                                    className: 'class_spanRangeBetAmountControl_minus',
                                    id :'id_spanRangeBetAmountControl_minus_' + range.id,
                                    onClick: function (e) {
                                        var splitArray = e.target.id.split("_");
                                        var index = '#id_inputRangeBetAmount_' + splitArray[splitArray.length-1];
                                        var currentRangeBetSize = $(index).val();
                                        if(currentRangeBetSize == undefined || currentRangeBetSize == "")
                                            currentRangeBetSize = 0;
                                        var newRangeBetSize = parseInt(currentRangeBetSize) - 100;
                                        if(newRangeBetSize < 0)
                                            newRangeBetSize = 0;
                                        $(index).val(newRangeBetSize);
                                        self._setRangeBetSize(newRangeBetSize, splitArray[splitArray.length-1]);
                                    }
                                }, '-'
                            ),
                            D.button({className: 'class_inputRangeBetFixedAmount', 'disabled':'disabled'}, '100'),
                            D.button({
                                    className: 'class_spanRangeBetAmountControl_plus',
                                    id :'id_spanRangeBetAmountControl_plus_' + range.id,
                                    onClick: function (e) {
                                        var splitArray = e.target.id.split("_");
                                        var index = '#id_inputRangeBetAmount_' + splitArray[splitArray.length-1];
                                        var currentRangeBetSize = $(index).val();
                                        if(currentRangeBetSize == undefined || currentRangeBetSize == '')
                                            currentRangeBetSize = 0;
                                        var newRangeBetSize = parseInt(currentRangeBetSize) + 100;
                                        $(index).val(newRangeBetSize);
                                        self._setRangeBetSize(newRangeBetSize, splitArray[splitArray.length-1]);
                                    },
                                }, '+'
                            )
                        )
                    );

                if(index < Engine.rangeInfo.length / 2) {
                    rangeInfoElements_left.push(element);
                } else {
                    rangeInfoElements_right.push(element);
                }
            });

            var setAllButtonElement = null;
            var allTrueFlag = true;
            var allFalseFlag = true;
            for(var i = 0; i < Engine.rangeInfo.length; i++) {
                var index = "#checkbox_range_" + rangeInfo[i].id;
                if($(index).prop('checked') == false)
                    allTrueFlag = false;
                if($(index).prop('checked') == true)
                    allFalseFlag = false;
            }

            if(allTrueFlag == true || allFalseFlag == true) {
                setAllButtonElement = D.button({id: 'id_inputSelectAll',
                    onClick: function(e) {
                        var rangeInfo = Engine.rangeInfo;

                        if(allTrueFlag == true || allFalseFlag == true) {
                            for (var i = 0; i < rangeInfo.length; i++) {
                                var index = "#checkbox_range_" + rangeInfo[i].id;
                                $(index).next().click();
                            }
                        } else {
                            for (var i = 0; i < rangeInfo.length; i++) {
                                var index = "#checkbox_range_" + rangeInfo[i].id;
                                if($(index).prop('checked') == false)
                                    $(index).next().click();
                            }
                        }
                    }
                }, (allFalseFlag == true) ? (languageFlag ? 'Select All' : '一键全投') : (languageFlag ? 'Deselect all' : '全部取消'));
            } else {
                setAllButtonElement = D.button({id: 'id_inputSelectAll',
                    onClick: function(e) {
                        var rangeInfo = Engine.rangeInfo;
                        for (var i = 0; i < rangeInfo.length; i++) {
                            var index = "#checkbox_range_" + rangeInfo[i].id;
                            if($(index).prop('checked') == false)
                                $(index).next().click();
                        }
                    }
                }, languageFlag ? 'Select All' : '一键全投');
            }

            var setAllRangeBetAmountElement = D.div({id:'id_divSetAllRangeBetAmount', className: 'md-checkbox custom-md-radio row', style:{margin: lineBlockMarginTop + 'px 3px'}},
                D.div({className:'col-md-5 col-sm-4 col-xs-5', style:{
                            paddingLeft: '0px',
                            paddingRight: '5px'
                        }
                    },
                    setAllButtonElement
                ),
                D.div({className:'col-md-3 col-sm-4 col-xs-3', style:{paddingLeft:'5px', paddingRight:'5px'}},
                    D.input({className:'class_inputRangeBetAmount',
                        id: 'id_inputRangeBetAmount_all',
                        style:{width:'100%'},
                        type: 'number',
                        step: 1,
                        min: 1,
                        value: self.state.rangeBetSize['all'],
                        onChange: function (e) {
                            self._setRangeBetSize(e.target.value, 'all');
                        }
                    }, null)
                ),
                D.div({className:'col-md-4 col-sm-4 col-xs-4', style:{paddingLeft:'5px', paddingRight:'5px'}},
                    D.button({
                            className: 'class_spanRangeBetAmountControl_minus',
                            id :'id_spanRangeBetAmountControl_minus_all',
                            onClick: function (e) {
                                var index = '#id_inputRangeBetAmount_all';
                                var currentRangeBetSize = $(index).val();
                                if(currentRangeBetSize == undefined || currentRangeBetSize == "")
                                    currentRangeBetSize = 0;
                                var newRangeBetSize = parseInt(currentRangeBetSize) - 100;
                                if(newRangeBetSize < 0)
                                    newRangeBetSize = 0;
                                $(index).val(newRangeBetSize);
                                self._setRangeBetSize(newRangeBetSize, 'all');
                            }
                        }, '-'
                    ),
                    D.button({className: 'class_inputRangeBetFixedAmount', 'disabled':'disabled'}, '100'),
                    D.button({
                            className: 'class_spanRangeBetAmountControl_plus',
                            id :'id_spanRangeBetAmountControl_plus_all',
                            onClick: function (e) {
                                var index = '#id_inputRangeBetAmount_all';
                                var currentRangeBetSize = $(index).val();
                                if(currentRangeBetSize == undefined || currentRangeBetSize == '')
                                    currentRangeBetSize = 0;
                                var newRangeBetSize = parseInt(currentRangeBetSize) + 100;
                                $(index).val(newRangeBetSize);
                                self._setRangeBetSize(newRangeBetSize, 'all');
                            },
                        }, '+'
                    )
                )
            );

            //============== BEGIN Auto Bet Element ==============
            var canUserBet = StateLib.canUserBet(
                this.state.engine.balanceSatoshis,
                0,
                0,
                this.state.rangeBetID,
                this.props.betInvalid,
                false, //this.props.cashOutInvalid,
                this.state.engine.nMinBetAmount,
                this.state.engine.nMaxBetAmount,
                this.state.engine.nMinExtraBetAmount,
                this.state.engine.nMaxExtraBetAmount,
                this.state.engine.nMinRangeBetAmount,
                this.state.engine.nMaxRangeBetAmount,
                this.state.engine.username
            );

            var invalidBet = canUserBet instanceof Error;
            //alert(invalidBet);
            var autoBetButtonClassName = 'btn btn-circle-6 btn-circle-custom btn-danger range-bet-button disable';
            var autoBetButtonText = languageFlag ? ((Engine.autoRangeBet == 'false' || Engine.autoRangeBet == false || Engine.autoRangeBet ==  '') ? 'Auto' : 'Stop') : (Engine.autoRangeBet == 'false' || Engine.autoRangeBet == false || Engine.autoRangeBet ==  '') ? '自动投入' : '取消';
            if(invalidBet) {
                autoBetButtonClassName += ' invalid-bet unselect';
            }
            var autoBetButtonElement = null;
            if(invalidBet) {
                autoBetButtonClassName += ' invalid-bet unselect';
                autoBetButtonElement = D.div({
                        id: 'id_divAutoBetButtonContainer',
                        className: 'col-md-12 bet-button-container',
                        style: {height: '35px', marginTop: '10px', marginBottom: '10px', paddingLeft: '0px'}
                    },
                    D.button({
                        className: autoBetButtonClassName,
                        style: {width: '100%', height: '100%'},
                        value: Engine.autoRangeBet,
                        disabled: 'disabled',
                        onClick: function (e) {
                            var currentValue = e.target.value;
                            if (currentValue == false || currentValue == 'false') {
                                self._setAutoRangeBet(true);
                                return;
                            }
                            self._setAutoRangeBet(false);
                        }
                    }, autoBetButtonText)
                );
            } else {
                autoBetButtonElement = D.div({
                        id: 'id_divAutoBetButtonContainer',
                        className: 'col-md-12 bet-button-container',
                        style: {height: '35px', marginTop: '10px', marginBottom: '10px', paddingLeft: '0px'}
                    },
                    D.button({
                        className: autoBetButtonClassName,
                        style: {width: '100%', height: '100%'},
                        value: Engine.autoRangeBet,
                        onClick: function (e) {
                            var currentValue = e.target.value;
                            if (currentValue == false || currentValue == 'false') {
                                self._setAutoRangeBet(true);
                                return;
                            }
                            self._setAutoRangeBet(false);
                        }
                    }, autoBetButtonText)
                );
            }

            //============== END Auto Bet Element ==============

            var betButtonElement = D.div({className:'row', style:{margin:'0px 3px'}},
                D.div({className:'col-md-6 col-sm-6 col-xs-6', style:{paddingLeft:'0px'}},
                    RangeBetButton({
                        engine: this.state.engine,
                        placeBet: this._placeRangeBet,
                        cancelBet: this._cancelRangeBet,
                        // cashOut: this._cashOut,
                        isMobileOrSmall: this.props.isMobileOrSmall,
                        // betSize: this.state.betSize.toString(),
                        // extraBetSize: this.state.extraBetSize.toString(),
                        rangeBetID: this.state.rangeBetID,
                        // betInvalid: this.state.betInvalid,
                        // extraBetInvalid: this.state.extraBetInvalid,
                        rangeBetInvalid: this.state.rangeBetInvalid,
                        // cashOutInvalid: this.state.cashOutInvalid,
                        controlsSize: this.props.controlsSize,
                        autoRangeBet: this.state.engine.autoRangeBet,
                        username: this.state.engine.username
                    })
                ),
                D.div({className:'col-md-6 col-sm-6 col-xs-6', style:{paddingLeft:'0px'}},
                    autoBetButtonElement
                )
            );

            var commentElement = D.div({className:'row',
                    style:{margin:'2px 3px'}},
                    languageFlag?'Choose your favorite range, bet bits, and get multiple rewards.':'选择您心仪的竞猜范围，投入分值，获取翻倍奖励。'
                );

            if(!this.props.isMobileOrSmall) {
                rangeInfoElements_left.push(setAllRangeBetAmountElement);
                rangeInfoElements_right.push(betButtonElement);
                rangeInfoElements_right.push(commentElement);
            } else {
                rangeInfoElements_left.unshift(commentElement);
                rangeInfoElements_left.unshift(betButtonElement);
                rangeInfoElements_right.push(setAllRangeBetAmountElement);
            }

            var controlInputs = null;
            if (!this.props.isMobileOrSmall) {
                controlInputs = D.div({className: 'col-md-12 col-sm-12 col-xs-12'},
                    D.div({className: 'portlet-body form'},
                        D.div({className: 'form-horizontal'},
                            D.div({className: 'form-body custom-form-body', style: {paddingBottom: '0px'}},
                                D.div({ className: 'form-group form-md-radios custom-form-group' },
                                    D.div({ className: 'md-radio-list custom-md-radio-list' },
                                        D.div({className: 'col-md-6 col-sm-6 col-xs-12', style:{paddingLeft:'10px', paddingRight:'3px'}},
                                            rangeInfoElements_left
                                        ),
                                        D.div({className: 'col-md-6 col-sm-6 col-xs-12', style:{paddingLeft:'10px', paddingRight:'3px'}},
                                            rangeInfoElements_right
                                        )
                                    )
                                )
                            )
                        )
                    )
                );
            } else { // mobile
                controlInputs = D.div({className: 'col-md-6 col-xs-12'},
                    D.div({className: 'portlet-body form'},
                        D.div({action: '#', className: 'form-horizontal'},
                            D.div({ className: 'form-group form-md-radios custom-form-group' },
                                D.div({ className: 'md-radio-list custom-md-radio-list' },
                                    D.div({className: 'col-md-6 col-sm-6 col-xs-12'},
                                        rangeInfoElements_left
                                    ),
                                    D.div({className: 'col-md-6 col-sm-6 col-xs-12'},
                                        rangeInfoElements_right
                                    )
                                )
                            )
                        )
                    )
                );
            }

            var objBetBox = null;
            if (this.props.isMobileOrSmall) {
                objBetBox = D.div({ className: 'row' },
                    controlInputs
                );
            } else {
                objBetBox = D.div({ className: 'row' },
                    controlInputs
                );
            }

            // If the user is logged in render the controls
            var className = 'tab-pane';
            if (!Engine.admin)
                className += ' active';
            return D.div({className: className, id: 'tab_range', style: {marginBottom: '3px', height: '100%', overflowY:'auto', overflowX:'hidden'}},
                objBetBox
            );
        }
    });
});