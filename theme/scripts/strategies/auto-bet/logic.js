define(['game-logic/clib'], function (Clib) {
    return function (settings) {
        console.assert(settings);

        /**
         * Initial conditions object
         *  @param {object} settings
         *  @param {number} settings.baseBet - Base bet in bits
         *  @param {number} settings.autoCashAt
         *  @param {string} settings.onLossSelectedOpt - Options: return_to_base(def), increase_bet_by
         *  @param {number/null} settings.onLossIncreaseQty
         *  @param {string} settings.onWinSelectedOpt - Options: return_to_base(def), increase_bet_by
         *  @param {number/null} settings.onWinIncreaseQty
         **/

        return function (engine) {
            // MoneyBot\n\
            var baseBetSatoshis = settings.baseBet * 100;
            var currentBet = baseBetSatoshis;

            var onLossIncreaseQty = Number(settings.onLossIncreaseQty);
            var onWinIncreaseQty = Number(settings.onWinIncreaseQty);
            var autoCashAt = Number(settings.autoCashAt);
            var maxBetStop = Number(settings.maxBetStop) * 100;

            console.assert(Clib.isNumber(autoCashAt));

            engine.on('game_starting', function () {
                var lastGamePlay = engine.lastGamePlay();

                if (lastGamePlay == 'LOST') {
                    if (settings.onLossSelectedOpt == 'return_to_base') { currentBet = baseBetSatoshis; } else { // increase_bet_by
                        console.assert(Clib.isNumber(onLossIncreaseQty));
                        currentBet = currentBet * onLossIncreaseQty;
                    }
                } else if (lastGamePlay == 'WON') {
                    if (settings.onWinSelectedOpt == 'return_to_base') { currentBet = baseBetSatoshis; } else { // increase_bet_by
                        console.assert(Clib.isNumber(onWinIncreaseQty));
                        currentBet = currentBet * onWinIncreaseQty;
                    }
                }

                var fixedCurrentBet = Math.round(currentBet / 100) * 100;

                if (fixedCurrentBet > 0 &&
                   fixedCurrentBet <= engine.getBalance() &&
                   fixedCurrentBet >= engine.getMinBet() &&
                   fixedCurrentBet <= engine.getMaxBet() &&
                   fixedCurrentBet <= maxBetStop) {
                    engine.placeBet(fixedCurrentBet, 0, Math.round(autoCashAt * 100), false);
                } else {
                    engine.stop();

                    if (fixedCurrentBet <= 0) {
                        console.log('AutoBet stoped : CurrentBet <= 0 : ' + fixedCurrentBet + ' <= 0');
                    } else if (fixedCurrentBet > engine.getBalance()) {
                        console.log('AutoBet stoped : CurrentBet > Your Balance Bits : ' + fixedCurrentBet + ' > ' + engine.getBalance());
                    } else if (fixedCurrentBet < engine.getMinBet()) {
                        console.log('AutoBet stoped : CurrentBet < MinBet : ' + fixedCurrentBet + ' < ' + engine.getMinBet());
                    } else if (fixedCurrentBet > engine.getMaxBet()) {
                        console.log('AutoBet stoped : CurrentBet > MaxBet : ' + fixedCurrentBet + ' > ' + engine.getMaxBet());
                    } else if (fixedCurrentBet > maxBetStop) {
                        console.log('AutoBet stoped : CurrentBet > MaxBetStop : ' + fixedCurrentBet + ' > ' + maxBetStop);
                    }
                }
            });
        };
    };
});
