define([
    'react',
    'lodash',
    'game-logic/clib',
    'components/GraphicDisplay',
    'game-logic/engine',
    'stores/ChartStore',
    'stores/GameSettingsStore'
], function (
    React,
    _,
    Clib,
    GraphicDisplayClass,
    Engine,
    ChartStore,
    GameSettingsStore
) {
    var D = React.DOM;

    var GraphicDisplay = new GraphicDisplayClass();

    function getState () {
        return _.merge({}, ChartStore.getState(), GameSettingsStore.getState());
    }

    function getEngineState () {
        return Engine;
    }

    return React.createClass({
        displayName: 'Chart',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired,
            controlsSize: React.PropTypes.string.isRequired
        },

        getInitialState: function () {
            var state = getState();
            state.engine = getEngineState();
            return state;
        },

        getThisElementNode: function () {
            return this.getDOMNode();
        },

        componentDidMount: function () {
            Engine.on({
                game_started: this._onGameStarted,
                game_crash: this._onChange,
                game_starting: this._onChange,
                lag_change: this._onChange
            });
            GameSettingsStore.addChangeListener(this._onChange);

            if (this.state.graphMode === 'graphics') { GraphicDisplay.startRendering(); }
        },

        componentWillUnmount: function () {
            Engine.off({
                game_started: this._onGameStarted,
                game_crash: this._onChange,
                game_starting: this._onChange,
                lag_change: this._onChange
            });
            GameSettingsStore.removeChangeListener(this._onChange);

            if (this.state.graphMode === 'graphics') { GraphicDisplay.stopRendering(); }
        },

        _onChange: function () {

            var state = getState();
            state.engine = getEngineState();

            if (this.state.graphMode !== state.graphMode) {
                if (this.state.graphMode === 'text') { GraphicDisplay.startRendering(); } else { GraphicDisplay.stopRendering(); }
            }

            if (this.isMounted()) { this.setState(state); }
        },

        _onGameStarted: function () {

            var state = getState();
            state.engine = getEngineState();

            if (this.state.graphMode !== state.graphMode) {
                if (this.state.graphMode === 'text') { GraphicDisplay.startRendering(); } else { GraphicDisplay.stopRendering(); }
            }

            if (this.isMounted()) { this.setState(state); }

            Engine.topPlayer = {name: '', profit: null};
        },

        componentDidUpdate: function (prevProps, prevState) {
            // Detect changes on the controls size to trigger a window resize to resize the canvas of the graphics display
            if (this.state.graphMode === 'graphics' && this.state.controlsSize !== prevState.controlsSize) { GraphicDisplay.onWindowResize(); }
        },

        render: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            var nGamingPool = Engine.bankroll + Engine.fakepool;
            // calc Total Player Info
            var nTotalPlayers = 0;
            var nTotalBets = 0;
            for (var user in Engine.playerInfo) {
                nTotalPlayers++;
                nTotalBets += parseInt(Engine.playerInfo[user].bet) / 100;
                nTotalBets += parseInt(Engine.playerInfo[user].extraBet) / 100;

                var nTotalRangeBetAmount = 0;
                Engine.playerInfo[user].rangeBet.forEach(function(rangeInfo) {
                    nTotalRangeBetAmount += (rangeInfo.amount / 100);
                });
                nTotalBets += nTotalRangeBetAmount;
            }

            var objGameInfo = null;

            if (!this.props.isMobileOrSmall) {
                objGameInfo =
                    D.div({className: 'on_graph_info_panel'},
                        D.div({className: 'row'},
                            D.div({className: 'col-md-6 col-xs-6 col-sm-6 col-lg-6'}, D.span({className: 'pull-right'}, languageFlag ? 'Gaming Pool' : '算力资源池总数')),
                            D.div({className: 'col-md-6 col-xs-6 col-sm-6 col-lg-6'}, D.span({style: {color: '#E93036', fontWeight: '800'}}, nGamingPool), languageFlag ? ' bits' : '点数')
                        ),
                        D.div({className: 'row'},
                            D.div({className: 'col-md-6 col-xs-6 col-sm-6 col-lg-6'}, D.span({className: 'pull-right'}, languageFlag ? 'Total Players' : '总参与人数')),
                            D.div({className: 'col-md-6 col-xs-6 col-sm-6 col-lg-6'}, D.span({style: {color: '#E93036', fontWeight: '800'}}, nTotalPlayers))
                        ),
                        D.div({className: 'row'},
                            D.div({className: 'col-md-6 col-xs-6 col-sm-6 col-lg-6'}, D.span({className: 'pull-right'}, languageFlag ? 'Total Bets' : '总投入算力量')),
                            D.div({className: 'col-md-6 col-xs-6 col-sm-6 col-lg-6'}, D.span({style: {color: '#E93036', fontWeight: '800'}}, nTotalBets), languageFlag ? ' bits' : '点数')
                        )
                    );
            }

            var fireworksDiaplayMode = (Engine.gameState == 'ENDED' && Engine.topPlayer.profit > 0 &&
                                            (
                                                ((Engine.tableHistory[0].game_crash / 100) >= 50 && Engine.username != undefined && Engine.cashingOut == true) ||
                                                (Engine.username == Engine.topPlayer.name && Object.keys(Engine.playerInfo).length > 1)
                                            )
            ) ? 'block' : 'none';

            return D.div({className: 'row'},
                D.div({className: 'col-md-12'},
                    D.div({id: 'id_divChart'})
                ),
                D.div({ className: 'btn-circle-50p crash_point_div', id: 'id_divPayout' }, '12.38x'),
                D.div({ className: 'class_divRoundNote', id: 'id_divRoundNote' }, 'Next Round\nin 2.45'),
                D.img({id: 'id_imgFireworks', src: '/img/fireworks.gif', style: {display: fireworksDiaplayMode}}),
                objGameInfo
            );
        }
    });
});
