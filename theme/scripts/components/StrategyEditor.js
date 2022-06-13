define([
    'react',
    'strategies/strategies',
    'lodash',
    'game-logic/clib',
    'game-logic/engine',
    'stores/StrategyEditorStore',
    'actions/StrategyEditorActions'
], function (
    React,
    Strategies,
    _,
    Clib,
    Engine,
    StrategyEditorStore,
    StrategyEditorActions
) {
    var D = React.DOM;

    function getState () {
        var state = StrategyEditorStore.getState();
        state.engine = Engine; // Just to know if the user is logged in
        return state;
    }

    return React.createClass({
        displayName: 'strategyEditor',

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            StrategyEditorStore.addChangeListener(this._onChange);
        },

        componentWillUnmount: function () {
            StrategyEditorStore.removeChangeListener(this._onChange);
        },

        _onChange: function () {
            if (this.isMounted()) { this.setState(getState()); }
        },

        _runStrategy: function () {
            StrategyEditorActions.runStrategy();
        },

        _stopStrategy: function () {
            StrategyEditorActions.stopScript();
        },

        _updateScript: function () {
            var script = this.refs.input.getDOMNode().value;
            StrategyEditorActions.updateScript(script);
        },

        _selectStrategy: function () {
            var strategyName = this.refs.strategies.getDOMNode().value;
            StrategyEditorActions.selectStrategy(strategyName);
        },

        render: function () {
            var self = this;

            var strategiesOptions = _.map(Strategies, function (strategy, strategyName) {
                return D.option({ value: strategyName, key: 'strategy_' + strategyName }, Clib.capitaliseFirstLetter(strategyName));
            });

            var WidgetElement;

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            // If the strategy is not a script should be a widget function and we mount it
            if (typeof this.state.strategy === 'function') {
                // Send the strategy StrategyEditorStore and StrategyEditorActions to avoid circular dependencies
                var element = React.createFactory(this.state.strategy);
                var autoElement = element({ StrategyEditorStore: StrategyEditorStore, StrategyEditorActions: StrategyEditorActions });

                WidgetElement = D.div({ className: 'row' },
                    autoElement,
                    D.div({ className: 'form-actions right', style: {paddingBottom: 0 }},
                        D.div({ className: 'row col-md-12', style: {marginTop: '-45px'}, id: 'id_divControlButtonsInAutoTab'},
                            D.div({ className: 'col-md-2 col-sm-1 class_emptyElement'}),
                            D.div({ className: 'col-md-2 col-sm-5 col-xs-6'},
                                D.button({ type: 'submit', className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run',
                                    style: {
                                            marginBottom: '10px',
                                            width: '100%',
                                            marginTop: '3px',
                                            float: 'right',
                                        'WebkitBoxShadow': '0 0 6px 0px white',
                                        'MozBoxShadow': '0 0 6px 0px white',
                                        'boxShadow': '0 0 6px 0px white'
                                    },
                                    onClick: self._runStrategy,
                                    disabled: this.state.active || this.state.invalidData || !this.state.engine.username
                                }, languageFlag ? 'Run' : '执行')
                            ),
                            D.div({ className: 'col-md-2 col-sm-5 col-xs-6'},
                                D.button({ type: 'submit', className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run',
                                    style: {
                                            //background: '0 0',
                                            marginBottom: '10px',
                                            marginTop: '2px',
                                            width: '100%',
                                            //border: '1px solid #f1353d',
                                            float: 'right',
                                        'WebkitBoxShadow': '0 0 6px 0px white',
                                        'MozBoxShadow': '0 0 6px 0px white',
                                        'boxShadow': '0 0 6px 0px white'
                                    },
                                    onClick: self._stopStrategy,
                                    disabled: !this.state.active
                                }, languageFlag ? 'Stop' : '停')
                            ),
                            D.div({ className: 'col-md-6'})
                        )
                    )
                );
            } else {
                // WidgetElement = D.textarea({ className: 'strategy-input', ref: 'input', value: self.state.strategy, onChange: self._updateScript, disabled: this.state.active });
                WidgetElement = D.div({ className: 'row'},
                    D.div({ className: 'col-md-11'},
                        D.div({ className: 'portlet-body form'},
                            D.form({ action: '#', className: 'form-horizontal'},
                                D.div({ className: 'form-body'},
                                    D.textarea({
                                        id: 'id_textareaCustomScript',
                                        className: 'form-control',
                                        rows: '9',
                                        name: 'remarks',
                                        ref: 'input',
                                        value: self.state.strategy,
                                        onChange: self._updateScript,
                                        disabled: this.state.active,
                                        style: {height: '100px'}
                                    })
                                )
                            )
                        )
                    ),
                    D.div({ className: 'col-md-1', style: {paddingLeft: '0'}},
                        D.form({ action: '#', className: 'form-horizontal'},
                            D.div({ className: 'form-body'},
                                D.div({ className: 'form-group custom-customscript-button-parent-form-group'},
                                    D.div({ className: 'col-md-12', align: 'center', style: {paddingLeft: '6px'}},
                                        D.div({className: 'input-group custom-customscript-button', style: {'marginTop': '125px'}},
                                            D.button({ type: 'submit', className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run',
                                                style: {
                                                        marginBottom: '10px',
                                                        width: '100%',
                                                    'WebkitBoxShadow': '0 0 6px 0px white',
                                                    'MozBoxShadow': '0 0 6px 0px white',
                                                    'boxShadow': '0 0 6px 0px white'
                                                        },
                                                onClick: self._runStrategy,
                                                disabled: this.state.active || this.state.invalidData || !this.state.engine.username
                                            }, languageFlag ? 'Run' : '执行'),
                                            D.button({ type: 'button',
                                                className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run',
                                                style: {
                                                    marginLeft: '0',
                                                    //background: '0 0',
                                                    //border: '1px solid #f1353d',
                                                    width: '100%',
                                                    float: 'right',
                                                    'WebkitBoxShadow': '0 0 6px 0px white',
                                                    'MozBoxShadow': '0 0 6px 0px white',
                                                    'boxShadow': '0 0 6px 0px white'
                                                },
                                                onClick: self._stopStrategy,
                                                disabled: !this.state.active
                                            }, languageFlag ? 'Stop' : '停')
                                        )
                                    )
                                )
                            )
                        )
                    )
                );
            }

            return D.div({ className: 'tab-pane', id: 'tab_auto' },
                WidgetElement
            );

            // return D.div({ id: 'tab_auto', className : 'tab_pane' },
            //     D.div({ className: 'widget-container' },
            //         WidgetElement
            //     ),
            //     D.div({ className: 'control-buttons' },
            //         D.span({ className: 'strategy-invalid-data' }, this.state.invalidData || !this.state.engine.username),
            //         D.div({ className: 'buttons-container' },
            //             D.button({ className: 'strategy-start', onClick: self._runStrategy, disabled: this.state.active || this.state.invalidData || !this.state.engine.username }, 'RUN!'),
            //             D.button({ className: 'strategy-stop', onClick: self._stopStrategy, disabled: !this.state.active }, 'STOP'),
            //             D.select({ className: 'strategy-select', value: this.state.selectedStrategy,  onChange: self._selectStrategy, ref: 'strategies', disabled: this.state.active }, strategiesOptions)
            //         )
            //     )
            // );
        }
    });
});
