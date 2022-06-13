/**
 * This view acts as a wrapper for all the other views in the game
 * it is subscribed to changes in EngineVirtualStore but it only
 * listen to connection changes so every view should subscribe to
 * EngineVirtualStore independently.
 */
define([
    'react',
    'game-logic/engine_statistics',
    'game-logic/clib',
    'game-logic/hotkeys',
    'stores/GameSettingsStore'
], function (
    React,
    Engine,
    Clib,
    Hotkeys,
    GameSettingsStore
) {
    var D = React.DOM;
    var profit = {};

    return React.createClass({
        displayName: 'Statistics',

        getInitialState: function () {
            var state = GameSettingsStore.getState();
            state.isConnected = Engine.isConnected;
            state.showMessage = true;
            state.isMobileOrSmall = Clib.isMobileOrSmall(); // bool
            state.profit = {};
            state.profit.totalProfit = 0;
            state.profit.monthlyProfit = 0;
            state.profit.weeklyProfit = 0;
            state.profit.dailyProfit = 0;

            return state;
        },

        componentDidMount: function () {
            Engine.on({
                'connected': this._onEngineChange,
                'disconnected': this._onEngineChange,
                'profit_company_updated': this._onProfitUpdated
            });
            GameSettingsStore.addChangeListener(this._onSettingsChange);
            window.addEventListener('resize', this._onWindowResize);
            Hotkeys.mount();
        },

        componentWillUnmount: function () {
            Engine.off({
                'connected': this._onChange,
                'disconnected': this._onChange,
                'profit_company_updated': this._onProfitUpdated

            });

            window.removeEventListener('resize', this._onWindowResize);

            Hotkeys.unmount();
        },

        _onEngineChange: function () {
            if ((this.state.isConnected != Engine.isConnected) && this.isMounted()) { this.setState({ isConnected: Engine.isConnected }); }
        },

        _onChange: function () {
        },

        _onProfitUpdated: function (data) {
            this.state.profit.totalProfit = data.totalProfit;
            this.state.profit.beginDate = data.beginDate;
            this.state.profit.endDate = data.endDate;

            this.state.profit.monthlyProfit = data.monthlyProfit;
            this.state.profit.currentMonth = data.currentMonth;

            this.state.profit.weeklyProfit = data.weeklyProfit;
            this.state.profit.currentWeek = data.currentWeek;

            this.state.profit.dailyProfit = data.dailyProfit;
            this.state.profit.currentDay = data.currentDay;
            this.setState(this.state);
        },

        _onSettingsChange: function () {
        },

        _onWindowResize: function () {
        },

        _hideMessage: function () {
        },

        render: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            return D.div({className: 'row'},
                D.div({ className: 'col-lg-3 col-md-3 col-sm-6 col-xs-12'},
                    D.div({ className: 'dashboard-stat blue-madison'},
                        D.div({ className: 'visual'},
                            D.i({className: 'fas fa-chart-line fa-2x'})
                        ),
                        D.div({ className: 'details'},
                            D.div({ className: 'number', id: 'id_divTotalProfit'}, this.state.profit.totalProfit / 100000000.0 + ' BTC'),
                            D.div({ className: 'desc'}, this.state.profit.beginDate + ' ~ ' + this.state.profit.endDate)
                        ),
                        D.a({className: 'more', 'href': 'javascript:;'},
                            languageFlag ? 'Total Profit' : '总获取算力',
                            D.i({'className': 'm-icon-swapright m-icon-white'})
                        )
                    )
                ),
                D.div({ className: 'col-lg-3 col-md-3 col-sm-6 col-xs-12'},
                    D.div({ className: 'dashboard-stat green-haze'},
                        D.div({ className: 'visual'},
                            D.i({className: 'fas fa-percent fa-2x'})
                        ),
                        D.div({ className: 'details'},
                            D.div({ className: 'number', id: 'id_divMonthlyProfit'}, this.state.profit.monthlyProfit / 100000000.0 + ' BTC'),
                            D.div({ className: 'desc'}, this.state.profit.currentMonth)
                        ),
                        D.a({className: 'more', 'href': 'javascript:;'},
                            languageFlag ? 'This Month Profit' : '这个月获取算力 ',
                            D.i({'className': 'm-icon-swapright m-icon-white'})
                        )
                    )
                ),
                D.div({ className: 'col-lg-3 col-md-3 col-sm-6 col-xs-12'},
                    D.div({ className: 'dashboard-stat purple-plum'},
                        D.div({ className: 'visual'},
                            D.i({className: 'fa fa-shopping-cart fa-2x'})
                        ),
                        D.div({ className: 'details'},
                            D.div({ className: 'number', id: 'id_divWeeklyProfit'}, this.state.profit.weeklyProfit / 100.0 + ' Bits'),
                            D.div({ className: 'desc'}, this.state.profit.currentWeek)
                        ),
                        D.a({className: 'more', 'href': 'javascript:;'},
                            languageFlag ? 'This Week Profit' : '这个星期获取算力',
                            D.i({'className': 'm-icon-swapright m-icon-white'})
                        )
                    )
                ),
                D.div({ className: 'col-lg-3 col-md-3 col-sm-6 col-xs-12'},
                    D.div({ className: 'dashboard-stat red-intense'},
                        D.div({ className: 'visual'},
                            D.i({className: 'fas fa-globe fa-2x'})
                        ),
                        D.div({ className: 'details'},
                            D.div({ className: 'number', id: 'id_divDailyProfit'}, this.state.profit.dailyProfit / 100.0 + ' Bits'),
                            D.div({ className: 'desc'}, this.state.profit.currentDay)
                        ),
                        D.a({className: 'more', 'href': 'javascript:;'},
                            languageFlag ? 'Today Profit' : '今天的获取算力',
                            D.i({'className': 'm-icon-swapright m-icon-white'})
                        )
                    )
                )
            );
        }
    });
});
