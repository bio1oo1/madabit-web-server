/** Helper functions to process the states of the stores, also helps to keep the stores cleaner **/

define([
    'constants/AppConstants',
    'game-logic/clib'
], function (
    AppConstants,
    Clib
) {
    return {

        /** ====== Engine Store ====== **/

        /** If the user is currently playing return and object with the status else null **/
        currentPlay: function (engine) {
            if (!engine.username) {
                return null;
            } else {
                return engine.playerInfo[engine.username];
            }
        },

        /** True if you are playing and haven't cashed out, it returns true on game_crash also, it clears until game_starting **/
        currentlyPlaying: function (engine) {
            var currentPlay = this.currentPlay(engine);
            return currentPlay && currentPlay.bet && !currentPlay.stopped_at;
        },

        /**
         * Returns the game payout as a percentage if game is in progress
         * if the game is not in progress returns null.
         *
         * Used by the script-controller
         *
         * If the last was time exceed the STOP_PREDICTING_LAPSE constant
         * It returns the last game tick elapsed time + the STOP_PREDICTING_LAPSE
         * This will cause the graph or others to stops if there is lag.
         * Only call this function if the game is 'IN_PROGRESS'.
         * Use it for render, strategy, etc.
         * @return {number}
         */
        getGamePayout: function (engine) {
            if (!(engine.gameState === 'IN_PROGRESS')) {
                return null;
            }

            var elapsed;
            if ((Date.now() - engine.lastGameTick) < AppConstants.Engine.STOP_PREDICTING_LAPSE) {
                elapsed = Date.now() - engine.startTime;
            } else {
                elapsed = engine.lastGameTick - engine.startTime + AppConstants.Engine.STOP_PREDICTING_LAPSE; // + STOP_PREDICTING_LAPSE because it looks better
            }
            var gamePayout = Clib.growthFunc(elapsed);
            console.assert(isFinite(gamePayout));
            return gamePayout;
        },

        /** True if are not playing in the current game or already cashed out */
        notPlaying: function (engine) {
            var currentPlay = this.currentPlay(engine);
            return !(engine.gameState === 'IN_PROGRESS' && currentPlay && !currentPlay.stopped_at);
        },

        /** To Know if the user is betting **/
        isBetting: function (engine) {
            if (!engine.username) return false;
            if (engine.nextBetAmount ||
                (engine.nextRangeBetID != undefined && engine.nextRangeBetID != null && Object.keys(engine.nextRangeBetID).length != 0)
            )
                return true;
            for (var i = 0; i < engine.joined.length; ++i) {
                if (engine.joined[i] == engine.username) {
                    return true;
                }
            }
            return false;
        },

        /// ** Not playing and not betting **/
        // ableToBet: function(engine) {
        //    return this.notPlaying(engine) && !this.isBetting(engine);
        // },

        /** ====== Controls Store ====== **/

        /** Parse the bet string in bits and returns a integer **/
        parseBet: function (betStringBits) {
            return parseInt(betStringBits) * 100;
            // return parseInt(betStringBits.replace(/k/g, '000')) * 100;
        },

        /** Parse the extra bet string in bits and returns a integer **/
        parseExtraBet: function (extraBetStringBits) {
            // return parseInt(extraBetStringBits.replace(/k/g, '000')) * 100;
            return parseInt(extraBetStringBits) * 100;
        },

        /** Parse the range bet string in bits and returns a integer **/
        parseRangeBet: function (rangeBetStringBits) {
            // return parseInt(extraBetStringBits.replace(/k/g, '000')) * 100;
            return parseInt(rangeBetStringBits) * 100;
        },

        /** Convert the cash out string into an integer **/
        parseCashOut: function (cashOutString) {
            var cashOut = parseFloat(cashOutString);
            cashOut = Math.round(cashOut * 100);
            return cashOut;
        },

        /** ====== Mixed ====== **/

        canUserBet: function (balanceSatoshis, betStringBits, extraBetStringBits, rangeBetObject, betInvalid, autoCashOutInvalid,
                              nMinBetAmount, nMaxBetAmount, nMinExtraBetAmount, nMaxExtraBetAmount,
                              nMinRangeBetAmount, nMaxRangeBetAmount, username) {
            if(!username) {
                return new Error('Need to login');
            }

            var betBet = this.parseBet(betStringBits);
            var betExtraBet = this.parseBet(extraBetStringBits);
            var betRangeBet = rangeBetObject;
            if(rangeBetObject == undefined || rangeBetObject == null)
                betRangeBet = {};

            nMinBetAmount *= 100;
            nMaxBetAmount *= 100;
            nMinExtraBetAmount *= 100;
            nMaxExtraBetAmount *= 100;
            nMinRangeBetAmount *= 100;
            nMaxRangeBetAmount *= 100;

            if (balanceSatoshis < 100) {
                return new Error('Not enough bits to play');
            }

            if (betInvalid) {
                return new Error(betInvalid);
            }
            if (autoCashOutInvalid) {
                return new Error(autoCashOutInvalid);
            }

            var totalBetAmount = betBet + betExtraBet;
            var totlaRangeBetAmount = 0;
            Object.keys(betRangeBet).forEach(function(rangeID) {
                var index = '#id_inputRangeBetAmount_' + rangeID;
                var rangeAmount = $(index).val();
                if(rangeAmount == '' || rangeAmount == undefined || rangeAmount == null)
                    totlaRangeBetAmount += 0;
                else
                    totlaRangeBetAmount += parseInt(rangeAmount) * 100;
            });

            totalBetAmount += totlaRangeBetAmount;

            if (balanceSatoshis < totalBetAmount) {
                return new Error('Not enough bits');
            }

            if(totalBetAmount == 0) {
                return new Error('Bet amount cannot be 0');
            }

            if(betBet > 0 &&  betRangeBet == 0) {
                if (betBet < nMinBetAmount || betBet > nMaxBetAmount) {
                    return new Error('bet amount is invalid.');
                }
                if ((betExtraBet > 0 && betExtraBet < nMinExtraBetAmount) || betExtraBet > nMaxExtraBetAmount) {
                    return new Error('extra-bet amount is invalid.');
                }
            } else if(betBet == 0 && betExtraBet == 0 && totalBetAmount > 0) {
                if ((totalBetAmount > 0 && totalBetAmount < nMinRangeBetAmount) || totalBetAmount > nMaxRangeBetAmount) {
                    return new Error('range-bet amount is invalid.');
                }
            }
            return true;
        }
    };
});