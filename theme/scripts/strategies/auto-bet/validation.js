define([
    'game-logic/clib',
    'game-logic/engine'
], function (
    Clib,
    Engine
) {
    return function (settings) {
        // Validate base bet amount
        var bet = Clib.parseBet(settings.baseBet, Engine.nMinBetAmount, Engine.nMaxBetAmount, settings.maxBetStop);
        if (bet instanceof Error) { return bet.message; }

        if (bet < Engine.nMinBetAmount) {
            console.log('The bet should be at least ' + Engine.nMinBetAmount + ' bits.');
            return 'The bet should be at least ' + Engine.nMinBetAmount + ' bits.';
        }

        if (bet > Engine.nMaxBetAmount) {
            console.log('The bet should be at most ' + Engine.nMaxBetAmount + ' bits.');
            return 'The bet should be at most ' + Engine.nMaxBetAmount + ' bits.';
        }

        // Validate auto cash amount
        var co = Clib.parseAutoCash(settings.autoCashAt);
        if (co instanceof Error) { return co.message; }

        // Validate maxBetAmount
        if (!Clib.isInteger(Number(settings.maxBetStop))) {
            console.log('Max bet should be a number');
            return 'Max bet should be a number';
        }

        if (!settings.onLossIncreaseQty || settings.onLossIncreaseQty == 0) { return 'Increase bet by should be a number bigger than 0'; }

        if (!settings.onWinIncreaseQty || settings.onLossIncreaseQty == 0) { return 'Increase bet by should be a number bigger than 0'; }

        var onLossIncreaseQty = Number(settings.onLossIncreaseQty);
        var onWinIncreaseQty = Number(settings.onWinIncreaseQty);

        // The bet multiplier should be greater than zero and a number
        if (settings.onLossSelectedOpt == 'increase_bet_by') {
            if (!Clib.isNumber(onLossIncreaseQty)) { return 'Increase bet by should be a number bigger than 0'; }
        }

        if (settings.onWinSelectedOpt == 'increase_bet_by') {
            if (!Clib.isNumber(onWinIncreaseQty)) { return 'Increase bet by should be a number bigger than 0'; }
        }

        return false;
    };
});
