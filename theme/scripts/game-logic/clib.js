define([
    'seedrandom',
    'lodash',
    'constants/AppConstants'
], function (
    Seedrandom,
    _,
    AppConstants
) {
    var rng;

    function formatSatoshis (n, decimals) {
        return formatDecimals(n / 100, decimals);
    }

    function formatDecimals (n, decimals) {
        if (typeof decimals === 'undefined') {
            if (n % 100 === 0) { decimals = 0; } else { decimals = 2; }
        }

        var original = n.toFixed(decimals);
        var aryOriginal = original.split('.');
        if (aryOriginal.length == 1) {
            return original.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
        }

        return aryOriginal[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,') + '.' + aryOriginal[1];
    }

    return {
        formatSatoshis: formatSatoshis,

        formatDecimals: formatDecimals,

        payout: function (betSize, ms) {
            return betSize * Math.pow(Math.E, (0.00006 * ms));
        },

        payoutTime: function (betSize, payout) {
            return Math.log(payout / betSize) / 0.00006;
        },

        seed: function (newSeed) {
            rng = Seedrandom(newSeed);
        },

        parseBet: function (betString, minBet, maxBet, maxBetStop) {
            betString = String(betString);

            if (!/^\d+k*$/.test(betString)) { return new Error('Bet may only contain digits, and k (to mean 1000)'); }

            var bet = parseInt(betString.replace(/k/g, '000'));

            if (_.isNaN(bet) || Math.floor(bet) !== bet) {
                console.log('The bet should be an integer greater than or equal to one');
                return new Error('The bet should be an integer greater than or equal to one');
            }

            if (bet < minBet) {
                console.log('The bet should be at least ' + minBet + ' bits.');
                return new Error('The bet should be at least ' + minBet + ' bits.');
            }

            if (bet > maxBet) {
                console.log('The bet should be at most ' + maxBet + ' bits.');
                return new Error('The bet should be at most ' + maxBet + ' bits.');
            }

            if (bet > maxBetStop) {
                console.log('The bet should not be greater than max-bet-stop.');
                return new Error('The bet should not be greater than max-bet-stop.');
            }

            // if (bet * 100 > AppConstants.Engine.MAX_BET)
            //     return new Error('The bet must be less no more than ' + formatSatoshis(AppConstants.Engine.MAX_BET) + ' bits');

            return bet;
        },

        parseExtraBet: function (extraBetString, minExtraBet, maxExtraBet) {
            extraBetString = String(extraBetString);

            if (!/^\d+k*$/.test(extraBetString)) { return new Error('Extra-Bet may only contain digits, and k (to mean 1000)'); }

            var extraBet = parseInt(extraBetString.replace(/k/g, '000'));

            if (_.isNaN(extraBet) || Math.floor(extraBet) !== extraBet) {
                console.log('The extra-bet should be an integer greater than or equal to one');
                return new Error('The extra-bet should be an integer greater than or equal to one');
            }

            if (extraBet > 0 && extraBet < minExtraBet) {
                console.log('The extra-bet should be at least ' + minExtraBet + ' bits.');
                return new Error('The extra-bet should be at least ' + minExtraBet + ' bits.');
            }

            if (extraBet > maxExtraBet) {
                console.log('The extra-bet should be at most ' + maxExtraBet + ' bits.');
                return new Error('The extra-bet should be at most ' + maxExtraBet + ' bits.');
            }

            // if (extraBet * 100 > AppConstants.Engine.MAX_EXTRA_BET)
            //     return new Error('The extra-bet must be less no more than ' + formatSatoshis(AppConstants.Engine.MAX_BET) + ' bits');

            return extraBet;
        },

        parseRangeBet: function (rangeBetMap, minRangeBet, maxRangeBet) {
            var rangeBetString = 0;
            Object.keys(rangeBetMap).forEach(function(id) {
                rangeBetString = rangeBetMap[id];
                if(rangeBetString != undefined && rangeBetString != null && rangeBetString != '') {
                    rangeBetString = String(rangeBetString);

                    if (!/^\d+k*$/.test(rangeBetString)) {
                        return new Error('Extra-Bet may only contain digits, and k (to mean 1000)');
                    }

                    var rangeBet = parseInt(rangeBetString.replace(/k/g, '000'));

                    if (_.isNaN(rangeBet) || Math.floor(rangeBet) !== rangeBet) {
                        console.log('The extra-bet should be an integer greater than or equal to one');
                        return new Error('The extra-bet should be an integer greater than or equal to one');
                    }

                    if (rangeBet > 0 && rangeBet < minRangeBet) {
                        console.log('The extra-bet should be at least ' + minRangeBet + ' bits.');
                        return new Error('The extra-bet should be at least ' + minRangeBet + ' bits.');
                    }

                    if (rangeBet > maxRangeBet) {
                        console.log('The extra-bet should be at most ' + maxRangeBet + ' bits.');
                        return new Error('The extra-bet should be at most ' + maxRangeBet + ' bits.');
                    }
                }
            });

            return 0;
        },

        parseAutoCash: function (autoCashString) {
            var co = autoCashString;

            if (!/^\d+(\.\d{1,2})?$/.test(co)) { return new Error('Invalid auto cash out amount'); }

            co = parseFloat(co);
            console.assert(!_.isNaN(co));

            if (co < 1) { return new Error('The auto cash out amount should be bigger than 1'); }

            return co;
        },

        winProb: function (amount, cashOut) {
            // The cash out factor that we need to get the cashOut with our wager.
            var factor = Math.ceil(100 * cashOut / amount);

            /* The probability that the second phase of the RNG chooses a lower
             crash point. This is derived in the following way:

             Let r be a random variable uniformly distributed on [0,1) and let
             p be 1/(1-r). Then we need to calculate the probability of
             floor(100 * (p - (p - 1)*0.01)) < factor

             Using the fact that factor is integral and solving for r yields
             r < 1 - 99 / (f-1)

             Because r is uniformly distributed the probability is identical
             to the right hand side.

             Combining with the first phase of the RNG we get the probability
             of losing
             1/101 + 100/101 * (1 - 99 / (factor-1))
             and the win probability
             1 - 1/101 - 100/101 * (1 - 99 / (factor-1)).
             = 100/101 - 100/101 * (1 - 99 / (factor-1))
             = 100/101 * (1 - (1 - 99 / (factor-1))
             = 100/101 * (99 / (factor-1))
             = 100/101 * (99 / (factor-1))
             = 9900 / (101*(factor-1))
             */
            return 9900 / (101 * (factor - 1));
        },

        profit: function (amount, cashOut) {
            // The factor that we need to get the cash out with our wager.
            var factor = Math.ceil(100 * cashOut / amount);

            // We calculate the profit with the factor instead of using the
            // difference between cash out and wager amount.
            return amount * (factor - 100) / 100;
        },

        houseExpectedReturn: function (amount, cashOut) {
            var p1, p2, p3;
            var v1, v2, v3;

            // Instant crash.
            p1 = 1 / 101;
            v1 = amount;

            // Player win.
            p2 = this.winProb(amount, cashOut);
            v2 = -0.01 * amount - this.profit(amount, cashOut);

            // Player loss.
            p3 = 1 - p1 - p2;
            v3 = 0.99 * amount;

            // Expected value.
            return p1 * v1 + p2 * v2 + p3 * v3;
        },

        capitaliseFirstLetter: function (string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        },

        isInteger: function (nVal) {
            return typeof nVal === 'number' && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
        },

        isNumber: function (nVal) {
            return typeof nVal === 'number' && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992;
        },

        // Returns plural or singular, for a given amount of bits.
        grammarBits: function (bits) {
            return bits <= 100 ? 'bit' : 'bits';
        },

        // Calculate the payout based on the time
        growthFunc: function (ms) {
            console.assert(typeof ms === 'number' && ms >= 0);
            var r = 0.00006;
            return Math.floor(100 * Math.pow(Math.E, r * ms)) / 100;
        },

        // A better name
        calcGamePayout: function (ms) {
            var gamePayout = this.growthFunc(ms);
            console.assert(isFinite(gamePayout));
            return gamePayout;
        },

        // Returns the current payout and stops when lag, use this time to calc game payout with lag
        getElapsedTimeWithLag: function (engine) {
            if (engine.gameState == 'IN_PROGRESS') {
                var elapsed;
                if (engine.lag) { elapsed = engine.lastGameTick - engine.startTime + AppConstants.Engine.STOP_PREDICTING_LAPSE; } // + STOP_PREDICTING_LAPSE because it looks better
                else { elapsed = this.getElapsedTime(engine.startTime); }

                return elapsed;
            } else {
                return 0;
            }
        },

        // Just calculates the elapsed time
        getElapsedTime: function (startTime) {
            return Date.now() - startTime;
        },

        isMobileOrSmall: function () {
            return window.getComputedStyle(document.getElementById('handheld-detection'), null).display == 'none';
        },

        loadCss: function (url, id) {
            var link = document.createElement('link');
            link.type = 'text/css';
            link.rel = 'stylesheet';
            link.href = url;
            link.id = id;
            document.getElementsByTagName('head')[0].appendChild(link);
        },

        removeCss: function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        },

        localOrDef: function (name, defaultValue) {
            return localStorage[name] ? localStorage[name] : defaultValue;
        },

        isInvalidUsername: function (username) {
            if (typeof username !== 'string') return 'NOT_STRING';
            if (username.length === 0) return 'NOT_PROVIDED';
            if (username.length < 3) return 'TOO_SHORT';
            if (username.length > 50) return 'TOO_LONG';
            if (!/^[a-z0-9_\-]*$/i.test(username)) return 'INVALID_CHARS';
            if (username === '__proto__') return 'INVALID_CHARS';
            return false;
        }

    };
});
