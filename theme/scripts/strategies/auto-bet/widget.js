/** Todo: If we send the Store and the actions maybe is better to just send the state, this looks like not fluxy **/

define([
    'react',
    'game-logic/engine'
], function (
    React,
    Engine
) {
    var D = React.DOM;

    return React.createClass({
        displayName: 'AutoBetWidget',

        propTypes: {
            StrategyEditorStore: React.PropTypes.object.isRequired,
            StrategyEditorActions: React.PropTypes.object.isRequired
        },

        getState: function () {
            var state = this.props.StrategyEditorStore.getWidgetState();
            state.active = this.props.StrategyEditorStore.getEditorState();
            return state;
        },

        getInitialState: function () {
            return this.getState();
        },

        componentDidMount: function () {
            this.props.StrategyEditorStore.addWidgetChangeListener(this._onChange);

            if (this.props.StrategyEditorStore.onLossOpt == 'return_to_base') {
                this.refs.domRdoLossRet.getDOMNode().click();
            } else if (this.props.StrategyEditorStore.onLossOpt == 'increase_bet_by') {
                this.refs.domRdoLossInc.getDOMNode().click();
            } else if (this.props.StrategyEditorStore.onLossOpt == null) {
                this.state.onLossSelectedOpt = 'return_to_base';
                this.props.StrategyEditorStore.onLossOpt = 'return_to_base';
                this.props.StrategyEditorActions.setWidgetState('onLossSelectedOpt', 'return_to_base');
                this.refs.domRdoLossRet.getDOMNode().defaultChecked = true;
            }

            if (this.props.StrategyEditorStore.onWinOpt == 'return_to_base') {
                this.refs.domRdoWinRet.getDOMNode().click();
            } else if (this.props.StrategyEditorStore.onWinOpt == 'increase_bet_by') {
                this.refs.domRdoWinInc.getDOMNode().click();
            } else if (this.props.StrategyEditorStore.onWinOpt == null) {
                this.state.onWinSelectedOpt = 'return_to_base';
                this.props.StrategyEditorStore.onWinOpt = 'return_to_base';
                this.props.StrategyEditorActions.setWidgetState('onWinSelectedOpt', 'return_to_base');
                this.refs.domRdoWinRet.getDOMNode().defaultChecked = true;
            }

            var objThis = this;

            setTimeout(function () {
                document.getElementById('id_edtBaseBet').value = Engine.nMinBetAmount;
                objThis.props.StrategyEditorActions.setWidgetState('baseBet', Engine.nMinBetAmount);
            }, 800);
        },

        componentWillUnmount: function () {
            this.props.StrategyEditorStore.removeWidgetChangeListener(this._onChange);
        },

        _onChange: function () {
            this.setState(this.getState());
        },

        updateOnLossReturn: function () {
            this.state.onLossSelectedOpt = 'return_to_base';
            this.props.StrategyEditorStore.onLossOpt = 'return_to_base';
            this.props.StrategyEditorActions.setWidgetState('onLossSelectedOpt', 'return_to_base');
        },

        updateOnLossIncrease: function () {
            this.state.onLossSelectedOpt = 'increase_bet_by';
            this.props.StrategyEditorStore.onLossOpt = 'increase_bet_by';
            this.props.StrategyEditorActions.setWidgetState('onLossSelectedOpt', 'increase_bet_by');
        },

        updateOnWinReturn: function () {
            this.state.onWinSelectedOpt = 'return_to_base';
            this.props.StrategyEditorStore.onWinOpt = 'return_to_base';
            this.props.StrategyEditorActions.setWidgetState('onWinSelectedOpt', 'return_to_base');
        },

        updateOnWinIncrease: function () {
            this.state.onWinSelectedOpt = 'increase_bet_by';
            this.props.StrategyEditorStore.onWinOpt = 'increase_bet_by';
            this.props.StrategyEditorActions.setWidgetState('onWinSelectedOpt', 'increase_bet_by');
        },

        updateBetAmount: function () {
            var amount = this.refs.bet_amount.getDOMNode().value;
            this.props.StrategyEditorActions.setWidgetState('baseBet', amount);
        },

        updateAutoCashAt: function () {
            var amount = this.refs.auto_cash_at.getDOMNode().value;
            this.props.StrategyEditorActions.setWidgetState('autoCashAt', amount);
        },

        updateOnLossQty: function () {
            var amount = this.refs.onLossQty.getDOMNode().value;
            this.props.StrategyEditorActions.setWidgetState('onLossIncreaseQty', amount);
        },

        updateOnWinQty: function () {
            var amount = this.refs.onWinQty.getDOMNode().value;
            this.props.StrategyEditorActions.setWidgetState('onWinIncreaseQty', amount);
        },

        updateMaxBetStop: function () {
            var amount = this.refs.max_bet_stop.getDOMNode().value;
            Engine.nMaxBetStop = amount;
            this.props.StrategyEditorActions.setWidgetState('maxBetStop', amount);
        },

        render: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode == 'en');

            return D.div({ className: 'col-md-12', style: {padding: '10px'}},
                D.div({ className: 'col-md-6 col-sm-6 custom-autotab-div' },
                    D.div({ className: 'portlet-body form' },
                        D.form({ className: 'form-horizontal' },
                            D.div({ className: 'form-body' },
                                D.div({ className: 'form-group custom-form-group' },
                                    D.label({ className: 'col-md-6 col-sm-6 col-xs-6 control-label custom-control-label custom-basebet-label'},
                                        languageFlag ? 'Base Bet:' : '基本投入算力'
                                    ),
                                    D.div({ className: 'col-md-6 col-sm-6 col-xs-6 custom-input-div' },
                                        D.div({ className: 'input-group' },
                                            D.input({
                                                id: 'id_edtBaseBet',
                                                type: 'number',
                                                step: 1,
                                                // min: 1,
                                                min: Engine.nMinBetAmount,
                                                className: 'form-control',
                                                placeholder: '',
                                                ref: 'bet_amount',
                                                onChange: this.updateBetAmount,
                                                value: this.state.baseBet,
                                                disabled: this.state.active
                                            })
                                        )
                                    )
                                ),
                                D.div({ className: 'form-group custom-form-group' },
                                    D.label({ className: 'col-md-6 col-xs-6 control-label custom-control-label' },
                                        languageFlag ? 'Auto Cashout at:' : '自动获取算力资源倍数'
                                    ),
                                    D.div({ className: 'col-md-6 col-xs-6 custom-input-div' },
                                        D.div({ className: 'input-group' },
                                            D.input({
                                                type: 'number',
                                                step: 0.01,
                                                min: 1,
                                                className: 'form-control',
                                                placeholder: '',
                                                ref: 'auto_cash_at',
                                                onChange: this.updateAutoCashAt,
                                                value: this.state.autoCashAt,
                                                disabled: this.state.active
                                            })
                                        )
                                    )
                                ),
                                D.div({ className: 'form-group custom-form-group', style: {marginBottom: 0}},
                                    D.label({ className: 'col-md-6 col-xs-6 control-label custom-control-label' },
                                        languageFlag ? 'Stop if bet is:' : '最大投入算力金额不可超过(数额）'
                                    ),
                                    D.div({ className: 'col-md-6 col-xs-6 custom-input-div' },
                                        D.div({ className: 'input-group' },
                                            D.input({
                                                type: 'number',
                                                step: 1,
                                                min: 1,
                                                className: 'form-control',
                                                placeholder: '',
                                                ref: 'max_bet_stop',
                                                onChange: this.updateMaxBetStop,
                                                value: this.state.maxBetStop,
                                                disabled: this.state.active
                                            })
                                        )
                                    )
                                )
                            )
                        )
                    )
                ),
                D.div({ className: 'col-md-6 col-sm-6 custom-autotab-div' },
                    D.div({ className: 'portlet-body custom-portlet-body form', style: { borderBottom: '1px solid' } },
                        D.form({ className: 'form-horizontal' },
                            D.div({ className: 'form-body custom-form-body' },
                                D.div({ className: 'form-group form-md-radios custom-form-group' },
                                    D.label(null,
                                        languageFlag ? 'On loss:' : '消耗:'
                                    ),
                                    D.div({ className: 'md-radio-list custom-md-radio-list' },
                                        D.div({ className: 'md-radio custom-md-radio' },
                                            D.input({
                                                type: 'radio',
                                                id: 'radio1',
                                                name: 'radio1',
                                                className: 'md-radiobtn',
                                                defaultChecked: '',
                                                value: 'return_to_base',
                                                ref: 'domRdoLossRet',
                                                onChange: this.updateOnLossReturn,
                                                disabled: this.state.active
                                            }),
                                            D.label({ htmlFor: 'radio1', className: 'custom-control-label'},
                                                D.span({className: 'inc'}),
                                                D.span({className: 'check'}),
                                                D.span({className: 'box'}),
                                                D.span({style: {marginTop: '-8px', marginLeft: '24px'}}, languageFlag ? 'Return to base bet' : '返回基本投入算力')
                                            )
                                        ),
                                        D.div({ className: 'md-radio' },
                                            D.input({
                                                type: 'radio',
                                                id: 'radio2',
                                                name: 'radio1',
                                                className: 'md-radiobtn',
                                                value: 'increase_bet_by',
                                                ref: 'domRdoLossInc',
                                                onChange: this.updateOnLossIncrease,
                                                disabled: this.state.active
                                            }),
                                            D.label({ htmlFor: 'radio2', className: 'col-md-7 col-xs-7 custom-control-label', style: { marginTop: '7px' } },
                                                D.span({className: 'inc'}),
                                                D.span({className: 'check'}),
                                                D.span({className: 'box'}),
                                                D.span({style: {marginTop: '0px', marginLeft: '24px'}}, languageFlag ? 'Increase bet by' : '增加投入算力（倍数）  ')
                                            ),
                                            D.div({ className: 'col-md-5 col-xs-5 custom-input-div'},
                                                D.input({
                                                    type: 'number',
                                                    step: 0.01,
                                                    min: 1,
                                                    className: 'form-control',
                                                    placeholder: '',
                                                    ref: 'onLossQty',
                                                    onChange: this.updateOnLossQty,
                                                    value: this.state.onLossIncreaseQty,
                                                    disabled: this.state.active || this.state.onLossSelectedOpt != 'increase_bet_by'
                                                })
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    D.div({ className: 'portlet-body custom-portlet-body form', style: { borderBottom: '1px solid' } },
                        D.form({ className: 'form-horizontal' },
                            D.div({ className: 'form-body custom-form-body' },
                                D.div({ className: 'form-group form-md-radios custom-form-group' },
                                    D.label(null,
                                        languageFlag ? 'On win:' : '盈利'
                                    ),
                                    D.div({ className: 'md-radio-list custom-md-radio-list'},
                                        D.div({ className: 'md-radio custom-md-radio' },
                                            D.input({
                                                type: 'radio',
                                                id: 'radio3',
                                                name: 'radio2',
                                                className: 'md-radiobtn',
                                                defaultChecked: '',
                                                value: 'return_to_base',
                                                ref: 'domRdoWinRet',
                                                onChange: this.updateOnWinReturn,
                                                disabled: this.state.active
                                            }),
                                            D.label({ htmlFor: 'radio3', className: 'custom-control-label' },
                                                D.span({className: 'inc'}),
                                                D.span({className: 'check'}),
                                                D.span({className: 'box'}),
                                                D.span({style: {marginTop: '-8px', marginLeft: '24px'}}, languageFlag ? 'Return to base bet' : '返回基本投入算力')
                                            )
                                        ),
                                        D.div({ className: 'md-radio' },
                                            D.input({
                                                type: 'radio',
                                                id: 'radio4',
                                                name: 'radio2',
                                                className: 'md-radiobtn',
                                                value: 'increase_bet_by',
                                                ref: 'domRdoWinInc',
                                                onChange: this.updateOnWinIncrease,
                                                disabled: this.state.active
                                            }),
                                            D.label({ className: 'col-md-7 col-xs-7 custom-control-label', htmlFor: 'radio4', style: { marginTop: '7px' } },
                                                D.span({className: 'inc'}),
                                                D.span({className: 'check'}),
                                                D.span({className: 'box'}),
                                                D.span({style: {marginTop: '0px', marginLeft: '24px'}}, languageFlag ? 'Increase bet by' : '增加投入算力（倍数）')
                                            ),
                                            D.div({ className: 'col-md-5 col-xs-5 custom-input-div', style: {zIndex: '5'}},
                                                D.input({
                                                    type: 'number',
                                                    step: 0.01,
                                                    min: 1,
                                                    className: 'form-control',
                                                    placeholder: '',
                                                    ref: 'onWinQty',
                                                    onChange: this.updateOnWinQty,
                                                    value: this.state.onWinIncreaseQty,
                                                    disabled: this.state.active || this.state.onWinSelectedOpt != 'increase_bet_by'
                                                })
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                ),
                D.div({ className: 'col-md-2 custom-autotab-div' })
            );
        }

    });
});
