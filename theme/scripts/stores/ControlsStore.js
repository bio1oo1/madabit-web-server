define([
    'dispatcher/AppDispatcher',
    'constants/AppConstants',
    'lib/events',
    'lodash',
    'game-logic/clib',
    'game-logic/engine'
], function (
    AppDispatcher,
    AppConstants,
    Events,
    _,
    Clib,
    Engine
) {
    var CHANGE_EVENT = 'change';

    // Bet Size
    var _betSize = Clib.localOrDef('betSize', Engine.nMinBetAmount);
    var _maxBetStop = Clib.localOrDef('maxBetStop', Engine.nMaxBetAmount);

    var _betInvalid; // false || string error message
    var bet = Clib.parseBet(_betSize, Engine.nMinBetAmount, Engine.nMaxBetAmount, _maxBetStop);
    if (bet instanceof Error) { _betInvalid = bet.message; } else { _betInvalid = false; }

    // Extra Bet Size
    var _extraBetSize = Clib.localOrDef('extraBetSize', '0');
    var extraBet = Clib.parseExtraBet(_extraBetSize, Engine.nMinExtraBetAmount, Engine.nMaxExtraBetAmount);
    var _extraBetInvalid; // false || string error message
    if (extraBet instanceof Error) { _extraBetInvalid = extraBet.message; } else { _extraBetInvalid = false; }

    //Range Bet Size
    var _rangeBetSize = JSON.parse(Clib.localOrDef('rangeBetSize', '{}'));
    var _rangeBetID = JSON.parse(Clib.localOrDef('rangeBetID', "{}"));
    var rangeBet = Clib.parseRangeBet(_rangeBetSize, Engine.nMinRangeBetAmount, Engine.nMaxRangeBetAmount);
    var _rangeBetInvalid; // false || string error message
    if (rangeBet instanceof Error) { _rangeBetInvalid = rangeBet.message; } else { _rangeBetInvalid = false; }

    // Cashout Number
    var _cashOut = Clib.localOrDef('cashOut', '2.00');
    var _cashOutInvalid; // false || string error message
    var co = Clib.parseAutoCash(_cashOut);
    if (co instanceof Error) { _cashOutInvalid = co.message; } else { _cashOutInvalid = false; }

    // Singleton ControlsStore Object
    var ControlsStore = _.extend({}, Events, {

        emitChange: function () {
            this.trigger(CHANGE_EVENT);
        },

        addChangeListener: function (callback) {
            this.on(CHANGE_EVENT, callback);
        },

        removeChangeListener: function (callback) {
            this.off(CHANGE_EVENT, callback);
        },

        _setBetSize: function (betSize) {
            _betSize = betSize;

            var bet = Clib.parseBet(betSize, Engine.nMinBetAmount, Engine.nMaxBetAmount, _maxBetStop);
            if (bet instanceof Error) { _betInvalid = bet.message; } else { _betInvalid = false; }

            localStorage['betSize'] = _betSize;
        },

        _setExtraBetSize: function (extraBetSize) {
            _extraBetSize = extraBetSize;

            var extraBet = Clib.parseExtraBet(extraBetSize, Engine.nMinExtraBetAmount, Engine.nMaxExtraBetAmount);
            if (extraBet instanceof Error) { _extraBetInvalid = extraBet.message; } else { _extraBetInvalid = false; }

            localStorage['extraBetSize'] = _extraBetSize;
        },

        _setRangeBetSize: function (rangeBetSize, rangeBetID) {

            if(rangeBetSize < 0)
                rangeBetSize = 0;

            if(rangeBetID != 'all') {
                _rangeBetSize[rangeBetID] = rangeBetSize;

                var rangeBet = Clib.parseRangeBet(_rangeBetSize, Engine.nMinRangeBetAmount, Engine.nMaxRangeBetAmount);
                if (rangeBet instanceof Error) {
                    _rangeBetInvalid = rangeBet.message;
                } else {
                    _rangeBetInvalid = false;
                }

                localStorage['rangeBetSize'] = JSON.stringify(_rangeBetSize);
            } else {
                var rangeInfo = Engine.rangeInfo;
                for(var i=0; i < rangeInfo.length; i++) {
                    _rangeBetSize[rangeInfo[i]['id']] = rangeBetSize;
                }
                _rangeBetSize['all'] = rangeBetSize;
            }
        },

        _setRangeBetID: function (rangeBetID) {
            _rangeBetID[rangeBetID] = "";
            localStorage['rangeBetID'] = JSON.stringify(_rangeBetID);
        },

        _unsetRangeBetID: function (rangeBetID) {
            if(_rangeBetID[rangeBetID] != undefined)
                delete _rangeBetID[rangeBetID];
            localStorage['rangeBetID'] = JSON.stringify(_rangeBetID);
        },

        _setAutoCashOut: function (autoCashOut) {
            _cashOut = autoCashOut;

            var co = Clib.parseAutoCash(autoCashOut);
            if (co instanceof Error) { _cashOutInvalid = co.message; } else { _cashOutInvalid = false; }

            localStorage['cashOut'] = _cashOut;
        },

        _doubleBet: function () {
            _betSize = String(Number(_betSize) * 2);
            localStorage['betSize'] = _betSize;

            _extraBetSize = String(Number(_extraBetSize) * 2);
            localStorage['extraBetSize'] = _extraBetSize;
        },

        _halfBet: function () {
            var halfBet = Math.round(Number(_betSize) / 2);
            _betSize = halfBet < 1 ? '1' : String(halfBet);
            localStorage['betSize'] = _betSize;

            var halfExtraBet = Math.round(Number(_extraBetSize) / 2);
            _extraBetSize = halfExtraBet < 1 ? '1' : String(halfExtraBet);
            localStorage['extraBetSize'] = _extraBetSize;
        },

        getBetSize: function () {
            return _betSize;
        },

        getExtraBetSize: function () {
            return _extraBetSize;
        },

        getRangeBetSize: function () {
            return _rangeBetSize;
        },

        getRangeBetID: function () {        //array, don't change name of variable because of history
            return _rangeBetID;
        },

        getBetInvalid: function () {
            return _betInvalid;
        },

        getExtraBetInvalid: function () {
            return _extraBetInvalid;
        },

        getRangeBetInvalid: function () {
            return _rangeBetInvalid;
        },

        getCashOut: function () {
            return _cashOut;
        },

        getCashOutInvalid: function () {
            return _cashOutInvalid;
        },

        getState: function () {
            return {
                betSize: _betSize,
                extraBetSize: _extraBetSize,
                betInvalid: _betInvalid,
                extraBetInvalid: _extraBetInvalid,
                cashOut: _cashOut,
                cashOutInvalid: _cashOutInvalid
            };
        }

    });

    AppDispatcher.register(function (payload) {
        var action = payload.action;

        switch (action.actionType) {
            case AppConstants.ActionTypes.SET_BET_SIZE:
                ControlsStore._setBetSize(action.betSize);
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.SET_EXTRA_BET_SIZE:
                ControlsStore._setExtraBetSize(action.extraBetSize);
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.SET_RANGE_BET_SIZE:
                ControlsStore._setRangeBetSize(action.rangeBetSize, action.rangeBetID);
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.SET_RANGE_BET_ID:
                ControlsStore._setRangeBetID(action.rangeBetID);
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.UNSET_RANGE_BET_ID:
                ControlsStore._unsetRangeBetID(action.rangeBetID);
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.SET_AUTO_CASH_OUT:
                ControlsStore._setAutoCashOut(action.autoCashOut);
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.DOUBLE_BET:
                ControlsStore._doubleBet();
                ControlsStore.emitChange();
                break;

            case AppConstants.ActionTypes.HALF_BET:
                ControlsStore._halfBet();
                ControlsStore.emitChange();
                break;
        }

        return true; // No errors. Needed by promise in Dispatcher.
    });

    return ControlsStore;
});
