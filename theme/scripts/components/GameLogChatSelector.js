define([
    'components/Chat',
    'components/GamesLog',
    'stores/ControlsSelectorStore',
    'actions/ControlsSelectorActions',
    'actions/StrategyEditorActions',
    'game-logic/engine',
    'react',
    'stores/GameSettingsStore'
], function (
    ChatClass,
    GamesLogClass,
    ControlsSelectorStore,
    ControlsSelectorActions,
    StrategyEditorActions,
    Engine,
    React,
    GameSettingsStore
) {
    var D = React.DOM;
    var GamesLog = React.createFactory(GamesLogClass);
    var Chat = React.createFactory(ChatClass);

    function getState () {
        return ControlsSelectorStore.getState();
    }

    return React.createClass({
        displayName: 'GameLogChatSelector',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired,
            controlsSize: React.PropTypes.string.isRequired
        },

        getInitialState: function () {
            return getState();
        },

        componentDidMount: function () {
            // ControlsSelectorStore.addChangeListener(this._onChange);
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
            // ControlsSelectorStore.removeChangeListener(this._onChange);
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
            if (this.isMounted()) {
                this.setState(getState());
            }
        },

        _selectControl: function (controlName) {
            return function () {
                // ControlsSelectorActions.selectControl(controlName);
                // StrategyEditorActions.selectStrategy(controlName);
            };
        },

        render: function () {
            var controlTabSelect = null;
            var controlTabContent = null;

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');


            controlTabSelect = D.ul({className: 'nav nav-tabs'},
                D.li({className: 'custom-control-tab-li active'},
                    D.a({className: 'custom-tab-menu', href: '#tab_chat', 'data-toggle': 'tab', id: 'id_tab_header_chat'}, languageFlag ? 'Chat' : '聊天')
                ),
                D.li({className: 'custom-control-tab-li'},
                    D.a({className: 'custom-tab-menu', href: '#tab_history', 'data-toggle': 'tab', id: 'id_tab_header_history'}, languageFlag ? 'History' : '历史')
                )
            );

            controlTabContent = D.div({className: 'tab-content', id: 'history_chat_tab_content', style:{paddingBottom:'10px'}},
                D.div({className: 'tab-pane active', id: 'tab_chat', style: {marginBottom: '3px', height: '100%'}},
                    Chat({ isMobileOrSmall: this.props.isMobileOrSmall })
                ),
                D.div({className: 'tab-pane', id: 'tab_history', style: {marginBottom: '3px', height: '100%'}},
                    GamesLog()
                )
            );

            return D.div({className: 'row', style: { 'marginTop': '0px'}},
                D.div({className: 'col-md-12'},
                    D.div({className: 'tabbable-custom tabbable-noborder', id: 'history_chat_button_tabs'},
                        controlTabSelect,
                        controlTabContent
                    )
                )
            );
        }
    });
});
