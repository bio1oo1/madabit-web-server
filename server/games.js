
var timeago = require('timeago');
var database = require('./database');

/**
  * GET
  * Public API
  * Show a single game info
  **/
exports.show = function (req, res, next) {
    var user = req.user;
    var gameId = parseInt(req.params.id);

    if (!gameId || typeof gameId !== 'number') { return res.render('404'); }
    database.getGame(gameId, function (err, game) {
        if (err) {
            if (err === 'GAME_DOES_NOT_EXISTS') { return res.render('404'); }

            return next(new Error('Unable to get game: \n' + err));
        }

        database.getGamesPlays(game.id, function (err, plays) {
            if (err) { return next(new Error('Unable to get game information: \n' + err)); } // If getGame worked this should work too

            game.timeago = timeago(game.created);
            res.render('game', {
                game: game,
                plays: plays,
                user: user
            });
        });
    });
};

/**
  * GET
  * Public API
  * Shows the leader board
  **/
exports.leaderboard = function (req, res, next) {
    var user = req.user;
    var by = req.query.by;

    var byDb, order;
    switch (by) {
        case 'net_desc':
            byDb = 'net_profit';
            order = 'DESC';
            break;
        case 'net_asc':
            byDb = 'net_profit';
            order = 'ASC';
            break;
        case 'agent_desc':
            byDb = 'agent_profit';
            order = 'DESC';
            break;
        case 'agent_asc':
            byDb = 'agent_profit';
            order = 'ASC';
            break;
        default :
            byDb = 'gross_profit';
            order = 'DESC';
    }

    database.getLeaderBoard(byDb, order, function (err, leaders) {
        if (err) { return next(new Error('Unable to get leader board: \n' + err)); }

        res.render('leaderboard', {
            user: user,
            leaders: leaders,
            sortBy: byDb,
            order: order
        });
    });
};

/**
  * POST
  * PUBLIC API
  * Get Top 5 Players
  */
exports.getLeaderboardTop5 = function (req, res, next) {
    database.getLeaderBoardTop5(function (err, leadersTop5) {
        if (err) { return next(new Error('Unable to get top 5 leader board: \n' + err)); }
        res.send(leadersTop5);
    });
};
