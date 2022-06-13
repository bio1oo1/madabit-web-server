define([
    'components/Controls',
    'components/ControlRange',
    'components/StrategyEditor',
    'components/Players',
    'components/GamesLog',
    'components/ChatForMobile',
    'stores/ControlsSelectorStore',
    'actions/ControlsSelectorActions',
    'actions/StrategyEditorActions',
    'game-logic/engine',
    'react'
], function (
    ControlsClass,
    ControlRangeClass,
    StrategyEditorClass,
    PlayersClass,
    GamesLogClass,
    ChatClass,
    ControlsSelectorStore,
    ControlsSelectorActions,
    StrategyEditorActions,
    Engine,
    React
) {
    var D = React.DOM;
    var StrategyEditor = React.createFactory(StrategyEditorClass);
    var Controls = React.createFactory(ControlsClass);
    var ControlRange = React.createFactory(ControlRangeClass);
    var Players = React.createFactory(PlayersClass);
    var GamesLog = React.createFactory(GamesLogClass);
    var Chat = React.createFactory(ChatClass);

    function getState () {
        return ControlsSelectorStore.getState();
    }

    return React.createClass({
        displayName: 'ControlsSelector',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired,
            controlsSize: React.PropTypes.string.isRequired
        },

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            ControlsSelectorStore.addChangeListener(this._onChange);
            Engine.on({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,
                placing_bet: this._onChange,
                bet_placed: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange
            });
        },

        componentWillUnmount: function () {
            ControlsSelectorStore.removeChangeListener(this._onChange);
            Engine.off({
                game_started: this._onChange,
                game_crash: this._onChange,
                game_starting: this._onChange,
                player_bet: this._onChange,
                cashed_out: this._onChange,
                placing_bet: this._onChange,
                bet_placed: this._onChange,
                cashing_out: this._onChange,
                cancel_bet: this._onChange
            });
        },

        _onChange: function () {
            if (this.isMounted()) { this.setState(getState()); }
        },

        _selectControl: function (controlName) {
            return function () {
                ControlsSelectorActions.selectControl(controlName);
                StrategyEditorActions.selectStrategy(controlName);
            };
        },

        _onDepositInMobileView: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;

            if (Engine.username == '' || Engine.username == undefined) {
                window.location = '/login/?clang=' + languageCode;
            } else {
                window.location = '/deposit/?clang=' + languageCode;
            }
        },

        render: function () {
            var controlTabSelect = null;
            var controlTabContent = null;

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            var gamingPoolInfo = null;
            var depositButton = null;

            var reangeTabLi = null;

            if (this.props.isMobileOrSmall) // Mobile or Small Screen
            {
                if (Engine.username) // Mobile or Small Screen && is login
                {
                    var manualTabLi =  D.li({className: 'custom-control-tab-li'},
                        D.a({
                            className: 'custom-tab-menu',
                            href: '#tab_manual',
                            'data-toggle': 'tab',
                            id: 'id_tab_header_manual'
                        }, languageFlag ? 'Manual' : '手动')
                    );

                    var autoTabLi = D.li({className: 'custom-control-tab-li'},
                        D.a({
                            className: 'custom-tab-menu',
                            href: '#tab_auto',
                            'data-toggle': 'tab',
                            onClick: this._selectControl('autoBet')
                        }, languageFlag ? 'Auto' : '自动')
                    );

                    // var rangeTabLi = null;
                    var rangeTabLi = D.li({className: 'active custom-control-tab-li'},
                        D.a({
                            className: 'custom-tab-menu',
                            href: '#tab_range',
                            'data-toggle': 'tab',
                        }, languageFlag ? 'Range' : '范围')
                    );



                    if(Engine.staff) {  // Mobile or Small Screen && is staff
                        manualTabLi = null;
                        autoTabLi = null;
                        rangeTabLi = null;
                    }

                    if (Engine.admin) // Mobile or Small Screen && is Admin
                    {
                        controlTabSelect = D.ul({className: 'nav nav-tabs', style: {marginTop: '10px'}});
                    } else // Mobile or Small Screen && is not Admin
                    {
                        if (Engine.bet_mode_mobile == 'custom_show') // Mobile or Small Screen && show custom bet-mode
                        {
                            controlTabSelect = D.ul({className: 'nav nav-tabs'},
                                manualTabLi,
                                autoTabLi,
                                rangeTabLi,
                                D.li({className: 'custom-control-tab-li', style: {display: 'none'}},
                                    D.a({
                                        className: 'custom-tab-menu',
                                        href: '#tab_auto',
                                        'data-toggle': 'tab',
                                        name: 'name_customTab',
                                        onClick: this._selectControl('custom')
                                    }, languageFlag ? 'Custom' : '自定义')
                                ),
                                D.li({className: 'custom-control-tab-li'},
                                    D.a({className: 'custom-tab-menu', href: '#tab_chat', 'data-toggle': 'tab'}, languageFlag ? 'Chat' : '聊天')
                                ),
                                D.li({className: 'custom-control-tab-li'},
                                    D.a({className: 'custom-tab-menu', href: '#tab_players', 'data-toggle': 'tab'}, languageFlag ? 'Players' : '用户')
                                ),
                                D.li({className: 'custom-control-tab-li'},
                                    D.a({className: 'custom-tab-menu', href: '#tab_history', 'data-toggle': 'tab'}, languageFlag ? 'History' : '历史')
                                )
                            );

                            controlTabContent =
                                D.div({className: 'tab-content', id: 'play_button_tab_content'},
                                    Controls({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                                    StrategyEditor(),
                                    ControlRange({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                                    D.div({className: 'tab-pane', id: 'tab_chat'},
                                        Chat({isMobileOrSmall: this.props.isMobileOrSmall})
                                    ),
                                    D.div({className: 'tab-pane', id: 'tab_players'},
                                        Players()
                                    ),
                                    D.div({className: 'tab-pane', id: 'tab_history'},
                                        GamesLog()
                                    )
                                );
                            // D.div({
                            //     className: "tab-content",
                            //     id: "play_button_tab_content",
                            //     style: {overflowX: 'hidden', overflowY: 'scroll'}
                            // },
                            // Controls({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                            // StrategyEditor()
                            // ),
                            // D.div({className: 'tab-pane', id: 'tab_chat'},
                            //     Chat({isMobileOrSmall: this.props.isMobileOrSmall})
                            // ),
                            // D.div({className: 'tab-pane', id: 'tab_players'},
                            //     Players()
                            // ),
                            // D.div({className: 'tab-pane', id: 'tab_history'},
                            //     GamesLog()
                            // )
                            // );
                        } else // Mobile or Small Screen && hide custom bet-mode
                        {
                            controlTabSelect = D.ul({className: 'nav nav-tabs'},
                                manualTabLi,
                                autoTabLi,
                                rangeTabLi,
                                // D.li({className: 'custom-control-tab-li'},
                                //     D.a({
                                //         className: 'custom-tab-menu',
                                //         href: "#tab_auto",
                                //         "data-toggle": "tab",
                                //         onClick: this._selectControl('custom')
                                //     }, languageFlag ? "Custom" : "自定义")
                                // ),
                                D.li({className: 'custom-control-tab-li'},
                                    D.a({className: 'custom-tab-menu', href: '#tab_chat', 'data-toggle': 'tab'}, languageFlag ? 'Chat' : '聊天')
                                ),
                                D.li({className: 'custom-control-tab-li'},
                                    D.a({className: 'custom-tab-menu', href: '#tab_players', 'data-toggle': 'tab'}, languageFlag ? 'Players' : '用户')
                                ),
                                D.li({className: 'custom-control-tab-li'},
                                    D.a({className: 'custom-tab-menu', href: '#tab_history', 'data-toggle': 'tab'}, languageFlag ? 'History' : '历史')
                                )
                            );

                            controlTabContent =
                                D.div({className: 'tab-content', id: 'play_button_tab_content'},
                                    Controls({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                                    StrategyEditor(),
                                    ControlRange({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                                    D.div({className: 'tab-pane', id: 'tab_chat'},
                                        Chat({isMobileOrSmall: this.props.isMobileOrSmall})
                                    ),
                                    D.div({className: 'tab-pane', id: 'tab_players'},
                                        Players()
                                    ),
                                    D.div({className: 'tab-pane', id: 'tab_history'},
                                        GamesLog()
                                    )
                                );
                        }
                        depositButton = D.span({style: {position: 'absolute', top: '-5px', left: '11px', color: '#ec4149'}, onClick: this._onDepositInMobileView},
                            D.i({className: 'fab fa-btc', style: {fontSize: '2.5em'}}),
                            D.label({style: {fontSize: '14px', marginLeft: '4px'}}, (languageFlag ? 'Deposit' : ' 存入算力'))
                        );
                    }
                } else // Mobile or small Screen &&  is not log in
                {
                    controlTabSelect = D.ul({className: 'nav nav-tabs'},
                        D.li({className: 'custom-control-tab-li'},
                            D.a({className: 'custom-tab-menu', href: '#tab_chat', 'data-toggle': 'tab'}, languageFlag ? 'Chat' : '聊天')
                        ),
                        D.li({className: 'custom-control-tab-li'},
                            D.a({className: 'custom-tab-menu', href: '#tab_players', 'data-toggle': 'tab'}, languageFlag ? 'Players' : '用户')
                        ),
                        D.li({className: 'custom-control-tab-li'},
                            D.a({className: 'custom-tab-menu', href: '#tab_history', 'data-toggle': 'tab'}, languageFlag ? 'History' : '历史')
                        )
                    );

                    controlTabContent =
                        D.div({className: 'tab-content', id: 'play_button_tab_content', style: {paddingBottom:'40px'}},
                            Controls({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                            D.div({className: 'tab-pane', id: 'tab_chat'},
                                Chat({isMobileOrSmall: this.props.isMobileOrSmall})
                            ),
                            D.div({className: 'tab-pane', id: 'tab_players'},
                                Players()
                            ),
                            D.div({className: 'tab-pane', id: 'tab_history'},
                                GamesLog()
                            )
                        );
                }
                gamingPoolInfo = D.div({className: 'form-group last custom-form-group', style: {marginBottom: '5px'}},
                    D.label({className: 'col-md-5 col-xs-5 control-label custom-manual-autocashout-label', style: {textAlign: 'right', fontSize: '15px', marginTop: '1px', paddingRight: '2px'}}, languageFlag ? 'Gaming Pool' : '算力资源池'),
                    D.label({className: 'col-md-5 col-xs-7 control-label custom-manual-autocashout-label', style: {textAlign: 'left', fontSize: '15px', marginTop: '1px', paddingRight: '2px'}}, Engine.bankroll + Engine.fakepool + (languageFlag ? 'bits' : '点数'))
                    // D.div({className: 'col-md-7 col-xs-7', style: {marginTop: '-2px', paddingLeft: '2px'}},
                    //     D.div({className: 'input-group'},
                    //         D.input({
                    //             className: 'form-control',
                    //             type: 'text',
                    //             value: Engine.bankroll + Engine.fakepool + (languageFlag ? 'bits' : '点数'),
                    //             disabled: 'disabled',
                    //             style: {background: 'none', border: 'none', cursor: 'default', fontSize: '15px'}
                    //         })
                    //     )
                    // )
                );
            } else { // Not Small Screen
                    if (Engine.admin || Engine.staff || Engine.bet_mode == 'manual_bet') {   //Not Small Screen && (admin || staff || manual_bet)
                    controlTabSelect = D.ul({className: 'nav nav-tabs', style: {marginTop: '10px'}});
                } else {        //Not Small Screen && Player
                    controlTabSelect = D.ul({className: 'nav nav-tabs'},
                        D.li({className: 'active custom-control-tab-li'},
                            D.a({className: 'custom-tab-menu', href: '#tab_range', 'data-toggle': 'tab', id: 'id_tab_header_range'}, languageFlag ? 'Range' : '范围')
                        ),
                        D.li({className: 'custom-control-tab-li'},
                            D.a({className: 'custom-tab-menu', href: '#tab_manual', 'data-toggle': 'tab', id: 'id_tab_header_manual'}, languageFlag ? 'Manual' : '手动')
                        ),
                        D.li({className: 'custom-control-tab-li'},
                            D.a({className: 'custom-tab-menu', href: '#tab_auto', 'data-toggle': 'tab', onClick: this._selectControl('autoBet'), id: 'id_tab_header_auto'}, languageFlag ? 'Auto' : '自动')
                        ),
                        D.li({className: 'custom-control-tab-li', style: {display: 'none'}},
                            D.a({className: 'custom-tab-menu custom-tab-menu-custom', href: '#tab_auto', 'data-toggle': 'tab', onClick: this._selectControl('custom'), id: 'id_tab_header_custom'}, languageFlag ? 'Custom' : '自定义')
                        ),
                        D.li({className: 'custom-control-tab-li', style: {display: 'none'}},
                            D.a({className: 'custom-tab-menu custom-tab-menu-custom', href: '#tab_auto', 'data-toggle': 'tab', onClick: this._selectControl('custom'), id: 'id_tab_header_custom'}, languageFlag ? 'Custom' : '自定义')
                        )
                    );
                }

                if (Engine.bet_mode == 'manual_bet') {
                        // $('#id_tab_header_manual').click();
                    controlTabContent = D.div({className: 'tab-content', id: 'play_button_tab_content'},
                        Controls({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                        ControlRange({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize})
                    );
                } else {

                    controlTabContent = D.div({className: 'tab-content', id: 'play_button_tab_content'},
                        Controls({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize}),
                        StrategyEditor(),
                        ControlRange({isMobileOrSmall: this.props.isMobileOrSmall, controlsSize: this.props.controlsSize})
                    );
                }
            }

            return D.div({className: 'row', style: { 'marginTop': '0px'}},
                D.div({className: 'col-md-12'},
                    D.div({className: 'tabbable-custom tabbable-noborder', id: 'bet_button_tabs'},
                        depositButton,
                        gamingPoolInfo,
                        controlTabSelect,
                        controlTabContent
                    )
                )
            );
        }
    });
});
