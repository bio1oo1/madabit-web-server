define([
    'dispatcher/AppDispatcher',
    'constants/AppConstants'
], function (
    AppDispatcher,
    AppConstants
) {
    var ControlsActions = {

        placeBet: function (bet, extraBet, cashOut) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.PLACE_BET,
                bet: bet,
                extraBet: extraBet,
                cashOut: cashOut
            });
        },

        placeRangeBet: function (rangeBet) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.PLACE_RANGE_BET,
                // bet: bet,
                // extraBet: extraBet,
                // cashOut: cashOut
                rangeBet: rangeBet
            });
        },

        cashOut: function () {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.CASH_OUT
            });
        },

        cancelBet: function () {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.CANCEL_BET
            });
        },

        cancelRangeBet: function () {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.CANCEL_RANGE_BET
            });
        },

        setBetSize: function (betSize) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_BET_SIZE,
                betSize: betSize
            });
        },

        setExtraBetSize: function (extraBetSize) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_EXTRA_BET_SIZE,
                extraBetSize: extraBetSize
            });
        },

        setRangeBetSize: function (rangeBetSize, rangeBetID) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_RANGE_BET_SIZE,
                rangeBetSize: rangeBetSize,
                rangeBetID: rangeBetID
            });
        },

        setRangeBetID: function (rangeBetID) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_RANGE_BET_ID,
                rangeBetID: rangeBetID
            });
        },

        unsetRangeBetID: function (rangeBetID) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.UNSET_RANGE_BET_ID,
                rangeBetID: rangeBetID
            });
        },

        setAutoCashOut: function (autoCashOut) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_AUTO_CASH_OUT,
                autoCashOut: autoCashOut
            });
        },

        setAutoRangeBet: function (autoRangeBet, rangeBetID) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_AUTO_RANGE_BET,
                autoRangeBet: autoRangeBet,
                rangeBetID: rangeBetID
            });
        },

        finishRound: function (currentTime, currentPoint) {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.FINISH_ROUND,
                currentTime: currentTime,
                currentPoint: currentPoint
            });
        },

        setNext0: function () {
            AppDispatcher.handleViewAction({
                actionType: AppConstants.ActionTypes.SET_NEXT_0
            });
        }

    };

    return ControlsActions;
});
