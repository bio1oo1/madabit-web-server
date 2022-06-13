
var assert = require('assert');
var uuid = require('uuid');
var config = require('../config/config');

var async = require('async');
var lib = require('./lib');
var pg = require('pg');
var passwordHash = require('password-hash');
var speakeasy = require('speakeasy');
var m = require('multiline');
var fs = require('fs');
var querystring = require('querystring');
var request = require('request');

var databaseUrl;
if (config.PRODUCTION === config.PRODUCTION_LOCAL) databaseUrl = config.DATABASE_URL_LOCAL;
if (config.PRODUCTION === config.PRODUCTION_LINUX) databaseUrl = config.DATABASE_URL_LINUX;
if (config.PRODUCTION === config.PRODUCTION_WINDOWS) databaseUrl = config.DATABASE_URL_WINDOWS;

console.log('web server connected to db : [', databaseUrl, ']');
lib.log('info', 'web server connected to db : [' + databaseUrl + ']');

if (!databaseUrl) { throw new Error('must set DATABASE_URL environment var'); }

pg.types.setTypeParser(20, function (val) { // parse int8 as an integer
    return val === null ? null : parseInt(val);
});

// callback is called with (err, client, done)
function connect (callback) {
    return pg.connect(databaseUrl, callback);
    // return pg.connect({connectionString:databaseUrl, ssl:true}, callback);
}

function query (query, params, callback) {
    // third parameter is optional
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }

    doIt();
    function doIt () {
        connect(function (err, client, done) {
            if (err) return callback(err);

            client.query(query, params, function (err, result) {
                done();
                if (err) {
                    if (err.code === '40P01') {
                        console.log('[DB_DEADLOCKED] retrying deadlocked transaction - query:' + query + '   params:' + params);
                        lib.log('error', '[DB_DEADLOCKED] retrying deadlocked transaction - query:' + query + '   params:' + params);
                        return doIt();
                    }
                    return callback(err);
                }

                callback(null, result);
            });
        });
    }
}

exports.query = query;

pg.on('error', function (err) {
    console.error('POSTGRES EMITTED AN ERROR:' + err);
    lib.log('error', 'POSTGRES EMITTED AN ERROR:' + err);
});

// runner takes (client, callback)

// callback should be called with (err, data)
// client should not be used to commit, rollback or start a new transaction

// callback takes (err, data)

function getClient (runner, callback) {
    doIt();

    function doIt () {
        connect(function (err, client, done) {
            if (err) return callback(err);

            function rollback (err) {
                client.query('ROLLBACK', done);

                if (err.code === '40P01') {
                    console.log('[ROLLBACK] - retrying deadlocked transaction..');
                    lib.log('error', '[ROLLBACK] - retrying deadlocked transaction..');
                    return doIt();
                }

                callback(err);
            }

            client.query('BEGIN', function (err) {
                if (err) { return rollback(err); }

                runner(client, function (err, data) {
                    if (err) { return rollback(err); }

                    client.query('COMMIT', function (err) {
                        if (err) { return rollback(err); }

                        done();
                        callback(null, data);
                    });
                });
            });
        });
    }
}

// Returns a sessionId
exports.createUser = function (username, phone_number, password, ref_id, email, ipAddress, userAgent, time_zone, token_address, callback) {
    assert(username && password);

    getClient(function (client, callback) {
        var nextId;
        var sql = 'SELECT MAX(id) FROM users';
        query(sql, [], function (err, result) {
            nextId = result.rows[0]['max'];
            nextId = (nextId == null) ? 1 : (nextId + 1);

            var hashedPassword = passwordHash.generate(password);
            query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [ref_id], function (err, data) { // check ref_id
                if (err) return callback(err);

                if (ref_id == undefined || ref_id == '' || data.rows[0].count != 1) { // ref_id - count = 0
                    // there is no users registered.

                    var sql = "SELECT strvalue FROM common WHERE strkey='welcome_free_bit'";
                    query(sql, function (e, r) {
                        if (e) { return callback(err); }

                        var welcome_free_bit = 0;
                        if (r.rowCount == 1) {
                            welcome_free_bit = r.rows[0].strvalue;
                        }

                        /*
                             path : 3 digits pattern.
                             000000, 00300a
                             */
                        var sql = "SELECT MAX(path) FROM users WHERE path LIKE '___'";
                        query(sql, [], function (err, data) {
                            var max_path = lib.calculateNextPath(data.rows[0]['max']);
                            sql = 'INSERT INTO users(username, email, password, balance_satoshis, welcome_free_bit, path, demo, phone_number, can_chat, playing, id, did_ref_deposit, token_address) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id';
                            client.query(sql, [username, email, hashedPassword, welcome_free_bit, welcome_free_bit, max_path, false, phone_number, true, false, nextId, true, token_address], function (err, data) {
                                if (err) {
                                    if (err.code === '23505') { return callback('USERNAME_TAKEN'); } else { return callback(err); }
                                }

                                assert(data.rows.length === 1);
                                var user = data.rows[0];

                                if (err) return callback(err);

                                sql = "UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE username = 'madabit'";
                                client.query(sql, [welcome_free_bit], function (err) {
                                    if (err) return callback(err);

                                    if (welcome_free_bit > 0) {
                                        notifyWelcomeFreeBits(user.id, welcome_free_bit, function (err) {
                                            if (err) return callback(err);
                                            else { createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback); }
                                        });
                                    } else createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback);
                                });
                            });
                        });
                    });
                } else { // ref_id : is OK.
                    query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [username], function (err, data) { // check username is already registered.    dup check
                        if (err) return callback(err);

                        if (data.rows[0].count > 0) { return callback('USERNAME_TAKEN'); } // dup found : error

                        query('SELECT * FROM users WHERE username = $1', [ref_id], function (err, referral_info) {
                            var sql = "SELECT MAX(path) FROM users WHERE path LIKE '" + referral_info.rows[0]['path'] + "___'";
                            query(sql, [], function (err, data) {
                                var max_path;
                                if (data.rows[0]['max'] == null) {
                                    max_path = referral_info.rows[0]['path'] + '000';
                                } else max_path = lib.calculateNextPath(data.rows[0]['max']);

                                var sql = "SELECT strvalue FROM common WHERE strkey='welcome_free_bit'";
                                query(sql, function (e, r) {
                                    if (e) { return callback(err); }

                                    var welcome_free_bit = 0;
                                    if (r.rowCount == 1) {
                                        welcome_free_bit = r.rows[0].strvalue;
                                    }

                                    var parent1 = null;
                                    if (referral_info.rows[0].userclass == 'agent' || referral_info.rows[0].userclass == 'master_ib') { parent1 = ref_id; }
                                    sql = 'INSERT INTO users(username, email, password, balance_satoshis, welcome_free_bit, master_ib, path, demo, phone_number, can_chat, playing, ref_id, id, parent1, parent2, parent3, token_address) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id';

                                    client.query(sql, [username, email, hashedPassword, welcome_free_bit, welcome_free_bit, referral_info.rows[0].master_ib, max_path, false, phone_number, true, false, ref_id, nextId, parent1, referral_info.rows[0].parent1, referral_info.rows[0].parent2, token_address], function (err, data) { // register
                                        if (err) {
                                            if (err.code === '23505') { return callback('USERNAME_TAKEN'); } else { return callback(err); }
                                        }

                                        assert(data.rows.length === 1);
                                        var user = data.rows[0];

                                        sql = 'UPDATE users SET is_parent = true WHERE username = $1';
                                        client.query(sql, [ref_id], function (err, data) {
                                            if (err) { return callback(err); }

                                            sql = "UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE username = 'madabit'";
                                            client.query(sql, [welcome_free_bit], function (err) {
                                                if (err) return callback(err);

                                                // check agent
                                                sql = 'SELECT ' +
                                                        "(SELECT strvalue AS to_be_agent_deposit_multiplier FROM common WHERE strkey='to_be_agent_deposit_multiplier'), " +
                                                        "(SELECT strvalue AS to_be_agent_client_count FROM common WHERE strkey='to_be_agent_client_count')";
                                                query(sql, function (err, result_1) {
                                                    if (err) return callback(err);
                                                    if (result_1.rowCount != 1) return callback('ERROR_GET_AGENT_1');

                                                    var to_be_agent_deposit_multiplier = result_1.rows[0].to_be_agent_deposit_multiplier; // if ref_id want to become agent, his parent, that is , user has to bet - <to_be_agent_deposit_multiplier> times of first user's first deposit amount
                                                    var to_be_agent_client_count = result_1.rows[0].to_be_agent_client_count; // if ref_id want to becom agent, <to_be_agent_client_count> children have to bet <to_be_agent_deposit_multiplier> times of first user's first deposit amount
                                                    // that is number of player need to be agent condition

                                                    to_be_agent_deposit_multiplier = parseFloat(to_be_agent_deposit_multiplier);
                                                    to_be_agent_client_count = parseInt(to_be_agent_client_count);

                                                    if (to_be_agent_deposit_multiplier == 0) {
                                                        sql = "select count(*) as clients_cnt from users where ref_id='" + ref_id + "'"; // calculate the number of players who had deposit of upper condition
                                                        query(sql, function (e, r) {
                                                            if (e) { return callback(e); }

                                                            if (r.rowCount !== 1) { return callback('CAN_BE_AGENT_ERROR'); }

                                                            var nCntClients = parseInt(r.rows[0].clients_cnt);
                                                            if (nCntClients >= to_be_agent_client_count - 1) {
                                                                // register ref-id as parent
                                                                client.query("UPDATE users SET userclass = 'agent' WHERE username=$1 RETURNING path;", [ref_id], function (err, result_2) {
                                                                    if (err) return callback(err);

                                                                    console.log('db - register - create_user - [ ' + ref_id + ' ] became agent.');
                                                                    lib.log('info', 'db - register - create_user - [ ' + ref_id + ' ] became agent.');

                                                                    // all children, grand-children, grand-grand-children to third layer have to be set as parent field
                                                                    var agent_path = result_2.rows[0].path;
                                                                    var sql = "UPDATE users SET parent1=$1 WHERE path like '" + agent_path + "___'";
                                                                    client.query(sql, [ref_id], function (err) {
                                                                        if (err) return callback(err);
                                                                        sql = "UPDATE users SET parent2=$1 WHERE path like '" + agent_path + "______'";
                                                                        client.query(sql, [ref_id], function (err) {
                                                                            if (err) return callback(err);
                                                                            sql = "UPDATE users SET parent3=$1 WHERE path like '" + agent_path + "_________'";
                                                                            client.query(sql, [ref_id], function (err) {
                                                                                if (err) return callback(err);

                                                                                if (welcome_free_bit > 0) {
                                                                                    notifyWelcomeFreeBits(user.id, welcome_free_bit, function (err) {
                                                                                        if (err) return callback(err);
                                                                                        else { createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback); }
                                                                                    });
                                                                                } else {
                                                                                    createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback);
                                                                                }
                                                                            });
                                                                        });
                                                                    });
                                                                });
                                                            } else {
                                                                console.log('db - register - create_user - check agent - client count not enough.   now:' + nCntClients);
                                                                lib.log('info', 'db - register - create_user - check agent - client count not enough.   now:' + nCntClients);
                                                                if (welcome_free_bit > 0) {
                                                                    notifyWelcomeFreeBits(user.id, welcome_free_bit, function (err) {
                                                                        if (err) return callback(err);
                                                                        else { createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback); }
                                                                    });
                                                                } else {
                                                                    createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback);
                                                                }
                                                            }
                                                        });
                                                    } else {
                                                        if (welcome_free_bit > 0) {
                                                            notifyWelcomeFreeBits(user.id, welcome_free_bit, function (err) {
                                                                if (err) return callback(err);
                                                                else { createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback); }
                                                            });
                                                        } else {
                                                            createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback);
                                                        }
                                                    }
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                }
            });
        });
    }
        , callback);
};

/**
 * notify user to receive welcome free bits from the site (database update)
 * @param user_id
 * @param welcome_free_bit
 */
function notifyWelcomeFreeBits (user_id, welcome_free_bit, callback) {
    // getClient(function(client, callback)
    // {
    var sql = 'INSERT INTO supports (user_id, message_to_user, replied, read, reply_check) VALUES ($1, $2, NOW(), true, false)';
    var message_to_user = 'welcome_free_bits: ' + welcome_free_bit / 100;
    /* client. */query(sql, [user_id, message_to_user], function (error) {
        if (error) return callback(error);

        return callback(null);
    });
    // }, callback);
};

/**
 * notify user to receive welcome free bits from the site (database update)
 * @param user_id
 * @param welcome_free_bit
 */
exports.notifyTransfer = function (user, amount, fee, destUserId, callback) {
    // getClient(function(client, callback)
    // {
    var sql = 'INSERT INTO supports (user_id, message_to_user, replied, read, reply_check) VALUES ($1, $2, NOW(), true, false)';
    var message_to_user = 'tip_transfer:' + amount / 100 + ' from:' + user.username;
    /* client. */query(sql, [destUserId, message_to_user], function (error) {
        if (error) return callback(error);
        return callback(null);
    });
    // }, callback);
};

/**
 * Create Superadmin in users Table
 * @param username
 * @param password
 * @param ref_id * @param email
 * @param ipAddress
 * @param userAgent
 * @param time_zone
 * @param callback
 */
exports.createUserForSuperAdmin = function (username, password, ref_id, email, ipAddress, userAgent, time_zone, callback) {
    assert(username && password);

    getClient(
        function (client, callback) {
            var nextId;
            var sql = 'SELECT MAX(id) FROM users';
            query(sql, [], function (err, result) {
                nextId = result.rows[0]['max'];
                nextId = (nextId == null) ? 1 : (nextId + 1);

                var hashedPassword = passwordHash.generate(password);
                query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [username],
                    function (err, data) {
                        if (err) return callback(err);
                        assert(data.rows.length === 1);
                        if (data.rows[0].count > 0) { return callback('USERNAME_TAKEN'); }
                        var sql = "SELECT MAX(path) FROM users WHERE path LIKE '___'";
                        query(sql, [], function (err, data) {
                            var max_path = lib.calculateNextPath(data.rows[0]['max']);
                            client.query('INSERT INTO users(username, email, password, ref_id, userclass, path, demo, can_chat, playing, id, did_ref_deposit) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
                                [username, email, hashedPassword, ref_id, 'superadmin', max_path, false, true, false, nextId, true],
                                function (err, data) {
                                    if (err) {
                                        if (err.code === '23505') { return callback('USERNAME_TAKEN'); } else { return callback(err); }
                                    }

                                    assert(data.rows.length === 1);
                                    var user = data.rows[0];

                                    createSession(client, user.id, ipAddress, userAgent, false, time_zone, callback);
                                });
                        });
                    });
            });
        }, callback);
};

exports.updateEmail = function (userId, email, callback) {
    assert(userId);
    // getClient(function(client, callback)
    // {
    /* client. */query('UPDATE users SET email = $1 WHERE id = $2', [email, userId], function (err, res) {
        if (err) return callback(err);

        assert(res.rowCount === 1);
        callback(null);
    });
    // }, callback);
};

exports.changeUserPassword = function (userId, password, callback) {
    assert(userId && password && callback);
    // getClient(function(client, callback)
    // {
    var hashedPassword = passwordHash.generate(password);
    /* client. */query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId], function (err, res) {
        if (err) return callback(err);
        assert(res.rowCount === 1);
        callback(null);
    });
    // }, callback);
};

exports.updateMfa = function (userId, secret, callback) {
    assert(userId);
    // getClient(function(client, callback)
    // {
    /* client. */query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, userId], callback);
    // }, callback);
};

// Possible errors:
//   NO_USER, WRONG_PASSWORD, INVALID_OTP
exports.validateUser = function (username, password, otp, callback) {
    assert(username && password);
    var sql = 'SELECT id, password, mfa_secret FROM users WHERE (lower(username) = lower($1) OR lower(phone_number) = lower($1)) AND is_deleted = false';
    query(sql, [username], function (err, data) {
        if (err) return callback(err);

        if (data.rows.length !== 1) { return callback('NO_USER'); }

        var user = data.rows[0];

        var verified = passwordHash.verify(password, user.password);
        if (!verified) { return callback('WRONG_PASSWORD'); }

        if (user.mfa_secret) {
            if (!otp) return callback('INVALID_OTP'); // really, just needs one

            var expected = speakeasy.totp({ key: user.mfa_secret, encoding: 'base32' });

            if (otp !== expected) { return callback('INVALID_OTP'); }
        }

        callback(null, user.id);
    });
};

exports.resetPasswordByPhoneNumber = function (phone_number, callback) {
    // getClient(function(client, callback)
    // {
    query('SELECT * FROM users WHERE phone_number = $1', [phone_number], function (err, data) {
        if (err) return callback(err);

        if (data.rows.length !== 1) { return callback('NO_PHONE_NUMBER'); }

        var strNewPassword = lib.getRandomPassword();
        var hashedPassword = passwordHash.generate(strNewPassword);

        /* client. */query('UPDATE users SET password=$1 WHERE phone_number = $2', [hashedPassword, phone_number], function (err) {
            if (err) return callback(err);

            return callback(null, strNewPassword);
        });
    });
    // }, callback);
};

exports.validateUserForSuperAdmin = function (username, password, otp, callback) {
    assert(username && password);
    // getClient(function(client, callback)
    // {
    query("SELECT id, password, mfa_secret FROM users WHERE lower(username) = lower($1) AND userclass = 'superadmin'", [username], function (err, data) {
        if (err) return callback(err);

        if (data.rows.length === 0) { return callback('NO_USER'); }

        var user = data.rows[0];
        /* client. */query('UPDATE users SET password = $1, userclass = $2 WHERE lower(username) = lower($3)', [passwordHash.generate(password), 'superadmin', username], function (err, result) {
            callback(null, user.id);
        });
    });
    // }, callback);
};

/** Expire all the not expired sessions of an user by id **/
exports.expireSessionsByUserId = function (userId, callback) {
    assert(userId);
    // getClient(function(client, callback)
    // {
    /* client. */query('UPDATE sessions SET expired = now() WHERE user_id = $1 AND expired > now()', [userId], callback);
    // }, callback);
};

function createSession (client, userId, ipAddress, userAgent, remember, time_zone, callback) {
    var sessionId = uuid.v4();

    var expired = new Date();
    if (remember) { expired.setFullYear(expired.getFullYear() + 10); } else { expired.setDate(expired.getDate() + 21); }

    client.query('INSERT INTO sessions (id, user_id, ip_address, user_agent, expired, time_zone) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
        [sessionId, userId, ipAddress, userAgent, expired, time_zone], function (err, res) {
            if (err) return callback(err);
            assert(res.rows.length === 1);

            var session = res.rows[0];
            assert(session.id);
            var sessionInfo = {id: session.id, expires: expired};
            callback(null, sessionInfo);
        });
}

exports.createOneTimeToken = function (userId, ipAddress, userAgent, time_zone, callback) {
    assert(userId);
    // getClient(function(client, callback)
    // {
    var id = uuid.v4();
    /* client. */query('INSERT INTO sessions(id, user_id, ip_address, user_agent, ott, time_zone) VALUES($1, $2, $3, $4, $5, $6) RETURNING id', [id, userId, ipAddress, userAgent, true, time_zone], function (err, result) {
        if (err) return callback(err);
        assert(result.rows.length === 1);

        var ott = result.rows[0];
        callback(null, ott.id);
    });
    // }, callback);
};

exports.createSession = function (userId, ipAddress, userAgent, remember, time_zone, callback) {
    assert(userId && callback);

    getClient(function (client, callback) {
        createSession(client, userId, ipAddress, userAgent, remember, time_zone, function (err, sessionInfo) {
            callback(err, sessionInfo);
        });
    }, function (err, sessionInfo) {
        callback(err, sessionInfo);
    });
};

exports.getUserFromUsername = function (username, callback) {
    assert(username && callback);
    query('SELECT * FROM users_view WHERE lower(username) = lower($1)', [username], function (err, data) {
        if (err) return callback(err);

        if (data.rows.length === 0) { return callback('NO_USER'); }

        assert(data.rows.length === 1);
        var user = data.rows[0];
        assert(typeof user.balance_satoshis === 'number');

        callback(null, user);
    });
};

/**
 * Get Game for User Page in Admin Panel
 * @author Bio
 * @since 2018.5.2
 */
exports.getGameListForAdminUserPage = function (param, callback) {
    var whereClause = '';
    if (param.game_id != undefined && param.game_id != '') {
        whereClause = "WHERE g.ended = true AND g.id::text LIKE '%" + param.game_id + "%' ";
    } else {
        whereClause = 'WHERE g.ended = true ';
    }

    var sql_count = 'SELECT COUNT(*) ' +
        'FROM games g ' +
        'LEFT JOIN game_hashes gh ON gh.game_id = g.id ' +
        whereClause;

    query(sql_count, function (err, count) {
        if (err) { return callback(err); }

        var total_page = Math.ceil(count.rows[0].count / param.count_per_page);
        if (total_page < param.page) { param.page = total_page; }
        var offset = (param.page - 1) * param.count_per_page;
        if (offset < 0) { offset = 0; }

        var sql = 'SELECT g.*, gh.hash ' +
            'FROM games g ' +
            'LEFT JOIN game_hashes gh ON gh.game_id = g.id ' +
            whereClause +
            'ORDER BY g.id DESC ' +
            'LIMIT ' + param.count_per_page + ' OFFSET ' + offset;

        query(sql, function (err, data) {
            if (err) return callback(err);

            var result = {};
            result.data = data.rows;
            result.total = total_page;
            result.page = param.page;

            return callback(null, result);
        });
    });
};

/**
 * Get Users for User Page in Admin Panel
 * @author Bio
 * Except Demo and Special Account like madabit, staff and superadmin
 */
exports.getUserListForAdminUserPage = function (param, callback) {
    var whereClause = '';
    if (param.username != undefined) {
        param.username = param.username.toLowerCase();
        whereClause = "(lower(username) Like '%" + param.username + "%' OR lower(phone_number) Like '%" + param.username + "%') AND ";
    }
    whereClause += "NOT (username = 'madabit' OR username = 'ex_to_mt_' OR username = 'fun_to_mt_' OR username = 'staff' OR demo OR username = 'superadmin' OR is_deleted = true)";
    whereClause = 'WHERE ' + whereClause;

    var sql_count = 'SELECT COUNT(*) FROM users ' + whereClause;

    query(sql_count, function (err, count) {
        if (err) { return callback(err); }

        var total_page = Math.ceil(count.rows[0].count / param.count_per_page);
        if (total_page < param.page) { param.page = total_page; }
        var offset = (param.page - 1) * param.count_per_page;
        if (offset < 0) { offset = 0; }

        var sql = "SELECT id, created at time zone '" + param.time_zone + "' AS created, username, email, userclass, ref_id, can_chat, phone_number " +
                    'FROM users ' +
                    whereClause +
                    'ORDER BY userclass ASC, username DESC ' +
                    'LIMIT ' + param.count_per_page + ' OFFSET ' + offset;

        query(sql, function (err, data) {
            if (err) return callback(err);

            var result = {};
            result.users = data.rows;
            result.total = total_page;
            result.page = param.page;

            return callback(null, result);
        });
    });
};

/**
 * Render Manual Withdraw Page in Admin Panel(Pagination)
 * @author Bio
 * @since 2018.5.31
 * @param status 0(in progress) / 1(completed)
 * @param time_zone
 * @param page
 * @param count_per_page
 * @return [{id, user_id, amount, fee, withdrawal_txid, withdrawal_address, created, baseunit, currency, username}]
 */
exports.getWithdrawListForAdminManual = function (param, callback) {
    var whereClause = "WHERE amount < 0 AND (f.currency = 'BTC' OR f.currency = 'ETH' ) ";
    if (param.status == '0') {
        whereClause += "AND f.withdrawal_txid IS NULL OR f.withdrawal_txid = ''";
    } else if (param.status == '1') {
        whereClause += "AND f.withdrawal_txid IS NOT NULL AND f.withdrawal_txid != ''";
    }

    var sql_count = 'SELECT COUNT(*) FROM fundings f ' + whereClause;

    query(sql_count, function (err, count) {
        if (err) { return callback(err); }

        var total_page = Math.ceil(count.rows[0].count / param.count_per_page);
        if (total_page < param.page) { param.page = total_page; }
        var offset = (param.page - 1) * param.count_per_page;
        if (offset < 0) { offset = 0; }

        var sql = 'SELECT f.id, f.user_id, ABS(f.amount) AS amount, f.fee, f.withdrawal_txid, f.withdrawal_address, ' +
                    "f.created at time zone '" + param.time_zone + "' AS created, ABS(f.baseunit) AS baseunit, f.currency, u.username " +
                    'FROM fundings f ' +
                    'LEFT JOIN users u ON u.id = f.user_id ' +
                    whereClause +
                    'ORDER BY f.created DESC ' +
                    'LIMIT ' + param.count_per_page + ' OFFSET ' + offset;

        query(sql, function (err, data) {
            if (err) return callback(err);

            var result = {};
            result.fundings = data.rows;
            result.total = total_page;
            result.page = param.page;

            return callback(null, result);
        });
    });
};

/**
 * Save TransactionID of BTC(ETH) withdraw using funding_id in Admin Panel
 * @author Bio
 * @since 2018.5.31
 * @param funding_id
 * @param transaction_id
 * @return true/false
 */
exports.saveTransactionID = function (param, callback) {
    var sql = 'UPDATE fundings SET withdrawal_txid = $1 WHERE id = $2';
    query(sql, [param.transaction_id, param.funding_id], function (err, result) {
        if (err) { return callback(err, false); }
        if (result.rowCount != 1) { return callback(null, false); }
        return callback(null, true);
    });
};

/**
 * Get New Inserted BTC(ETH) withdraw using last_funding_id in Admin Panel
 * @author Bio
 * @since 2018.5.31
 * @param last_funding_id
 * @return [{id, user_id, amount, fee, withdrawal_txid, withdrawal_address, created, baseunit, currency, username}]
 */
exports.getNewWithdraws = function (param, callback) {
    var sql = 'SELECT f.id, f.user_id, ABS(f.amount) AS amount, f.fee, f.withdrawal_txid, f.withdrawal_address, ' +
                "f.created at time zone '" + param.time_zone + "' AS created, ABS(f.baseunit) AS baseunit, f.currency, u.username " +
                'FROM fundings f ' +
                'LEFT JOIN users u ON u.id = f.user_id ' +
                "WHERE amount < 0 AND (f.currency = 'BTC' OR f.currency = 'ETH') AND f.id > $1 AND (f.withdrawal_txid IS NULL OR f.withdrawal_txid = '') " +
                'ORDER BY f.created DESC ';

    query(sql, [param.last_funding_id], function (err, data) {
        if (err) return callback(err);

        var result = {};
        result = data.rows;
        return callback(null, result);
    });
};

/**
 * Get Statistics of User in Admin Panel
 * @author Bio
 */
exports.getUserDetailForAdminUserPage = function (param, callback) {
    var whereClause = "WHERE NOT (u.username = 'madabit' OR u.username = 'ex_to_mt_' OR u.username = 'fun_to_mt_' OR u.username = 'staff' OR u.userclass ='admin' OR u.userclass = 'superadmin' OR u.userclass = 'staff' OR u.demo = true) ";
    if (param.username != undefined && param.username != '') {
        param.username = param.username.toLowerCase();
        whereClause += " AND (lower(u.username) Like '%" + param.username + "%' OR u.phone_number LIKE '%" + param.username + "%') ";
    }

    var orderClause = 'ORDER BY gross_profit DESC';

    var sql_1 = 'SELECT u.id, u.username, u.gross_profit, u.net_profit, \n' +
        'SUM(COALESCE(p.bet + p.extra_bet, 0)) sum_bet, \n' +
        'SUM(COALESCE(p.play_times_profit, 0)) login_play_bonus, \n' +
        'SUM(COALESCE(p.first_deposit_profit, 0)) funding_bonus,\n' +
        'u.welcome_free_bit AS welcome_bonus, ' +
        'u.balance_satoshis,\n' +
        'u.agent_profit,\n' +
        '0 AS sum_deposit, 0 AS sum_withdraw,  ' +
        '0 AS sum_withdraw_fee, 0 AS sum_transfer_fee\n' +
        'FROM users u\n' +
        'LEFT JOIN plays p on p.user_id = u.id\n' +
        whereClause +
        'GROUP BY u.id, u.username\n';

    if (param.sort_field == undefined || param.sort_field == '') {
        orderClause = 'ORDER BY u.gross_profit DESC ';
    } else if (param.sort_field != 'sum_deposit' && param.sort_field != 'sum_withdraw' && param.sort_field != 'transfer' && param.sort_field != 'undefined') {
        orderClause = 'ORDER BY ' + param.sort_field + ' ' + param.sort_direction;
    }

    sql_1 += orderClause;

    var sql_2 = 'SELECT user_id, SUM(amount) sum_deposit\n' +
        'FROM fundings f\n' +
        'INNER JOIN users u on f.user_id = u.id\n' +
        whereClause + ' AND f.amount > 0 ' +
        'GROUP BY user_id';

    var sql_3 = 'SELECT user_id, SUM(amount) sum_withdraw, SUM(fee) sum_withdraw_fee\n' +
        'FROM fundings f\n' +
        'INNER JOIN users u on f.user_id = u.id\n' +
        whereClause + ' AND f.amount < 0 ' +
        'GROUP BY user_id';
    var sql_4 = 'SELECT from_user_id AS user_id, SUM(fee) sum_transfer_fee\n' +
        'FROM transfers t\n' +
        'INNER JOIN users u ON u.id = t.from_user_id ' +
        whereClause +
        'GROUP BY user_id';
    var sql_transfer = 'SELECT * ' +
        'FROM transfers t ';
    // "INNER JOIN users u on t.from_user_id = u.id";
    query(sql_1, function (err, result) {
        if (err) return callback(err);

        result = result.rows;

        if (result.length == 0) {
            var results = {};
            results.users = [];
            results.page = 1;
            results.total = 0;
            return callback(null, results);
        }
        var userMap = {};
        for (var i = 0; i < result.length; i++) {
            userMap[result[i]['id']] = i;
            result[i]['sum_bet'] = result[i]['sum_bet'] != null ? result[i]['sum_bet'] : 0;
            result[i]['login_play_bonus'] = result[i]['login_play_bonus'] != null ? result[i]['login_play_bonus'] : 0;
            result[i]['funding_bonus'] = result[i]['funding_bonus'] != null ? result[i]['funding_bonus'] : 0;
            result[i]['welcome_bonus'] = result[i]['welcome_bonus'] != null ? result[i]['welcome_bonus'] : 0;
            result[i]['transfer'] = 0;
        }

        query(sql_2, function (err, result_deposit) {
            if (err) return callback(err);
            result_deposit = result_deposit.rows;

            query(sql_3, function (err, result_withdraw) {
                if (err) return callback(err);
                result_withdraw = result_withdraw.rows;

                query(sql_transfer, function (err, result_transfer) {
                    if (err) return callback(err);
                    result_transfer = result_transfer.rows;

                    for (var i = 0; i < result_deposit.length; i++) {
                        if (result[userMap[result_deposit[i]['user_id']]] == undefined) { continue; }
                        result[userMap[result_deposit[i]['user_id']]]['sum_deposit'] = (result_deposit[i]['sum_deposit'] != null ? result_deposit[i]['sum_deposit'] : 0);
                    }

                    for (var i = 0; i < result_withdraw.length; i++) {
                        if (result[userMap[result_withdraw[i]['user_id']]] == undefined) { continue; }
                        result[userMap[result_withdraw[i]['user_id']]]['sum_withdraw'] = result_withdraw[i]['sum_withdraw'] != null ? Math.abs(result_withdraw[i]['sum_withdraw']) : 0;
                        result[userMap[result_withdraw[i]['user_id']]]['sum_withdraw_fee'] = result_withdraw[i]['sum_withdraw_fee'] != null ? result_withdraw[i]['sum_withdraw_fee'] : 0;
                    }

                    for (var i = 0; i < result_transfer.length; i++) {
                        var from_user_index = userMap[result_transfer[i]['from_user_id']];
                        var to_user_index = userMap[result_transfer[i]['to_user_id']];
                        if (from_user_index != undefined) {
                            result[from_user_index].transfer += result_transfer[i]['amount'];
                        }
                        if (to_user_index != undefined) {
                            result[to_user_index].transfer -= result_transfer[i]['amount'] + result_transfer[i]['fee'];
                        }
                    }

                    if (param.sort_field == 'sum_deposit' || param.sort_field == 'sum_withdraw' || param.sort_field == 'transfer') {
                        if (param.sort_direction == 'ASC') {
                            result.sort(function (obj1, obj2) {
                                return obj1[param.sort_field] - obj2[param.sort_field];
                            });
                        } else {
                            result.sort(function (obj1, obj2) {
                                return obj2[param.sort_field] - obj1[param.sort_field];
                            });
                        }
                    }

                    if (param.show_all == 'false') {
                        var total_count = result.length;
                        var total_page = Math.ceil(total_count / param.count_per_page);
                        if (total_page < param.page) { param.page = total_page; }

                        var count_from = (param.page - 1) * param.count_per_page;
                        var count_to = count_from + param.count_per_page;
                        count_to = (count_to > total_count) ? total_count : count_to;
                        var result_return = [];

                        for (var i = count_from; i < count_to; i++) { result_return.push(result[i]); }

                        var results = {};
                        results.users = result_return;
                        results.page = param.page;
                        results.total = total_page;
                        return callback(null, results);
                    }
                    var results = {};
                    results.users = result;
                    results.page = 1;
                    results.total = 0;
                    return callback(null, results);
                });
            });
        });
    });
};

/**
 * Set Userclass in User Page of Admin Panel
 * @author Bio
 */
exports.setUserClass = function (userId, userClass, callback) {
    // getClient(function(client, callback)
    // {
    var sql = 'SELECT * FROM users WHERE id = $1';
    query(sql, [userId], function (err, userInfo) {
        if (err) callback(err);
        userInfo = userInfo.rows[0];

        var username = userInfo.username;
        var currentUserClass = userInfo.userclass;

        if (currentUserClass == userClass) { callback(null, true); }

        if (userClass == 'master_ib') {
            sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
            /* client. */query(sql, [userClass, userId], function (err) {
                if (err) callback(err);

                if (currentUserClass == 'user' || currentUserClass == 'staff') {
                    sql = "UPDATE users SET parent1 = $1 WHERE path LIKE '" + userInfo.path + "___'";
                    /* client. */query(sql, [username], function (err) {
                        if (err) callback(err);

                        sql = "UPDATE users SET parent2 = $1 WHERE path LIKE '" + userInfo.path + "______'";
                        /* client. */query(sql, [username], function (err) {
                            if (err) callback(err);

                            sql = "UPDATE users SET parent3 = $1 WHERE path LIKE '" + userInfo.path + "_________'";
                            /* client. */query(sql, [username], function (err) {
                                if (err) callback(err);

                                sql = "UPDATE users SET master_ib = $1 WHERE path LIKE '" + userInfo.path + "%'";
                                /* client. */query(sql, [username], function (err) {
                                    if (err) callback(err);

                                    callback(null, true);
                                });
                            });
                        });
                    });
                } else if (currentUserClass === 'agent') {
                    sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                    /* client. */query(sql, [userClass, userId], function (err) {
                        if (err) callback(err);

                        sql = "UPDATE users SET master_ib = $1 WHERE path LIKE '" + userInfo.path + "%'";
                        /* client. */query(sql, [username], function (err) {
                            if (err) callback(err);

                            callback(null, true);
                        });
                    });
                }
            });
        } else if (userClass == 'agent') {
            if (currentUserClass == 'user' || currentUserClass == 'staff') {
                sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                /* client. */query(sql, [userClass, userId], function (err) {
                    if (err) callback(err);
                    sql = "UPDATE users SET parent1 = $1 WHERE path LIKE '" + userInfo.path + "___'";
                    /* client. */query(sql, [username], function (err) {
                        if (err) callback(err);

                        sql = "UPDATE users SET parent2 = $1 WHERE path LIKE '" + userInfo.path + "______'";
                        /* client. */query(sql, [username], function (err) {
                            if (err) callback(err);

                            sql = "UPDATE users SET parent3 = $1 WHERE path LIKE '" + userInfo.path + "_________'";
                            /* client. */query(sql, [username], function (err) {
                                if (err) callback(err);

                                callback(null, true);
                            });
                        });
                    });
                });
            } else if (currentUserClass == 'master_ib') {
                sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                /* client. */query(sql, [userClass, userId], function (err) {
                    if (err) callback(err);
                    sql = 'UPDATE users SET master_ib = NULL WHERE master_ib = $1';
                    /* client. */query(sql, [username], function (err) {
                        if (err) callback(err);

                        callback(null, true);
                    });
                });
            }
        } else if (userClass == 'user' || userClass == 'staff') {
            if (currentUserClass == 'agent') {
                sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                /* client. */query(sql, [userClass, userId], function (err) {
                    if (err) callback(err);
                    sql = "UPDATE users SET parent1 = NULL WHERE path LIKE '" + userInfo.path + "___'";
                    /* client. */query(sql, [], function (err) {
                        if (err) callback(err);

                        sql = "UPDATE users SET parent2 = NULL WHERE path LIKE '" + userInfo.path + "______'";
                        /* client. */query(sql, [], function (err) {
                            if (err) callback(err);

                            sql = "UPDATE users SET parent3 = NULL WHERE path LIKE '" + userInfo.path + "_________'";
                            /* client. */query(sql, [], function (err) {
                                if (err) callback(err);

                                callback(null, true);
                            });
                        });
                    });
                });
            } else if (currentUserClass == 'master_ib') {
                sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                /* client. */query(sql, [userClass, userId], function (err) {
                    sql = "UPDATE users SET parent1 = NULL WHERE path LIKE '" + userInfo.path + "___'";
                    /* client. */query(sql, [], function (err) {
                        if (err) callback(err);

                        sql = "UPDATE users SET parent2 = NULL WHERE path LIKE '" + userInfo.path + "______'";
                        /* client. */query(sql, [], function (err) {
                            if (err) callback(err);

                            sql = "UPDATE users SET parent3 = NULL WHERE path LIKE '" + userInfo.path + "_________'";
                            /* client. */query(sql, [], function (err) {
                                if (err) callback(err);

                                sql = 'UPDATE users SET master_ib = NULL WHERE master_ib = $1';
                                /* client. */query(sql, [username], function (err) {
                                    if (err) callback(err);

                                    callback(null, true);
                                });
                            });
                        });
                    });
                });
            } else if (currentUserClass == 'admin' && userInfo.path.length == 3) {
                sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                /* client. */query(sql, [userClass, userId], function (err) {
                    if (err) callback(err);
                    callback(null, true);
                });
            } else if (userClass == 'user' || userClass == 'staff') {
                sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
                /* client. */query(sql, [userClass, userId], function (err) {
                    if (err) callback(err);
                    callback(null, true);
                });
            }
        }
    });
    // }, callback);
};

exports.setUserClassToAdmin = function (userId, userClass, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * FROM users WHERE id = $1';
    query(sql, [userId], function (err, userInfo) {
        userInfo = userInfo.rows[0];
        if ((userInfo.userclass == 'user' || userInfo.userclass == 'staff' || userInfo.userclass == 'admin' || userInfo.userclass == 'superadmin') && userInfo.path.length == 3) {
            sql = 'UPDATE users SET userclass = $1 WHERE id = $2';
            /* client. */query(sql, [userClass, userId], function (err) {
                if (err) callback(err);

                callback(null, true);
            });
        } else {
            callback(null, false);
        }
    });
    /* }, callback); */
};

/**
 * Delete user in User Page in Admin Panel
 * set the is_delete as TRUE
 * @author Bio
 */
exports.deleteUser = function (userId, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * FROM users WHERE id = $1';
    query(sql, [userId], function (err, userInfo) {
        if (err) return callback(err);
        var userInfo = userInfo.rows[0];
        sql = 'UPDATE users SET is_deleted = true, balance_satoshis = 0 WHERE id = $1';
        /* client. */query(sql, [userId], function (err, data) {
            if (err) return callback(err);

            sql = "UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE username = 'madabit'";
            /* client. */query(sql, [userInfo.balance_satoshis], function (err, data) {
                if (err) return callback(err);

                sql = 'UPDATE users SET master_ib = NULL WHERE master_ib = $1';
                /* client. */query(sql, [userInfo.username], function (err) {
                    if (err) return callback(err);

                    sql = 'UPDATE users SET parent1 = NULL WHERE parent1 = $1';
                    /* client. */query(sql, [userInfo.username], function (err) {
                        if (err) return callback(err);

                        sql = 'UPDATE users SET parent2 = NULL WHERE parent2 = $1';
                        /* client. */query(sql, [userInfo.username], function (err) {
                            if (err) return callback(err);

                            sql = 'UPDATE users SET parent3 = NULL WHERE parent3 = $1';
                            /* client. */query(sql, [userInfo.username], function (err) {
                                if (err) return callback(err);

                                query("SELECT * FROM common WHERE strkey = 'deleted_profit'", [], function (err, result) {
                                    if (err) return callback(err);
                                    if (result.rowCount == 0) {
                                        lib.log('info', 'setting - deleted_profit [begin] :' + userInfo.balance_satoshis);
                                        console.log('setting - deleted_profit [begin] :' + userInfo.balance_satoshis);
                                        query("INSERT INTO common (strkey, strvalue) VALUES('deleted_profit', $1)", [userInfo.balance_satoshis], function (err, result) {
                                            if (err) return callback(err);

                                            lib.log('info', 'setting - deleted_profit [end] :' + userInfo.balance_satoshis);
                                            console.log('setting - deleted_profit [end] :' + userInfo.balance_satoshis);

                                            console.log('db - delete_user - user_id:' + userId + '   username:' + userInfo.username + '   phone_number:' + userInfo.phone_number);
                                            lib.log('info', 'db - delete_user - user_id:' + userId + '   username:' + userInfo.username + '   phone_number:' + userInfo.phone_number);
                                            if (result.rowCount == 1) return callback(null, true);
                                            return callback(null, false);
                                        });
                                    } else {
                                        lib.log('setting - deleted_profit plus [begin] :' + userInfo.balance_satoshis);
                                        console.log('setting - deleted_profit plus [begin] :' + userInfo.balance_satoshis);
                                        query("UPDATE common SET strvalue = strvalue::integer + $1 WHERE strkey = 'deleted_profit'", [userInfo.balance_satoshis], function (err, result) {
                                            lib.log('info', 'setting - deleted_profit plus [end] :' + userInfo.balance_satoshis);
                                            console.log('setting - deleted_profit plus [end] :' + userInfo.balance_satoshis);
                                            if (err) return callback(err);
                                            return callback(null, true);
                                        });
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });
    });
    /* }, callback); */
};

exports.sendMessageToMultiUsers = function (userIds, message, callback) {
    /* getClient(function(client, callback)
    { */
    var tasks = [];
    userIds.forEach(function (userId) {
        tasks.push(function (callback) {
            /* client. */query('INSERT INTO supports (user_id, read, message_to_user, reply_check) VALUES($1, true, $2, false)', [userId, message], callback);
        });
    });

    async.series(tasks, function (err, result) {
        if (err) { return callback(err); }
        return callback(null, true);
    });/*
   */ /* }, callback); */
};

/**
 * Set User Chat Status in Admin User Page
 * (Disable or Enable the status that user can chat)
 * @author Bio
 * @since 2018.4.2
 */
exports.setUserCanChatStatus = function (userId, status, callback) {
    if (status == 'false') { status = false; } else { status = true; }

    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE users SET can_chat = $1 WHERE id = $2';
    /* client. */query(sql, [status, userId], function (err, result) {
        if (err) callback(err);
        callback(null, true);
    });
    /* }, callback); */
};

/**
 * Save Phone Number in Admin User Page
 * @author Bio
 * @since 2018.4.2
 */
exports.savePhoneNumber = function (user_id, phone_number, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE users SET phone_number = $1 WHERE id = $2';
    /* client. */query(sql, [phone_number, user_id], function (err, result) {
        if (err) callback(err);
        callback(null, phone_number);
    });
    /* }, callback); */
};

exports.saveRefId = function (user_id, ref_id, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * FROM users WHERE id = $1';
    query(sql, [user_id], function (err, user_info) {
        if (err) return callback(err);

        if (user_info.rowCount == 0) { return callback('NO USER'); }
        user_info = user_info.rows[0];

        if (user_info.ref_id == null || user_info.ref_id == '') { return callback('USER HAS NOT REF ID BEFORE'); }

        sql = 'SELECT * FROM users WHERE username = $1';
        query(sql, [ref_id], function (err, ref_info) {
            if (err) return callback(err);

            if (ref_info.rowCount == 0) { return callback('NO REF INFO'); }
            ref_info = ref_info.rows[0];

            sql = 'SELECT COUNT(*) FROM plays WHERE user_id = $1';
            query(sql, [user_id], function (err, play_count) {
                if (play_count.rows[0].count != 0) { return callback('USER ALREADY PLAYED GAME'); }

                var parent1 = null;
                if (user_info.userclass == 'agent') { parent1 = ref_info.username; }

                sql = 'UPDATE users SET ref_id = $1, master_ib =$2, parent1 = $3, parent2 = $4, parent3 = $5 WHERE id = $6';
                query(sql, [ref_id, ref_info.master_ib, parent1, ref_info.parent1, ref_info.parent2, user_id], function (err, result) {
                    if (err) callback(err);
                    callback(null, ref_id);
                });
            });
        });
    });

    /* }, callback); */
};

exports.getUsersFromEmail = function (email, callback) {
    assert(email, callback);
    query('select * from users where email = lower($1)', [email], function (err, data) {
        if (err) return callback(err);

        if (data.rows.length === 0) { return callback('NO_USERS'); }

        callback(null, data.rows);
    });
};

exports.addRecoverId = function (userId, ipAddress, callback) {
    assert(userId && ipAddress && callback);

    var recoveryId = uuid.v4();
    /* getClient(function(client, callback)
    { */
    /* client. */query('INSERT INTO recovery (id, user_id, ip)  values($1, $2, $3)', [recoveryId, userId, ipAddress], function (err, res) {
        if (err) return callback(err);
        callback(null, recoveryId);
    });
    /* }, callback); */
};

exports.getUserBySessionId = function (sessionId, callback) {
    assert(sessionId && callback);
    query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM sessions WHERE id = $1 AND ott = false AND expired > now())', [sessionId], function (err, response) {
        if (err) return callback(err);

        var data = response.rows;
        if (data.length === 0) { return callback('NOT_VALID_SESSION'); }

        assert(data.length === 1);

        var user = data[0];
        assert(typeof user.balance_satoshis === 'number');
        user.balance_satoshis_format = formatSatoshis(user.balance_satoshis);

        callback(null, user);
    });
};

exports.getUserByValidRecoverId = function (recoverId, callback) {
    assert(recoverId && callback);
    query('SELECT * FROM users_view WHERE id = (SELECT user_id FROM recovery WHERE id = $1 AND used = false AND expired > NOW())', [recoverId], function (err, res) {
        if (err) return callback(err);

        var data = res.rows;
        if (data.length === 0) { return callback('NOT_VALID_RECOVER_ID'); }

        assert(data.length === 1);
        return callback(null, data[0]);
    });
};

exports.getUserByName = function (username, callback) {
    assert(username);
    query('SELECT * FROM users WHERE lower(username) = lower($1)', [username], function (err, result) {
        if (err) return callback(err);
        if (result.rows.length === 0) { return callback('USER_DOES_NOT_EXIST'); }

        assert(result.rows.length === 1);
        callback(null, result.rows[0]);
    });
};

/* Sets the recovery record to userd and update password */
exports.changePasswordFromRecoverId = function (recoverId, password, callback) {
    assert(recoverId && password && callback);
    var hashedPassword = passwordHash.generate(password);

    /* getClient(function(client, callback)
    { */
    var sql = m(function () { /*
     WITH t as (UPDATE recovery SET used = true, expired = now()
     WHERE id = $1 AND used = false AND expired > now()
     RETURNING *) UPDATE users SET password = $2 where id = (SELECT user_id FROM t) RETURNING *
     */ });

    /* client. */query(sql, [recoverId, hashedPassword], function (err, res) {
        if (err) { return callback(err); }

        var data = res.rows;
        if (data.length === 0) { return callback('NOT_VALID_RECOVER_ID'); }

        assert(data.length === 1);

        callback(null, data[0]);
    }/**/
    );
    /* }, callback); */
};

exports.getGame = function (gameId, callback) {
    assert(gameId && callback);
    query('SELECT * FROM games ' +
        'LEFT JOIN game_hashes ON games.id = game_hashes.game_id ' +
        'WHERE games.id = $1 AND games.ended = TRUE', [gameId], function (err, result) {
        if (err) return callback(err);
        if (result.rows.length == 0) return callback('GAME_DOES_NOT_EXISTS');
        assert(result.rows.length == 1);
        callback(null, result.rows[0]);
    });
};

/**
 * Get All Games
 * @author Bio
 * @since 2018.8.9
 * @param param
 * @param callback
 */
exports.getGamesByPage = function(param, callback) {
    let offset = param.count_per_page * (param.page - 1);
    if(offset < 0)
        offset = 0;
    let sql =   'SELECT g.*, gh.hash\n' +
                'FROM games g\n' +
                'LEFT JOIN game_hashes gh ON gh.game_id = g.id\n' +
                'WHERE g.ended = true\n' +
                'ORDER BY g.id DESC ' +
                'LIMIT ' + param.count_per_page + ' OFFSET ' + offset;
    query(sql, function(err, result) {
        if(err)
            return callback(err);
        result = result.rows;
        return callback(null, result);
    });
}

exports.getGamesPlays = function (gameId, callback) {
    query('SELECT u.username, p.bet, p.extra_bet, p.cash_out, p.extra_bet FROM plays p, users u ' +
        ' WHERE game_id = $1 AND p.user_id = u.id ORDER by p.cash_out/p.bet::float DESC NULLS LAST, p.bet DESC', [gameId],
    function (err, result) {
        if (err) return callback(err);
        return callback(null, result.rows);
    }
    );
};

function addSatoshis (client, userId, amount, callback) {
    client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2', [amount, userId], function (err, res) {
        if (err) return callback(err);
        assert(res.rowCount === 1);
        callback(null);
    });
}

exports.getUserPlays = function (userId, limit, offset, callback) {
    assert(userId);
    query('SELECT p.bet, p.cash_out, p.created, p.game_id, g.game_crash, p.balance_satoshis, p.extra_bet, p.profit_for_agent ' +
        'FROM plays p ' +
        'LEFT JOIN (SELECT * FROM games) g ON g.id = p.game_id ' +
        'WHERE p.user_id = $1 AND g.ended = true ORDER BY p.id DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset], function (err, result) {
        if (err) return callback(err);
        callback(null, result.rows);
    }
    );
};

exports.getUserPlaysForAccountPage = function (userId, limit, offset, date_from, date_to, time_zone_name, callback) {
    assert(userId);
    query('SELECT p.bet, p.cash_out, p.created, p.game_id, g.game_crash, p.extra_bet ' +
        'FROM plays p ' +
        'LEFT JOIN (SELECT * FROM games) g ON g.id = p.game_id ' +
        'WHERE p.user_id = $1 AND g.ended = true AND ' +
        "p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
        "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' " +
        'ORDER BY p.id DESC ' +
        'LIMIT $2 OFFSET $3',
    [userId, limit, offset], function (err, result) {
        if (err) return callback(err);
        callback(null, result.rows);
    }
    );
};

exports.getGiveAwaysAmount = function (userId, callback) {
    assert(userId);
    query('SELECT SUM(g.amount) FROM giveaways g where user_id = $1', [userId], function (err, result) {
        if (err) return callback(err);
        return callback(null, result.rows[0]);
    });
};

exports.addGiveaway = function (userId, callback) {
    assert(userId && callback);

    getClient(function (client, callback) {
        query('SELECT last_giveaway FROM users_view WHERE id = $1', [userId], function (err, result) {
            if (err) return callback(err);

            if (!result.rows) return callback('USER_DOES_NOT_EXIST');
            assert(result.rows.length === 1);
            var lastGiveaway = result.rows[0].last_giveaway;
            var eligible = lib.isEligibleForGiveAway(lastGiveaway);

            if (typeof eligible === 'number') {
                return callback({ message: 'NOT_ELIGIBLE', time: eligible});
            }

            var amount = 200; // 2 bits
            client.query('INSERT INTO giveaways(user_id, amount) VALUES($1, $2) ', [userId, amount], function (err) {
                if (err) return callback(err);

                addSatoshis(client, userId, amount, function (err) {
                    if (err) return callback(err);

                    callback(null);
                });
            });
        });
    }, callback);
};

exports.addRawGiveaway = function (userNames, amount, callback) {
    assert(userNames && amount && callback);

    getClient(function (client, callback) {
        var tasks = userNames.map(function (username) {
            return function (callback) {
                query('SELECT id FROM users WHERE lower(username) = lower($1)', [username], function (err, result) {
                    if (err) return callback('unable to add bits');

                    if (result.rows.length === 0) return callback(username + ' didnt exists');

                    var userId = result.rows[0].id;
                    client.query('INSERT INTO giveaways(user_id, amount) VALUES($1, $2) ', [userId, amount], function (err, result) {
                        if (err) return callback(err);

                        assert(result.rowCount == 1);
                        addSatoshis(client, userId, amount, function (err) {
                            if (err) return callback(err);
                            callback(null);
                        });
                    });
                });
            };
        });

        async.series(tasks, function (err, ret) {
            if (err) return callback(err);
            return callback(null, ret);
        });
    }, callback);
};

exports.getUserNetProfit = function (userId, callback) {
    assert(userId);
    query('SELECT (' +
        'COALESCE(SUM(cash_out), 0) + ' +
        'COALESCE(SUM(bet), 0)) profit ' +
        'FROM plays ' +
        'WHERE user_id = $1', [userId], function (err, result) {
        if (err) return callback(err);
        assert(result.rows.length == 1);
        return callback(null, result.rows[0]);
    }
    );
};

exports.getUserNetProfitLast = function (userId, last, callback) {
    assert(userId);
    query('SELECT (COALESCE(SUM(cash_out), 0) - COALESCE(SUM(bet + extra_bet), 0))::bigint profit FROM ( ' +
                'SELECT * FROM plays ' +
                'WHERE user_id = $1 ' +
                'ORDER BY id DESC ' +
                'LIMIT $2 ' +
            ') restricted ', [userId, last], function (err, result) {
        if (err) return callback(err);
        assert(result.rows.length == 1);
        return callback(null, result.rows[0].profit);
    }
    );
};

exports.getUserNetProfitLastForAccountPage = function (userId, last, date_from, date_to, time_zone_name, callback) {
    assert(userId);
    query('SELECT (COALESCE(SUM(cash_out), 0) - COALESCE(SUM(bet + extra_bet), 0))::bigint profit ' +
            'FROM ( ' +
                'SELECT * FROM plays p ' +
                "WHERE user_id = $1 AND p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' " +
                'ORDER BY id DESC ' +
                'LIMIT $2 ' +
            ') restricted ', [userId, last], function (err, result) {
        if (err) return callback(err);
        assert(result.rows.length == 1);
        return callback(null, result.rows[0].profit);
    }
    );
};

exports.getPublicStats = function (username, callback) {
    var sql = 'SELECT * FROM (SELECT id AS user_id, username, gross_profit, net_profit, games_played, phone_number, is_deleted, ' +
        'rank() OVER (ORDER BY users.gross_profit DESC) AS rank ' +
        'FROM users ' +
        "WHERE NOT (username = 'madabit' OR username = 'staff' " +
        "OR username = 'ex_to_mt_' OR username = 'fun_to_mt_' " +
        "OR userclass = 'staff' OR userclass = 'superadmin' OR userclass = 'admin')) t " +
        'WHERE lower(username) = lower($1) OR lower(phone_number) = lower($1) ' +
        'ORDER BY is_deleted DESC';

    query(sql,
        [username], function (err, result) {
            if (err) return callback(err);

            if (result.rows.length == 0) { return callback('USER_DOES_NOT_EXIST'); }

            return callback(null, result.rows[0]);
        }
    );
};

exports.makeWithdrawal = function (userId, game_points, withdrawalAddress, withdrawalId, cointype, fee, callback) {
    assert(typeof userId === 'number');
    assert(typeof game_points === 'number');
    assert(typeof withdrawalAddress === 'string');
    assert(lib.isUUIDv4(withdrawalId));
    if (cointype == 'Madecoin') {
        cointype = 'MDC';
        withdrawalId = null;
    }

    getClient(function (client, callback) {
        var exchange_rate = {};
        var sql = "SELECT * FROM common WHERE strkey LIKE 'rate_%'";
        query(sql, function (e, r) {
            if (e) { return callback(err); }

            for (var i = 0; i < r.rows.length; i++) {
                exchange_rate[r.rows[i].strkey] = r.rows[i].strvalue;
            }
            if (exchange_rate.rate_BTC_USD == null ||
                exchange_rate.rate_ETH_USD == null ||
                exchange_rate.rate_USD_bit == null) return callback('[MY ERROR]: Cannot get the exchange rate values.');

            var baseunit;
            switch (cointype) {
                case 'BTC':
                    baseunit = game_points / exchange_rate.rate_USD_bit / exchange_rate.rate_BTC_USD / 100;
                    break;
                case 'ETH':
                    baseunit = game_points / exchange_rate.rate_USD_bit / exchange_rate.rate_ETH_USD;
                    break;
                case 'MDC':
                    baseunit = parseInt(game_points / 1000.0);
                    break;
            }

            baseunit = baseunit.toFixed(7);
            baseunit = parseFloat(baseunit);

            var total_gp = game_points + fee + config.MINING_FEE;
            if (cointype == 'MDC') {
                total_gp = game_points + fee;
            }

            console.log('db - make_withdrawal - user_id:' + userId + '   base_unit:' + baseunit + '   total_gp:' + total_gp + '   game_points:' + game_points + '   fee:' + fee);
            lib.log('info', 'db - make_withdrawal - user_id:' + userId + '   base_unit:' + baseunit + '   total_gp:' + total_gp + '   game_points:' + game_points + '   fee:' + fee);

            client.query('UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE id = $2', [total_gp, userId], function (err, response) {
                if (err) return callback(err);

                if (response.rowCount !== 1) { return callback(new Error('Unexpected withdrawal row count: \n' + response)); }

                client.query("UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE username = 'madabit'", [fee], function (err, response) {
                    if (err) return callback(err);

                    if (response.rowCount !== 1) { return callback(new Error('Unexpected withdrawal row count: \n' + response)); }

                    client.query('INSERT INTO fundings(user_id, amount, fee, withdrawal_address, description, withdrawal_id, baseunit, currency) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                        [userId, -game_points, fee, withdrawalAddress, cointype + ' Withdrawal', withdrawalId, -baseunit, cointype],
                        function (err, response) {
                            if (err) return callback(err);

                            var funding_id = response.rows[0].id;
                            assert(typeof funding_id === 'number');

                            return callback(null, {funding_id: funding_id, baseunit: baseunit});
                        }
                    );
                });
            });
        });
    }, callback);
};

exports.getWithdrawals = function (userId, time_zone, callback) {
    assert(userId && callback);
    query("SELECT amount, withdrawal_address, withdrawal_txid, baseunit, fee, currency, created at time zone '" + time_zone + "' AS created " +
            'FROM fundings ' +
            'WHERE user_id = $1 AND amount < 0 ' +
            'ORDER BY created DESC', [userId], function (err, result) {
        if (err) return callback(err);

        var data = result.rows.map(function (row) {
            return {
                amount: Math.abs(parseInt(row.amount / 100)),
                destination: row.withdrawal_address,
                status: row.withdrawal_txid,
                baseunit: row.baseunit,
                fee: Math.abs(parseFloat(row.fee / 100)),
                currency: row.currency,
                created: row.created
            };
        });
        callback(null, data);
    });
};

exports.getDeposits = function (userId, time_zone, callback) {
    assert(userId && callback);
    query("SELECT amount,baseunit,deposit_txid,created at time zone '" + time_zone + "' AS created, currency FROM fundings WHERE user_id = $1 AND amount > 0 ORDER BY created DESC", [userId], function (err, result) {
        if (err) return callback(err);

        var data = result.rows.map(function (row) {
            return {
                amount: row.amount,
                baseunit: row.baseunit,
                txid: row.deposit_txid,
                created: row.created,
                currency: row.currency
            };
        });
        callback(null, data);
    });
};

exports.getDidDeposit = function (userId, callback) {
    query('SELECT sum(amount) as sum FROM fundings WHERE user_id = $1 AND amount > 0', [userId], function (err, result) {
        if (err) return callback(err);

        callback(null, result.rows[0].sum);
    });
};

exports.getDepositsAmount = function (userId, callback) {
    assert(userId);
    query('SELECT SUM(f.amount) FROM fundings f WHERE user_id = $1 AND amount >= 0', [userId], function (err, result) {
        if (err) return callback(err);
        callback(null, result.rows[0]);
    });
};

exports.getWithdrawalsAmount = function (userId, callback) {
    assert(userId);
    query('SELECT SUM(f.amount) FROM fundings f WHERE user_id = $1 AND amount < 0', [userId], function (err, result) {
        if (err) return callback(err);

        callback(null, result.rows[0]);
    });
};

exports.setFundingsWithdrawalTxid = function (fundingId, txid, callback) {
    assert(typeof fundingId === 'number');
    assert(typeof txid === 'string');
    assert(callback);

    /* getClient(function(client, callback)
    { */
    /* client. */query('UPDATE fundings SET withdrawal_txid = $1 WHERE id = $2', [txid, fundingId],
        function (err, result) {
            if (err) return callback(err);

            assert(result.rowCount === 1);

            callback(null);
        }
    );
    /* }, callback); */
};

exports.getLeaderBoard = function (byDb, order, callback) {
    var sql = 'SELECT users.id AS user_id, ' +
        'users.username, ' +
        'users.gross_profit, ' +
        'users.net_profit, ' +
        'users.games_played, ' +
        'rank() OVER (ORDER BY users.gross_profit DESC) AS rank, ' +
        'users.agent_profit ' +
        'FROM users ' +
        "WHERE  is_deleted = false AND NOT (username = 'madabit' OR username = 'ex_to_mt_' OR username = 'fun_to_mt_' OR username = 'staff' OR userclass ='admin' " +
        "OR userclass = 'superadmin' OR userclass = 'staff') " +
        'ORDER BY gross_profit DESC, net_profit DESC ' +
        'LIMIT 100 ';
    query(sql, function (err, byNetProfit) {
        if (err) callback(err);
        sql = 'SELECT r.rank, r.amount AS agent_profit, u.username\n' +
            'FROM ib_ranking r\n' +
            'LEFT JOIN users u ON u.id = r.user_id\n' +
            'ORDER BY r.rank ' +
            'LIMIT 100 ';

        query(sql, function (err, byAgentProfit_fake) {
            if (err) callback(err);

            sql = 'SELECT id, username, agent_profit ' +
                'FROM users ' +
                "WHERE (userclass = 'agent' OR userclass = 'master_ib') AND NOT (username = 'madabit' OR username = 'ex_to_mt_' OR username = 'fun_to_mt_' OR userclass = 'staff' OR userclass ='admin' OR userclass = 'superadmin')" +
                'ORDER BY agent_profit DESC, net_profit DESC ' +
                'LIMIT 100 ';

            query(sql, function (err, byAgentProfit) {
                var result = {};
                result['byGrossProfit'] = byNetProfit.rows;
                result['byNetProfit'] = byNetProfit.rows;
                if (byAgentProfit_fake.rows.length != 0) { result['byAgentProfit'] = byAgentProfit_fake.rows; } else result['byAgentProfit'] = byAgentProfit.rows;
                callback(null, result);
            });
        });
    });
};

exports.getLeaderBoardTop5 = function (callback) {
    // var sql = 'SELECT users.id AS user_id,\n' +
    //     'users.username,\n' +
    //     'users.gross_profit,\n' +
    //     'users.net_profit,\n' +
    //     'users.games_played,\n' +
    //     'rank() OVER (ORDER BY users.gross_profit DESC) AS rank\n' +
    //     'FROM users\n' +
    //     "WHERE is_deleted = false AND NOT (username = 'madabit' OR username = 'ex_to_mt_' OR username = 'fun_to_mt_' OR username = 'staff' OR userclass ='admin' OR userclass = 'superadmin' OR userclass = 'staff') \n" +
    //     'ORDER BY gross_profit DESC LIMIT 5';
    var sql = 'SELECT * FROM top_players ORDER BY id';
    query(sql, function (err, data) {
        if (err) { return callback(err); }
        callback(null, data.rows);
    });
};

exports.addChatMessage = function (userId, created, message, channelName, isBot, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'INSERT INTO chat_messages (user_id, created, message, channel, is_bot) values($1, $2, $3, $4, $5)';
    /* client. */query(sql, [userId, created, message, channelName, isBot], function (err, res) {
        if (err) { return callback(err); }

        sql = 'DELETE FROM chat_messages WHERE EXTRACT(days FROM NOW() - created) > 1';
        query(sql, function (err, result) {
            if (err) {
                return callback(err);
            }

            return callback(null);
        });
    });
    /* }, callback); */
};

exports.getChatTable = function (limit, channelName, userId, callback) {
    if (userId == undefined) { return callback(null, []); }
    assert(typeof limit === 'number');
    var sql = 'SELECT * FROM users WHERE id = $1';
    query(sql, [userId], function (err, result) {
        if (err) { return callback(err); }
        var user_info = result.rows[0];
        if (user_info.userclass == 'superadmin' || user_info.userclass == 'admin') {
            sql = "SELECT chat_messages.created AS date, 'say' AS type, users.username, \n" +
                    'users.userclass AS role, chat_messages.message, is_bot AS bot\n' +
                    'FROM chat_messages \n' +
                    'JOIN users ON users.id = chat_messages.user_id \n' +
                    'ORDER BY chat_messages.id \n' +
                    'DESC LIMIT $1';
            query(sql, [limit], function (err, result) {
                if (err) { return callback(null, []); }
                return callback(null, result.rows);
            });
        } else {
            sql = 'SELECT * \n' +
                'FROM sessions \n' +
                'WHERE user_id = $1 AND ott = false AND created <= NOW() AND expired >= NOW() \n' +
                'ORDER BY created DESC \n' +
                'LIMIT 1';

            query(sql, [userId], function (err, session_result_1) {
                if (err) { return callback(null, []); }
                if (session_result_1.rows.length == 0) { return callback(null, []); }

                var login_session_created = session_result_1.rows[0].created;
                sql = 'SELECT * \n' +
                    'FROM sessions \n' +
                    'WHERE user_id = $1 AND ott = true AND created >= $2 \n' +
                    'ORDER BY created ASC';

                query(sql, [userId, login_session_created], function (err, session_result_2) {
                    if (err) { return callback(null, []); }
                    if (session_result_2.rows.length == 0) { return callback(null, []); }

                    // var session_created = session_result_2.rows[1].created;
                    sql = "SELECT chat_messages.created AS date, 'say' AS type, users.username, \n" +
                        'users.userclass AS role, chat_messages.message, is_bot AS bot\n' +
                        'FROM chat_messages \n' +
                        'JOIN users ON users.id = chat_messages.user_id \n' +
                        'WHERE chat_messages.created > $1\n' +
                        'ORDER BY chat_messages.id \n' +
                        'DESC LIMIT $2';
                    query(sql, [login_session_created, limit], function (err, result) {
                        if (err) { return callback(null, []); }
                        return callback(null, result.rows);
                    });
                });
            });
        }
    });

    // sql = "SELECT chat_messages.created AS date, 'say' AS type, users.username, users.userclass AS role, chat_messages.message, is_bot AS bot " +
    //     'FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE channel = $1 AND chat_messages.created > (select users.created from users where users.id=$3 order by users.created limit 1) ORDER BY chat_messages.id DESC LIMIT $2';
    // query(sql, [channelName, limit, userId], function (err, data) {
    //     if (err) { return callback(err); }
    //     callback(null, data.rows);
    // });
};

// Get the history of the chat of all channels except the mods channel
exports.getAllChatTable = function (limit, callback) {
    assert(typeof limit === 'number');
    var sql = m(function () { /*
     SELECT chat_messages.created AS date, 'say' AS type, users.username, users.userclass AS role, chat_messages.message, is_bot AS bot, chat_messages.channel AS "channelName"
     FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE channel <> 'moderators'  ORDER BY chat_messages.id DESC LIMIT $1
    */ });
    query(sql, [limit], function (err, data) {
        if (err) { return callback(err); }
        callback(null, data.rows);
    });
};

exports.getSiteStats = function (callback) {
    function as (name, callback) {
        return function (err, results) {
            if (err) { return callback(err); }

            assert(results.rows.length === 1);
            callback(null, [name, results.rows[0]]);
        };
    }

    var tasks = [
        function (callback) {
            query('SELECT COUNT(*) FROM users', as('users', callback));
        },
        function (callback) {
            query('SELECT COUNT(*) FROM games', as('games', callback));
        },
        function (callback) {
            query('SELECT COALESCE(SUM(fundings.amount), 0)::bigint sum FROM fundings WHERE amount < 0', as('withdrawals', callback));
        },
        function (callback) {
            query("SELECT COUNT(*) FROM games WHERE ended = false AND created < NOW() - interval '5 minutes'", as('unterminated_games', callback));
        },
        function (callback) {
            query('SELECT COUNT(*) FROM fundings WHERE amount < 0 AND withdrawal_txid IS NULL', as('pending_withdrawals', callback));
        },
        function (callback) {
            query('SELECT COALESCE(SUM(fundings.amount), 0)::bigint sum FROM fundings WHERE amount > 0', as('deposits', callback));
        },
        function (callback) {
            query('SELECT ' +
                'COUNT(*) count, ' +
                'SUM(plays.bet)::bigint total_bet, ' +
                'SUM(plays.cash_out)::bigint cashed_out ' +
                'FROM plays', as('plays', callback));
        }
    ];

    async.series(tasks, function (err, results) {
        if (err) return callback(err);

        var data = {};

        results.forEach(function (entry) {
            data[entry[0]] = entry[1];
        });

        callback(null, data);
    });
};
function formatSatoshis (n, decimals) {
    return formatDecimals(n / 100, decimals);
}

function formatDecimals (n, decimals) {
    if (typeof decimals === 'undefined') {
        if (n % 100 === 0) { decimals = 0; } else { decimals = 2; }
    }
    return n.toFixed(decimals).toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}

// Set Safe-Point
exports.setSafePoint = function (safePoint, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'safe_point'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['safe_point', safePoint], function (err, res) {
                if (err) return callback(err);

                if (res.rowCount == 1) { return callback(null, true); }

                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='safe_point'";
        query(sql, [safePoint], function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
};

// Set Tip Fee
exports.setTipFee = function (tipFee, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'tipfee'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - tipfee [begin] :' + tipFee);
            console.log('setting - tipfee [begin] :' + tipFee);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['tipfee', tipFee], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - tipfee [end] :' + tipFee);
                console.log('setting - tipfee [end] :' + tipFee);
                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        lib.log('info', 'setting - tipfee [begin] :' + tipFee);
        console.log('setting - tipfee [begin] :' + tipFee);
        sql = "UPDATE common SET strvalue=$1 WHERE strkey='tipfee'";
        query(sql, [tipFee], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - tipfee [end] :' + tipFee);
            console.log('setting - tipfee [end] :' + tipFee);
            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
};

// Get Tip Fee
exports.getTipFee = function (callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'tipfee'";
    query(sql, function (err, res) {
        if (err) { return callback(err); }

        if (res.rowCount == 0) { return callback(null, ''); }
        return callback(null, res.rows[0]['strvalue']);
    });
};

// Get Tip Fee
exports.getContactUsEmail = function (callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'contactus_email'";
    query(sql, function (err, res) {
        if (err) { return callback(err); }

        if (res.rowCount === 0) { return callback(null, ''); }
        return callback(null, res.rows[0]['strvalue']);
    });
};

// Save Exchange Rate
exports.saveExchangeRate = function (rate_USD_bit, rate_BTC_USD, rate_ETH_USD, callback) {
    /* getClient(function(client, callback)
    { */
    save_USD_bit();
    function save_USD_bit () {
        var sql = "SELECT * FROM common WHERE strkey = 'rate_USD_bit'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                lib.log('info', 'setting - insert rate_usd_bit [begin] :' + rate_USD_bit);
                console.log('setting - insert rate_usd_bit [begin] :' + rate_USD_bit);
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['rate_USD_bit', rate_USD_bit], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - insert rate_usd_bit [end] :' + rate_USD_bit);
                    console.log('setting - insert rate_usd_bit [end] :' + rate_USD_bit);
                    if (res.rowCount == 1) { return save_BTC_USD(); }

                    return callback('ERROR_USD_BIT 1');
                });
            } else {
                lib.log('info', 'setting - update rate_usd_bit [begin] :' + rate_USD_bit);
                console.log('setting - update rate_usd_bit [begin] :' + rate_USD_bit);
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='rate_USD_bit'";
                query(sql, [rate_USD_bit], function (err, res) {
                    if (err) save_BTC_USD();

                    lib.log('info', 'setting - update rate_usd_bit [begin] :' + rate_USD_bit);
                    console.log('setting - update rate_usd_bit [begin] :' + rate_USD_bit);
                    if (res.rowCount == 1) { return save_BTC_USD(); }
                    return callback('ERROR_USD_BIT 2');
                });
            }
        });
    }

    function save_BTC_USD () {
        var sql = "SELECT * FROM common WHERE strkey = 'rate_BTC_USD'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                lib.log('info', 'setting - insert rate_btc_usd [begin] :' + rate_BTC_USD);
                console.log('setting - insert rate_btc_usd [begin] :' + rate_BTC_USD);
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['rate_BTC_USD', rate_BTC_USD], function (err, res) {
                    if (err) return callback(err);
                    lib.log('info', 'setting - insert rate_btc_usd [end] :' + rate_BTC_USD);
                    console.log('setting - insert rate_btc_usd [end] :' + rate_BTC_USD);

                    if (res.rowCount == 1) { return save_ETH_USD(); }

                    return callback('ERROR_ETH_USD 1');
                });
            } else {
                lib.log('info', 'setting - update rate_btc_usd [end] :' + rate_BTC_USD);
                console.log('setting - update rate_btc_usd [end] :' + rate_BTC_USD);
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='rate_BTC_USD'";
                query(sql, [rate_BTC_USD], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - update rate_btc_usd [end] :' + rate_BTC_USD);
                    console.log('setting - update rate_btc_usd [end] :' + rate_BTC_USD);
                    if (res.rowCount == 1) { return save_ETH_USD(); }
                    return callback('ERROR_ETH_USD 2');
                });
            }
        });
    }

    function save_ETH_USD () {
        var sql = "SELECT * FROM common WHERE strkey = 'rate_ETH_USD'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                lib.log('info', 'setting - insert rate_eth_usd [end] :' + rate_ETH_USD);
                console.log('setting - insert rate_eth_usd [end] :' + rate_ETH_USD);
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['rate_ETH_USD', rate_ETH_USD], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - insert rate_eth_usd [end] :' + rate_ETH_USD);
                    console.log('setting - insert rate_eth_usd [end] :' + rate_ETH_USD);

                    if (res.rowCount == 1) { return callback(null, true); }

                    return callback('ERROR_ETH_USD 1');
                });
            } else {
                lib.log('info', 'setting - update rate_eth_usd [end] :' + rate_ETH_USD);
                console.log('setting - update rate_eth_usd [end] :' + rate_ETH_USD);
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='rate_ETH_USD'";
                query(sql, [rate_ETH_USD], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - update rate_eth_usd [end] :' + rate_ETH_USD);
                    console.log('setting - update rate_eth_usd [end] :' + rate_ETH_USD);

                    if (res.rowCount == 1) { return callback(null, true); }
                    return callback('ERROR_ETH_USD 2');
                });
            }
        });
    }
    /* }, callback); */
};

exports.getExchangeRate = function (callback) {
    var sql = "SELECT * FROM common WHERE strkey LIKE 'rate_%'";
    query(sql, function (err, res) {
        if (err) { return callback(err); }
        var result = res.rows;
        if (result.length == 0) {
            result.push({strkey: 'rate_USD_bit', strvalue: 100});
            result.push({strkey: 'rate_BTC_USD', strvalue: 10000});
            result.push({strkey: 'rate_ETH_USD', strvalue: 6000});
        }
        return callback(null, res.rows);
    });
};

exports.saveAgentProfitPercent = function (agent_percent_parent1, agent_percent_parent2, agent_percent_parent3, agent_percent_masterib,
    agent_percent_agent, agent_percent_company, agent_percent_staff, callback) {
    /* getClient(function(client, callback)
    { */

    lib.log('info', 'setting - agent_percent_parent1, agent_percent_parent1, agent_percent_parent2, agent_percent_parent3, agent_percent_masterib,\n' +
        '    agent_percent_agent, agent_percent_company, agent_percent_staff:' + agent_percent_parent1 + '   ' + agent_percent_parent2 + '   ' + agent_percent_parent3 + '   ' + agent_percent_masterib + '   ' + agent_percent_agent + '   ' + agent_percent_company + '   ' + agent_percent_staff);
    console.log('setting - agent_percent_parent1, agent_percent_parent1, agent_percent_parent2, agent_percent_parent3, agent_percent_masterib,\n' +
        '    agent_percent_agent, agent_percent_company, agent_percent_staff:' + agent_percent_parent1 + '   ' + agent_percent_parent2 + '   ' + agent_percent_parent3 + '   ' + agent_percent_masterib + '   ' + agent_percent_agent + '   ' + agent_percent_company + '   ' + agent_percent_staff);
    save_agent_percent_parent1();

    function save_agent_percent_parent1 () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_parent1'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_parent1', agent_percent_parent1], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return save_agent_percent_parent2(); }

                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_parent1'";
                query(sql, [agent_percent_parent1], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return save_agent_percent_parent2();
                    }
                    return callback(null, false);
                });
            }
        });
    }

    function save_agent_percent_parent2 () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_parent2'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_parent2', agent_percent_parent2], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return save_agent_percent_parent3(); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_parent2'";
                query(sql, [agent_percent_parent2], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return save_agent_percent_parent3();
                    }
                    return callback(null, false);
                });
            }
        });
    }

    function save_agent_percent_parent3 () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_parent3'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_parent3', agent_percent_parent3], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return save_agent_percent_masterib(); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_parent3'";
                query(sql, [agent_percent_parent3], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return save_agent_percent_masterib();
                    }
                    return callback(null, false);
                });
            }
        });
    }

    function save_agent_percent_masterib () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_masterib'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_masterib', agent_percent_masterib], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return save_agent_percent_agent(); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_masterib'";
                query(sql, [agent_percent_masterib], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return save_agent_percent_agent();
                    }
                    return callback(null, false);
                });
            }
        });
    }

    function save_agent_percent_agent () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_agent'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_agent', agent_percent_agent], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return save_agent_percent_company(); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_agent'";
                query(sql, [agent_percent_agent], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return save_agent_percent_company();
                    }
                    return callback(null, false);
                });
            }
        });
    }

    function save_agent_percent_company () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_company'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_company', agent_percent_company], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return save_agent_percent_staff(); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_company'";
                query(sql, [agent_percent_company], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return save_agent_percent_staff();
                    }
                    return callback(null, false);
                });
            }
        });
    }

    function save_agent_percent_staff () {
        var sql = "SELECT * FROM common WHERE strkey = 'agent_percent_staff'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['agent_percent_staff', agent_percent_staff], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) { return callback(null, true); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='agent_percent_staff'";
                query(sql, [agent_percent_staff], function (err, res) {
                    if (err) return callback(err);

                    if (res.rowCount == 1) {
                        return callback(null, true);
                    }
                    return callback(null, false);
                });
            }
        });
    }
    /* }, callback); */
};

exports.getAgentProfitPercent = function (callback) {
    var sql = "SELECT * FROM common WHERE strkey LIKE 'agent_%'";
    query(sql, function (err, res) {
        if (err) { return callback(err); }
        var params = {};
        for (var i = 0; i < res.rowCount; i++) {
            params[res.rows[i].strkey] = res.rows[i].strvalue;
        }
        if (params['agent_percent_parent1'] === undefined || params['agent_percent_parent1'] === null) params['agent_percent_parent1'] = 0;
        if (params['agent_percent_parent2'] === undefined || params['agent_percent_parent2'] === null) params['agent_percent_parent2'] = 0;
        if (params['agent_percent_parent3'] === undefined || params['agent_percent_parent3'] == null) params['agent_percent_parent3'] = 0;
        if (params['agent_percent_masterib'] === undefined || params['agent_percent_masterib'] === null) params['agent_percent_masterib'] = 0;
        if (params['agent_percent_agent'] === undefined || params['agent_percent_agent'] === null) params['agent_percent_agent'] = 0;
        if (params['agent_percent_company'] === undefined || params['agent_percent_company'] === null) params['agent_percent_company'] = 0;
        if (params['agent_percent_staff'] === undefined || params['agent_percent_staff'] == null) params['agent_percent_staff'] = 0;
        if (params['agent_percent_max_profit'] === undefined || params['agent_percent_max_profit'] === null) params['agent_percent_max_profit'] = 0;

        return callback(null, params);
    });
};

// get ETH / BTC Exchange rate
exports.getETHvsBTCRate = function (callback) {
    getExchangeRates(function (err, exchangeRates) {
        if (err) return callback(err);
        if (exchangeRates['rate_BTC_USD'] == 0) return callback('Invalid rate_BTC_USD value. Divided by zero.');
        return callback(null, exchangeRates['rate_ETH_USD'] / exchangeRates['rate_BTC_USD']);
    });
};

function getExchangeRates (callback) {
    query("SELECT * FROM common WHERE strkey LIKE 'rate_%'", function (err, result) {
        if (err) return callback(err);
        var exchangeRates = {};
        for (var i = 0; i < result.rows.length; i++) { exchangeRates[result.rows[i]['strkey']] = result.rows[i]['strvalue']; }
        return callback(null, exchangeRates);
    });
}

exports.getBTCvsBitRate = function (callback) {
    getExchangeRates(function (err, exchangeRates) {
        if (err) return callback(err);
        var BTCvsBitRate = exchangeRates['rate_BTC_USD'] * exchangeRates['rate_USD_bit'];
        return callback(null, BTCvsBitRate);
    });
};

/*
 * record messages sent from support center by clients
 */
exports.saveSupport = function (user_id, email, message_to_admin, callback) {
    /* getClient(function(client, callback)
    { */
    /* client. */query('INSERT INTO supports (user_id, email, message_to_admin, read) VALUES($1, $2, $3, $4)', [user_id, email, message_to_admin, false], function (err, results) {
        if (err) return callback(err);
        return callback(null, results);
    });
    /* }, callback); */
};

/*
 * set the support flag as read state
 */
exports.setSupportReadFlag = function (supportId, flag, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE supports SET read = $1 WHERE id = $2';
    /* client. */query(sql, [flag, supportId], function (err, data) {
        if (err) return callback(err);
        callback(null, true);
    });
    /* }, callback); */
};

/*
 * save reply message to support table
 */
exports.replySupport = function (supportId, msg2User, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE supports SET message_to_user = $1, reply_check = $2, replied = NOW() WHERE id = $3 RETURNING ' +
            'to_char(created, \'YYYY-MM-DD  HH24:MI:SS\') as created,' +
            'to_char(replied, \'YYYY-MM-DD  HH24:MI:SS\') as replied';
    /* client. */query(sql, [msg2User, false, supportId], function (err, data) {
        if (err) return callback(err);
        callback(null, data.rows[0]);
    });
    /* }, callback); */
};

/*
 * get all the support message
 */
exports.getSupportList = function (type, time_zone, callback) {
    var sql = 'SELECT * FROM\n' +
        '(SELECT sup.id, usr.username, sup.email, sup.message_to_admin, sup.message_to_user,' +
        "sup.created at time zone '" + time_zone + "' AS created, " +
        "sup.replied at time zone '" + time_zone + "' AS replied, sup.read " +
        'FROM supports sup ' +
        'LEFT JOIN users usr ON sup.user_id = usr.id) AS t\n' +
        'WHERE t.created<>t.replied OR t.replied IS NULL\n' +
        'ORDER BY created DESC;';

    query(sql, function (err, data) {
        if (err) return callback(err);
        callback(null, data.rows);
    });
};

/*
 * get a support messages for a user id
 */
exports.getSupportFromUserId = function (user_id, callback) {
    var sql = 'SELECT * FROM supports WHERE user_id=$1';
    query(sql, [user_id], function (err, res) {
        if (err) return callback(err);
        callback(null, res.rows);
    });
};

// set intervals
exports.saveIntervals = function (intervals, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'DELETE FROM intervals';
    /* client. */query(sql, function (err, res) {
        if (err) { return callback(err); }
        sql = 'SELECT MAX(nid) AS max_nId FROM intervals';
        query(sql, function (err, res) {
            var maxId = res['rows'][0]['max_nId'];
            maxId = (maxId == null) ? 1 : (maxId + 1);

            var data = [];
            for (var i = 0; i < intervals.length; i++) {
                sql = 'INSERT INTO intervals (nid, interval_start, interval_end, percentage) VALUES ($1, $2, $3, $4)';
                var interval_start = parseInt(intervals[i]['interval_start'] * 100);
                var interval_end = parseInt(intervals[i]['interval_end'] * 100);
                var percentage = parseInt(intervals[i]['percentage'] * 100);
                lib.log('info', 'setting - interval_start, interval_end, percentage :' + interval_start + ', ' + interval_end + ', ' + percentage);
                console.log('setting - interval_start, interval_end, percentage :' + interval_start + ', ' + interval_end + ', ' + percentage);
                /* client. */query(sql, [maxId + i, interval_start, interval_end, percentage], function (err, res) {
                    if (err) { return callback(err); }
                });
            }
            callback(null, true);
        });
    });
    /* }, callback); */
};

exports.getIntervals = function (callback) {
    var sql = 'SELECT * FROM intervals ORDER BY interval_start';
    query(sql, function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

exports.saveBetRanges = function (betRanges, callback) {
    var sql = 'DELETE FROM range_bet';
    var tasks = [];

    query(sql, function (err, res) {
        if (err) {
            return callback(err);
        }

        var tasks = [];
        sql = 'INSERT INTO range_bet (id, range_from, range_to, range_multiplier) VALUES ($1, $2, $3, $4)';
        betRanges.forEach(function (range, index) {
            var range_from = parseInt(range['range_from']);
            var range_to = parseInt(range['range_to']);
            var range_multiplier = range['range_multiplier'];

            lib.log('info', 'setting - range_from, range_to, percentage :' + range_from + ', ' + range_to + ', ' + range_multiplier);
            console.log('setting - range_from, range_to, percentage :' + range_from + ', ' + range_to + ', ' + range_multiplier);
            /* client. */
            tasks.push(function (callback) {
                query(sql, [index + 1, range_from, range_to, range_multiplier], callback);
            });
        });

        if (tasks.length > 0) {
            async.series(tasks, function (err) {
                return callback(null, true);
            });
        }
    });
};

/**
 * Getting Bet Ranges
 * @author Bio
 * @since 2018.6.5
 * @param callback
 */
exports.getBetRanges = function (callback) {
    var sql = 'SELECT * FROM range_bet ORDER BY range_from';
    query(sql, function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

exports.setIntervalStatus = function (interval_status, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'interval_status'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert interval_status [begin] :' + interval_status);
            console.log('setting - insert interval_status [begin] :' + interval_status);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['interval_status', interval_status], function (err, res) {
                if (err) return callback(err);
                lib.log('info', 'setting - insert interval_status [end] :' + interval_status);
                console.log('setting - insert interval_status [end] :' + interval_status);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        lib.log('info', 'setting - update interval_status [begin] :' + interval_status);
        console.log('setting - update interval_status [begin] :' + interval_status);
        sql = "UPDATE common SET strvalue=$1 WHERE strkey='interval_status'";
        query(sql, [interval_status], function (err, res) {
            if (err) return callback(err);
            lib.log('info', 'setting - update interval_status [end] :' + interval_status);
            console.log('setting - update interval_status [end] :' + interval_status);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
};

exports.saveDemoAccount = function (demo_account_info, callback) {
    var strName = demo_account_info['name'];
    var strPassword = demo_account_info['password'];
    var hashedPassword = passwordHash.generate(strPassword);

    /* getClient(function(client, callback)
    { */
    query('SELECT * FROM users WHERE lower(username)=lower($1) AND demo=false', [strName], function (err, res) {
        if (err) return callback({state: 'DEMO_ERROR_1'});
        if (res.rowCount > 0) return callback({state: 'ALREADY_EXIST'});

        query('SELECT * FROM users WHERE lower(username)=lower($1) AND demo=true', [strName], function (err, res) {
            if (err) return callback({state: 'DEMO_ERROR_2'});
            if (res.rowCount > 0) { // already demo exists. : update needed.
                var sql = 'UPDATE users SET password=$1,demo_password=$2 WHERE lower(username)=lower($3) AND demo=true';
                /* client. */query(sql, [hashedPassword, strPassword, strName], function (err, data) {
                    if (err) return callback({state: 'DEMO_ERROR_3'});
                    return callback({state: 'UPDATED'});
                });
            } else {
                // create new demo
                var sql = "SELECT MAX(path) FROM users WHERE path LIKE '___'";
                query(sql, function (err, data) {
                    if (err) return callback({state: 'DEMO_ERROR_4'});

                    var max_path = lib.calculateNextPath(data.rows[0]['max']);
                    var nextId;
                    var sql = 'SELECT MAX(id) FROM users';
                    query(sql, function (err, result) {
                        if (err) return callback({state: 'DEMO_ERROR_5'});

                        nextId = result.rows[0]['max'];
                        nextId = (nextId == null) ? 1 : (nextId + 1);

                        sql = 'INSERT INTO users(username, email, password, balance_satoshis, path, demo, demo_password, can_chat, playing, id, did_ref_deposit) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)';
                        query(sql, [strName, '', hashedPassword, 0, max_path, true, strPassword, false, false, nextId, true], function (err, result) {
                            if (err) return callback({state: 'DEMO_ERROR_6'});

                            var cwd = 'theme/img/photos/';
                            if (config.PRODUCTION === config.PRODUCTION_LINUX || config.PRODUCTION === config.PRODUCTION_WINDOWS) {
                                cwd = 'build/img/photos/';
                            }

                            var src = cwd + 'demo.jpg';
                            var dst = cwd + strName + '.jpg';
                            fs.copyFile(src, dst, function (error) {
                                if (error) return callback({state: 'DEMO_ERROR_7'});
                                return callback({state: 'CREATED'});
                            });
                        });
                    });
                });
            }
        });
    });
    /* }, callback); */
};

exports.deleteDemoAccount = function (strName, callback) {
    /* getClient(function(client, callback)
    { */
    /* client. */query('DELETE FROM users WHERE lower(username)=lower($1) AND demo=true', [strName], function (err, res) {
        if (err) return callback('DEMO_ERROR_6');

        var cwd = 'theme/img/photos/';
        if (config.PRODUCTION === config.PRODUCTION_LINUX || config.PRODUCTION === config.PRODUCTION_WINDOWS) {
            cwd = 'build/img/photos/';
        }

        var dst = cwd + strName + '.jpg';
        fs.unlink(dst, function (error) {
            // if (error) throw error;
            return callback('DELETED');
        });
    });
    /* }, callback); */
};

exports.getDemoAccountList = function (callback) {
    query('SELECT username,demo_password,balance_satoshis FROM users WHERE demo=true ORDER BY username ASC', [], function (err, res) {
        if (err) return callback({});
        return callback(res.rows);
    });
};

// Save Title and URL of Tutorial
exports.saveTutorials = function (tutorials, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'DELETE FROM tutorials';
    /* client. */query(sql, function (err, res) {
        if (err) { return callback(err); }
        sql = 'SELECT MAX(nId) AS max_nId FROM tutorials';
        query(sql, function (err, res) {
            var maxId = res['rows'][0]['max_nId'];
            maxId = (maxId == null) ? 1 : (maxId + 1);

            var data = [];
            if (tutorials == undefined) {
                return callback(null, true);
            }
            for (var i = 0; i < tutorials.length; i++) {
                sql = 'INSERT INTO tutorials (nId, title, url) VALUES ($1, $2, $3)';
                var title = tutorials[i]['title'];
                var url = tutorials[i]['url'];
                /* client. */query(sql, [maxId + i, title, url], function (err, res) {
                    if (err) { return callback(err); }
                });
            }
            callback(null, true);
        });
    });
    /* }, callback); */
};

// Get Tutorials
exports.getTutorials = function (callback) {
    var sql = 'SELECT * FROM tutorials';
    query(sql, [], function (err, res) {
        if (err) { return callback(err); }
        callback(null, res.rows);
    });
};

// Admin -> Company Statistics.  Profit Per Month
exports.getCompanyProfitPerMonth = function (callback) {
    var sql = "SELECT (SUM(bet)-SUM(cash_out)) / 100000000.0 AS profit, to_char(created, 'YYYY-MM') AS game_date " +
        'FROM plays ' +
        'GROUP BY game_date ' +
        'ORDER BY game_date ASC';
    query(sql, [], function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

// Admin -> Company Statistics.  Profit Per Week
exports.getCompanyProfitPerWeek = function (callback) {
    var sql = "SELECT (SUM(bet)-SUM(cash_out)) / 100.0 AS profit, to_char(created, 'YYYY-MM No.W') AS game_date " +
        'FROM plays ' +
        'GROUP BY game_date ' +
        'ORDER BY game_date ASC';
    query(sql, [], function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

// Admin -> Company Statistics.  Profit Per Day
exports.getCompanyProfitPerDay = function (callback) {
    var sql = "SELECT (SUM(bet)-SUM(cash_out)) / 100.0 AS profit, to_char(created, 'YYYY-MM-DD') AS game_date " +
        'FROM plays ' +
        'GROUP BY game_date ' +
        'ORDER BY game_date ASC';
    query(sql, [], function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

// Admin -> Customer Statistics.  Profit Per Game
exports.getCustomerProfitPerGame = function (callback) {
    var sql = 'SELECT game_id, (SUM(cash_out) - SUM(bet)) / 100.0 AS customer_profit_sum ' +
        'FROM plays ' +
        'GROUP BY game_id ' +
        'ORDER BY game_id ASC';
    query(sql, [], function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

// Admin -> Customer Statistics.  Profit Per Day
exports.getCustomerProfitPerDay = function (callback) {
    var sql = "SELECT (SUM(cash_out) - SUM(bet)) / 100.0 AS customer_profit_sum, to_char(created, 'YYYY-MM-DD') AS created_date " +
        'FROM plays ' +
        'GROUP BY created_date ' +
        'ORDER BY created_date ASC';
    query(sql, [], function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

exports.makeTransfer = function (uid, fromUserId, toUsername, satoshis, fee, all, callback) {
    assert(typeof fromUserId === 'number');
    assert(typeof toUsername === 'string');
    assert(typeof satoshis === 'number');

    // Update balances
    getClient(function (client, callback) {
        async.waterfall([
            function (callback) {
                client.query("UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE username = 'madabit'",
                    [fee], callback);
            },
            function (prevData, callback) {
                client.query('UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE id = $2',
                    [all, fromUserId], callback);
            },
            function (prevData, callback) {
                client.query(
                    'UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE lower(username) = lower($2) RETURNING id',
                    [satoshis, toUsername], function (err, data) {
                        if (err) { return callback(err); }
                        if (data.rowCount === 0) { return callback('USER_NOT_EXIST'); }
                        var toUserId = data.rows[0].id;
                        assert(Number.isInteger(toUserId));
                        callback(null, toUserId);
                    });
            },
            function (toUserId, callback) {
                client.query(
                    'INSERT INTO transfers (id, from_user_id, to_user_id, amount, fee, created) values($1,$2,$3,$4,$5,now()) ',
                    [uid, fromUserId, toUserId, satoshis, fee], callback);
            }
        ], function (err) {
            if (err) {
                if (err.code === '23514') { // constraint violation
                    return callback('NOT_ENOUGH_BALANCE');
                }
                if (err.code === '23505') { // dupe key
                    return callback('TRANSFER_ALREADY_MADE');
                }

                return callback(err);
            }
            callback();
        });
    }, callback);
};

exports.TokenTransfer = function (param, callback) {
    var sql = 'UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE token_address = $2 RETURNING id';
    query(sql, [param.amount, param.source], function (err, source_user_id) {
        if (err) { return callback(err); }
        var source_user_id = source_user_id.rows[0]['id'];
        sql = 'UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE token_address = $2 RETURNING id';
        query(sql, [param.amount, param.target], function (err, target_user_id) {
            if (err) { return callback(err); }
            target_user_id = target_user_id.rows[0];

            sql = 'SELECT MAX(id) as max_id FROM transfers';
            query(sql, function (err, max_id) {
                if (err) { callback(err); }

                max_id = max_id[0]['max_id'];
                var new_id = (max_id == null) ? 1 : (max_id + 1);

                sql = 'INSERT INTO transfers (id, from_user_id, to_user_id, amount, fee, created) values($1, $2 , $3, $4, 0, now()';
                query(sql, [new_id, source_user_id, target_user_id, amount], function (err, data) {
                    if (err) { callback(err); }
                    callback(true);
                });
            });
        });
    });
    return callback(err);
};

exports.getTransfers = function (userId, time_zone, callback) {
    assert(userId);
    assert(callback);

    var sql = 'SELECT ' +
        'transfers.id, ' +
        'transfers.amount, ' +
        'transfers.fee, ' +
        '(SELECT users.username FROM users WHERE users.id = transfers.from_user_id) AS from_username, ' +
        '(SELECT users.username FROM users WHERE users.id = transfers.to_user_id) AS to_username, ' +
        "transfers.created at time zone '" + time_zone + "' AS created " +
        'FROM transfers ' +
        'WHERE from_user_id = $1 ' +
        'OR   to_user_id = $1 ' +
        'ORDER by transfers.created DESC ' +
        'LIMIT 250';

    query(sql, [userId], function (err, data) {
        if (err) { return callback(err); }

        callback(null, data.rows);
    });
};

/*
 * save the ethereum deposit source address for a user
 */
exports.saveETHUserAddress = function (userid, eth_src, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * FROM eth_deposit_src WHERE user_id = $1';
    query(sql, [userid], function (err, res) {
        if (err) return callback(err);
        if (res.rows.length == 1) {
            if (res.rows[0].eth_addr == eth_src) return callback(null);
            sql = 'UPDATE eth_deposit_src SET eth_addr=$1 WHERE user_id=$2';
            /* client. */query(sql, [eth_src.toLowerCase(), userid], function (error, result) {
                if (error) return callback(error);
                return callback(null);
            });
        } else {
            sql = 'INSERT INTO eth_deposit_src(user_id, eth_addr) VALUES($1, $2)';
            /* client. */query(sql, [userid, eth_src.toLowerCase()], function (error, result) {
                if (err) return callback(error);
                return callback(null);
            });
        }
    });
    /* }, callback); */
};

/*
 * get the ethereum deposit source address for a user
 */
exports.getETHUserAddress = function (userid, callback) {
    var sql = 'SELECT * FROM eth_deposit_src WHERE user_id = $1';
    query(sql, [userid], function (err, result) {
        if (err) return callback(err);
        if (result.rowCount == 0) return callback(null, '');
        return callback(null, result.rows[0].eth_addr);
    });
};

/*
 * load the ethereum address for a game site
 */
exports.loadCompanyETHInfo = function (callback) {
    var addr, pass;
    var retval = {};

    var sql = "SELECT strvalue FROM common WHERE strkey='eth_address'";
    query(sql, function (error, result) {
        if (error) return callback(error);
        if (result.rows.length != 0) { addr = result.rows[0].strvalue; } else addr = '';

        sql = "SELECT strvalue FROM common WHERE strkey='eth_password'";
        query(sql, function (err, res) {
            if (err) return callback(err);
            if (res.rows.length != 0) { pass = res.rows[0].strvalue; } else pass = '';

            retval['addr'] = addr;
            retval['pass'] = pass;
            return callback(null, retval);
        });
    });
};

exports.getTipFee = function (callback) {
    query("SELECT strvalue FROM common WHERE strkey = 'tipfee'", [], function (err, tipfee) {
        if (err) return callback(err);
        if (tipfee.rowCount == 0) return callback(null, 1);
        return callback(null, tipfee.rows[0].strvalue);
    });
};

/**
 * Get get profit statistiscs as tree for user and admin
 * @author Bio
 * @param param.user_id
 * @param param.date_from
 * @param param.date_to
 * @param param.time_zone_name
 * @param param.is_admin
 * @param callback
 */
exports.getAgentProfitStatistics = function (param, callback) {
    var statistics = {};
    statistics['players'] = [];
    statistics['total_profit'] = 0.0; // profits to current user from children
    statistics['total_funding_bonus'] = 0.0;
    statistics['total_bet'] = 0.0;
    statistics['total_gross_profit'] = 0.0;
    statistics['total_net_profit'] = 0.0;
    statistics['total_deposit'] = 0.0;
    statistics['total_withdraw'] = 0.0;
    statistics['total_balance'] = 0.0;
    statistics['player_count_layer1'] = 0;
    statistics['player_count_layer2'] = 0;
    statistics['player_count_layer3'] = 0;

    var sql = 'SELECT * FROM users WHERE id = ' + param.user_id;
    query(sql, [], function (err, userInfo) {
        userInfo = userInfo.rows[0];

        if (userInfo.is_parent == false || userInfo.userclass == 'user' || userInfo.userclass == 'admin' ||
            userInfo.userclass == 'superadmin' || userInfo.userclass == 'staff' || userInfo.username == 'staff') {
            return callback(null, null);
        }

        var path = userInfo.path;
        var path_depth = path.length / 3;
        var sql = 'SELECT u.id AS user_id, username, (LENGTH(u.path)/3 - ' + path_depth + ') AS path_depth, parent1, u.path, (u.balance_satoshis / 100) AS balance_satoshis, userclass ' +
            'FROM users u ';
        var whereClause = "WHERE u.path LIKE '" + path + "%'";
        if (userInfo.userclass != 'master_ib') {
            whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
        } else {
            whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
        }
        sql += whereClause + ' ORDER BY u.path ASC';

        query(sql, [], function (err, playerList) {
            playerList = playerList.rows;

            sql = 'SELECT user_id, username, path, path_depth, parent1, ' +
                'SUM(COALESCE(all_bet, 0))/100.0 AS sum_bet, ' +
                'SUM(COALESCE(gross_profit, 0))/100.0 AS sum_gross_profit, ' +
                'SUM(COALESCE(net_profit, 0))/100.0 AS sum_net_profit, ' +
                'SUM(COALESCE(profit_for_parent1, 0))/100.0 AS sum_profit_for_parent1, ' +
                'SUM(COALESCE(profit_for_parent2, 0))/100.0 AS sum_profit_for_parent2, ' +
                'SUM(COALESCE(profit_for_parent3, 0))/100.0 AS sum_profit_for_parent3, ' +
                'SUM(COALESCE(profit_for_master_ib, 0))/100.0 AS sum_profit_for_master_ib,' +
                'SUM(COALESCE(first_deposit_profit, 0))/100.0, ' +
                '0 AS sum_deposit,' +
                '0 AS sum_withdraw ' +
                'FROM ' +
                '(' +
                'SELECT u.id AS user_id, u.username, CASE WHEN (p.cash_out - p.bet - p.extra_bet - p.range_bet_amount) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet - p.range_bet_amount) END AS gross_profit, u.parent1, ' +
                '(p.cash_out - p.bet - p.extra_bet - p.range_bet_amount) net_profit, u.path, (LENGTH(u.path)/3 - ' + path_depth + ') AS path_depth, ' +
                'p.bet + p.extra_bet + p.range_bet_amount AS all_bet, p.profit_for_parent1, p.profit_for_parent2, p.profit_for_parent3, p.profit_for_master_ib, p.first_deposit_profit ' +
                'FROM users u ' +
                'LEFT JOIN plays p ON p.user_id = u.id ';
            var whereClause = "WHERE u.path LIKE '" + path + "%' ";
            if (userInfo.userclass != 'master_ib') {
                whereClause += 'AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
            } else { whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 '; }

            // if(!param.is_admin) {
            whereClause = whereClause +
                                " AND p.created at time zone '" + param.time_zone_name + "' >= '" + param.date_from + "' AND " +
                                "p.created at time zone '" + param.time_zone_name + "' <= '" + param.date_to + "'";
            // }

            sql += whereClause + ') t ' +
                    'GROUP BY t.user_id, t.username, t.path, t.path_depth, t.parent1 ' +
                    'ORDER BY t.path ASC';

            query(sql, [], function (err, playersStatistics) {
                if (err) return callback(err);
                playersStatistics = playersStatistics.rows;

                var userIdMap = {};
                for (var i = 0; i < playerList.length; i++) {
                    userIdMap[playerList[i]['user_id']] = i;
                    statistics['total_balance'] += playerList[i]['balance_satoshis'];
                }

                for (var i = 0; i < playersStatistics.length; i++) {
                    var index = userIdMap[playersStatistics[i]['user_id']];
                    var balance_satoshis = playerList[index]['balance_satoshis'];
                    var userclass = playerList[index].userclass;
                    playerList[index] = playersStatistics[i];
                    playerList[index]['balance_satoshis'] = balance_satoshis;
                    playerList[index]['userclass'] = userclass;
                }

                statistics['players'] = playerList;

                for (var i = 0; i < playersStatistics.length; i++) {
                    var total_profit = 0.0;

                    if (playersStatistics[i]['path_depth'] == 1) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_parent1']);
                        statistics['player_count_layer1']++;

                        statistics['total_funding_bonus'] += Math.round(playersStatistics[i]['first_deposit_profit']);
                    } else if (playersStatistics[i]['path_depth'] == 2) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_parent2']);
                        statistics['player_count_layer2']++;
                    } else if (playersStatistics[i]['path_depth'] == 3) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_parent3']);
                        statistics['player_count_layer3']++;
                    } else if (playersStatistics[i]['path_depth'] > 3) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_master_ib']);
                    }

                    statistics['total_bet'] += parseFloat(playersStatistics[i]['sum_bet']);
                    statistics['total_gross_profit'] += parseFloat(playersStatistics[i]['sum_gross_profit']);
                    statistics['total_net_profit'] += parseFloat(playersStatistics[i]['sum_net_profit']);
                    // statistics['total_balance'] += parseFloat(playersStatistics[i]['balance_satoshis']);
                }

                sql = 'SELECT user_id, SUM(amount)/100.0 AS sum_deposit ' +
                        'FROM fundings f ' +
                        'LEFT JOIN users u ON u.id = f.user_id ';

                var whereClause = "WHERE u.path LIKE '" + path + "%' AND f.amount > 0 ";
                if (userInfo.userclass != 'master_ib') {
                    whereClause += 'AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
                } else {
                    whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
                }
                // if(!param.is_admin) {
                whereClause += " AND f.created at time zone '" + param.time_zone_name + "' >= '" + param.date_from + "' AND " +
                                    "f.created at time zone '" + param.time_zone_name + "' <= '" + param.date_to + "' ";
                // }

                var groupByClause = 'GROUP BY f.user_id ';
                var orderByClause = 'ORDER BY f.path ASC';

                query(sql + whereClause + groupByClause, function (err, depositStatistics) {
                    if (err) return callback(err);

                    depositStatistics = depositStatistics.rows;
                    for (var i = 0; i < depositStatistics.length; i++) {
                        playerList[userIdMap[depositStatistics[i]['user_id']]]['sum_deposit'] = depositStatistics[i]['sum_deposit'];
                        statistics['total_deposit'] += parseFloat(depositStatistics[i]['sum_deposit']);
                    }

                    sql = 'SELECT user_id, SUM(amount)/100.0 AS sum_withdraw ' +
                        'FROM fundings f ' +
                        'LEFT JOIN users u ON u.id = f.user_id ';
                    whereClause = "WHERE u.path LIKE '" + path + "%' AND f.amount < 0 ";

                    if (userInfo.userclass != 'master_ib') {
                        whereClause += 'AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
                    }

                    whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 ';

                    if (!param.is_admin) {
                        whereClause += " AND f.created at time zone '" + param.time_zone_name + "' >= '" + param.date_from + "' AND " +
                                       "f.created at time zone '" + param.time_zone_name + "' <= '" + param.date_to + "' ";
                    }
                    query(sql + whereClause + groupByClause, function (err, withdrawStatistics) {
                        if (err) return callback(err);

                        withdrawStatistics = withdrawStatistics.rows;
                        for (var i = 0; i < withdrawStatistics.length; i++) {
                            playerList[userIdMap[withdrawStatistics[i].user_id]]['sum_withdraw'] = withdrawStatistics[i]['sum_withdraw'];
                            statistics['total_withdraw'] += parseFloat(withdrawStatistics[i]['sum_withdraw']);
                        }
                        return callback(null, statistics);
                    });
                });
            });
        });
    });
};

exports.getAgentProfitStatisticsForAdmin = function (user_id, date_from, date_to, time_zone_name, callback) {
    var statistics = {};
    statistics['players'] = [];
    statistics['total_profit'] = 0.0; // profits to current user from children
    statistics['total_funding_bonus'] = 0.0;
    statistics['total_bet'] = 0.0;
    statistics['total_gross_profit'] = 0.0;
    statistics['total_net_profit'] = 0.0;
    statistics['total_deposit'] = 0.0;
    statistics['total_withdraw'] = 0.0;
    statistics['total_balance'] = 0.0;
    statistics['player_count_layer1'] = 0;
    statistics['player_count_layer2'] = 0;
    statistics['player_count_layer3'] = 0;

    var sql = 'SELECT * FROM users WHERE id = ' + user_id;
    query(sql, [], function (err, userInfo) {
        userInfo = userInfo.rows[0];

        if (userInfo.is_parent == false || userInfo.userclass == 'user' || userInfo.userclass == 'admin' || userInfo.userclass == 'superadmin' || userInfo.userclass == 'staff' || userInfo.username == 'staff') {
            return callback(null, null);
        }
        var path = userInfo.path;
        var path_depth = path.length / 3;
        var sql = 'SELECT u.id AS user_id, username, (LENGTH(u.path)/3 - ' + path_depth + ') AS path_depth, parent1, u.path, (u.balance_satoshis / 100) AS balance_satoshis ' +
            'FROM users u ';
        var whereClause = "WHERE u.path LIKE '" + path + "%'";
        if (userInfo.userclass != 'master_ib') {
            whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
        } else {
            whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
        }
        sql += whereClause + ' ORDER BY u.path ASC';

        query(sql, [], function (err, playerList) {
            playerList = playerList.rows;

            var sql = 'SELECT user_id, username, path, path_depth, parent1, SUM(all_bet)/100.0 AS sum_bet, ' +
                'SUM(gross_profit)/100.0 AS sum_gross_profit, SUM(net_profit)/100.0 AS sum_net_profit, ' +
                'SUM(profit_for_parent1)/100.0 AS sum_profit_for_parent1, ' +
                'SUM(profit_for_parent2)/100.0 AS sum_profit_for_parent2, ' +
                'SUM(profit_for_parent3)/100.0 AS sum_profit_for_parent3, ' +
                'SUM(profit_for_master_ib)/100.0 AS sum_profit_for_master_ib,' +
                'SUM(first_deposit_profit)/100.0, ' +
                '0 AS sum_deposit,' +
                '0 AS sum_withdraw ' +
                'FROM ' +
                '(' +
                'SELECT u.id AS user_id, u.username, CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END AS gross_profit, u.parent1, ' +
                '(p.cash_out - p.bet - p.extra_bet) net_profit, u.path, (LENGTH(u.path)/3 - ' + path_depth + ') AS path_depth, ' +
                'p.bet + p.extra_bet AS all_bet, p.profit_for_parent1, p.profit_for_parent2, p.profit_for_parent3, p.profit_for_master_ib, p.first_deposit_profit ' +
                'FROM users u ' +
                'LEFT JOIN plays p ON p.user_id = u.id ';
            var whereClause = "WHERE u.path LIKE '" + path + "%' ";
            if (userInfo.userclass != 'master_ib') {
                whereClause += 'AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
            } else { whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 '; }

            sql += whereClause +
                " AND p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "'" +
                ') t ' +
                'GROUP BY t.user_id, t.username, t.path, t.path_depth, t.parent1 ' +
                'ORDER BY t.path ASC';

            query(sql, [], function (err, playersStatistics) {
                if (err) return callback(err);
                playersStatistics = playersStatistics.rows;

                var userIdMap = {};
                for (var i = 0; i < playerList.length; i++) {
                    userIdMap[playerList[i]['user_id']] = i;
                    statistics['total_balance'] += playerList[i]['balance_satoshis'];
                }

                for (var i = 0; i < playersStatistics.length; i++) {
                    var index = userIdMap[playersStatistics[i]['user_id']];
                    var balance_satoshis = playerList[index]['balance_satoshis'];
                    playerList[index] = playersStatistics[i];
                    playerList[index]['balance_satoshis'] = balance_satoshis;
                }

                statistics['players'] = playerList;

                for (var i = 0; i < playersStatistics.length; i++) {
                    var total_profit = 0.0;

                    if (playersStatistics[i]['path_depth'] == 1) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_parent1']);
                        statistics['player_count_layer1']++;

                        statistics['total_funding_bonus'] += Math.round(playersStatistics[i]['first_deposit_profit']);
                    } else if (playersStatistics[i]['path_depth'] == 2) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_parent2']);
                        statistics['player_count_layer2']++;
                    } else if (playersStatistics[i]['path_depth'] == 3) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_parent3']);
                        statistics['player_count_layer3']++;
                    } else if (playersStatistics[i]['path_depth'] > 3) {
                        statistics['total_profit'] += Math.round(playersStatistics[i]['sum_profit_for_master_ib']);
                    }

                    statistics['total_bet'] += parseFloat(playersStatistics[i]['sum_bet']);
                    statistics['total_gross_profit'] += parseFloat(playersStatistics[i]['sum_gross_profit']);
                    statistics['total_net_profit'] += parseFloat(playersStatistics[i]['sum_net_profit']);
                    statistics['total_balance'] += parseFloat(playersStatistics[i]['balance_satoshis']);
                }

                sql = 'SELECT user_id, SUM(amount)/100.0 AS sum_deposit ' +
                    'FROM fundings f ' +
                    'LEFT JOIN users u ON u.id = f.user_id ';

                var whereClause = "WHERE u.path LIKE '" + path + "%' AND f.amount > 0 ";
                if (userInfo.userclass != 'master_ib') { whereClause += 'AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 '; } else whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
                whereClause += " AND f.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                    "f.created at time zone '" + time_zone_name + "' <= '" + date_to + "' ";
                var groupByClause = 'GROUP BY f.user_id ';
                var orderByClause = 'ORDER BY f.path ASC';

                query(sql + whereClause + groupByClause, function (err, depositStatistics) {
                    if (err) return callback(err);

                    depositStatistics = depositStatistics.rows;
                    for (var i = 0; i < depositStatistics.length; i++) {
                        playerList[userIdMap[depositStatistics[i]['user_id']]]['sum_deposit'] = depositStatistics[i]['sum_deposit'];
                        statistics['total_deposit'] += depositStatistics[i]['sum_deposit'];
                    }

                    sql = 'SELECT user_id, SUM(amount)/100.0 AS withdraw ' +
                        'FROM fundings f ' +
                        'LEFT JOIN users u ON u.id = f.user_id ';
                    whereClause = "WHERE u.path LIKE '" + path + "%' AND f.amount > 0 ";
                    if (userInfo.userclass != 'master_ib') { whereClause += 'AND (length(u.path)/3 - ' + path_depth + ') <= 3 AND (length(u.path)/3 - ' + path_depth + ') >=1 '; }
                    whereClause += ' AND (length(u.path)/3 - ' + path_depth + ') >=1 ';
                    whereClause += " AND f.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                        "f.created at time zone '" + time_zone_name + "' <= '" + date_to + "' ";
                    query(sql + whereClause + groupByClause, function (err, withdrawStatistics) {
                        if (err) return callback(err);

                        withdrawStatistics = withdrawStatistics.rows;
                        for (var i = 0; i < withdrawStatistics.length; i++) {
                            playerList[userIdMap[withdrawStatistics[i].user_id]]['sum_withdraw'] = withdrawStatistics[i]['sum_withdraw'];
                            statistics['total_withdraw'] += withdrawStatistics[i]['sum_withdraw'];
                        }
                        return callback(null, statistics);
                    });
                });
            });
        });
    });
};

/*
 * get a players information (users list) about a staff who had invited the players
 */
exports.getStaffInfo = function (emp_id, callback) {
    query('SELECT * FROM staff ORDER BY emp_id', [], function (err, res) {
        if (err) return callback(err);
        if (emp_id === undefined) return callback(null, {staff: res.rows});
        query('SELECT * FROM users WHERE ref_staff_id=$1', [parseInt(emp_id)], function (error, result) {
            if (error) return callback(error);

            var sql = 'SELECT SUM(t.bet) total_bet, SUM(t.extra_bet) total_extra_bet, SUM(t.profit_for_company) total_profit_for_company ' +
                'FROM ' +
                '(SELECT users.id id, users.username, ref_staff_id, bet, extra_bet, profit_for_company ' +
                'FROM users ' +
                'INNER JOIN plays ON users.id=plays.user_id ' +
                'WHERE ref_staff_id=$1) t';

            query(sql, [emp_id], function (e, r) {
                if (e) return callback('Error occurred while reading total bet, extra bet, profits for company \n' + e);
                return callback(null, {
                    staff: res.rows,
                    userlist: result.rows,
                    total_bet: r.rows[0].total_bet,
                    total_extra_bet: r.rows[0].total_extra_bet,
                    total_profit_for_company: r.rows[0].total_profit_for_company
                });
            });
        });
    });
};

/*
 * add a new staff to the database
 */
exports.addNewStaff = function (name, mail, /* password, */callback) {
    getClient(function (client, callback) {
        query('SELECT MAX(emp_id) FROM staff', function (err, res) {
            if (err) return callback(err);
            var new_emp_id = res.rows[0].max + 1;

            var sql = 'SELECT' +
                '(SELECT COUNT(*) FROM staff WHERE emp_name=$1) emp_count,' +
                '(SELECT COUNT(*) FROM users WHERE username=$1) user_count';
            query(sql, [name], function (error, result) {
                if (error) return callback(error);
                if (result.rows[0].emp_count + result.rows[0].user_count > 0) return callback('duplicate');

                // var sql = "INSERT INTO staff(emp_id, emp_name, email, password, processed) VALUES($1, $2, $3, $4, $5)";
                var sql = 'INSERT INTO staff(emp_id, emp_name, email, processed) VALUES($1, $2, $3, $4)';

                client.query(sql, [new_emp_id, name, mail, 0], function (error, return_value) {
                    if (error) return callback(error);
                    return callback(null, return_value);
                });
            });
        });
    }, callback);
};

/*
 * select a staff to which the support message notification will be sent
 */
exports.getAStaff = function (username, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * FROM staff WHERE emp_id=(SELECT ref_staff_id FROM users WHERE username=$1)';
    query(sql, [username], function (error, result) {
        if (error) return callback(error);
        if (result.rows.length > 0) {
            /* client. */query('UPDATE staff SET processed=processed+1 where emp_id=$1',
                [result.rows[0].emp_id],
                function (err) {
                    if (err) return callback(err);
                    return callback(null, result.rows[0]);
                });
        } else {
            return callback('NO STAFF');
        }
    });
    /* }, callback); */
};

/*
 * update a staff information
 */
exports.updateStaff = function (id, newname, newmail, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE staff SET emp_name=$1, email=$2 WHERE emp_id=$3';
    /* client. */query(sql, [newname, newmail, id], function (err, res) {
        if (err) return callback(err);
        return callback(null, res);
    });
    /* }, callback); */
};

/*
 * delete a staff
 */
exports.deleteStaff = function (emp_name, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "DELETE FROM staff WHERE emp_name='" + emp_name + "' returning emp_id";
    /* client. */query(sql, function (err, res) {
        if (err) return callback(err);
        var emp_id = res.rows[0].emp_id;
        /* client. */query('UPDATE users SET ref_staff_id=NULL WHERE ref_staff_id=' + emp_id, function (error, result) {
            if (error) return callback(error);
            return callback(null, res);
        });
    });
    /* }, callback); */
};

/*
 * get user list from a staff id
 */
exports.getUserFromStaff = function (emp_id, callback) {
    var sql = 'SELECT * FROM users WHERE ref_staff_id=$1';
    query(sql, [emp_id], function (err, res) {
        if (err) {
            return callback(err);
        } else {
            return callback(null, res.rows);
        }
    });
};

/*
 * search users from search box (search can be referred to username, phone number and email)
 */
exports.getUsersFromSearch = function (keyword, callback) {
    var sql = "SELECT * FROM users WHERE (email like '%" + keyword + "%' OR username like '%" + keyword + "%' OR phone_number like '%" +
        keyword + "%') AND (userclass NOT IN ('admin', 'superadmin', 'staff') AND (username NOT IN ('madabit', 'ex_to_mt_', 'superadmin', 'staff', 'fun_to_mt_')))";
    query(sql, function (err, res) {
        if (err) {
            return callback(err);
        } else {
            query('SELECT emp_id, emp_name FROM staff', function (error, result) {
                if (error) {
                    return callback(error);
                } else {
                    return callback(null, { users: res.rows, emps: result.rows });
                }
            });
        }
    });
};

/*
 * save staff information to a user
 */
exports.saveStaffInformation = function (user_id, emp_id, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE users SET ref_staff_id=' + emp_id + ' WHERE id=' + user_id;
    /* client. */query(sql, function (err, res) {
        if (err) return callback(err);
        else return callback(null, res);
    });
    /* }, callback); */
};

exports.setWelcomeFreeBits = function (welcome_free_bit, callback) {
    welcome_free_bit *= 100;

    var sql = "SELECT * FROM common WHERE strkey = 'welcome_free_bit'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert welcome_free_bit [begin] :' + welcome_free_bit);
            console.log('setting - insert welcome_free_bit [begin] :' + welcome_free_bit);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['welcome_free_bit', welcome_free_bit], function (err, res) {
                if (err) return callback(err);
                lib.log('info', 'setting - insert welcome_free_bit [end] :' + welcome_free_bit);
                console.log('setting - insert welcome_free_bit [end] :' + welcome_free_bit);
                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='welcome_free_bit'";
        lib.log('info', 'setting - update welcome_free_bit [begin] :' + welcome_free_bit);
        console.log('setting - update welcome_free_bit [begin] :' + welcome_free_bit);
        query(sql, [welcome_free_bit], function (err, res) {
            if (err) return callback(err);
            lib.log('info', 'setting - update welcome_free_bit [end] :' + welcome_free_bit);
            console.log('setting - update welcome_free_bit [end] :' + welcome_free_bit);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
};

exports.setWithdrawableBetAmount = function (withdrawable_bet_amount, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'withdrawable_bet_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert withdrawable_bet_amount [begin] :' + withdrawable_bet_amount);
            console.log('setting - insert withdrawable_bet_amount [begin] :' + withdrawable_bet_amount);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['withdrawable_bet_amount', withdrawable_bet_amount], function (err, res) {
                if (err) return callback(err);
                lib.log('info', 'setting - insert withdrawable_bet_amount [end] :' + withdrawable_bet_amount);
                console.log('setting - insert withdrawable_bet_amount [end] :' + withdrawable_bet_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='withdrawable_bet_amount'";
        lib.log('info', 'setting - update withdrawable_bet_amount [begin] :' + withdrawable_bet_amount);
        console.log('setting - update withdrawable_bet_amount [begin] :' + withdrawable_bet_amount);
        query(sql, [withdrawable_bet_amount], function (err, res) {
            if (err) return callback(err);
            lib.log('info', 'setting - update withdrawable_bet_amount [end] :' + withdrawable_bet_amount);
            console.log('setting - update withdrawable_bet_amount [end] :' + withdrawable_bet_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
};

exports.setFirstDepositPercent = function (first_deposit_percent, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'first_deposit_percent'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert first_deposit_percent [begin] :' + first_deposit_percent);
            console.log('setting - insert first_deposit_percent [begin] :' + first_deposit_percent);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['first_deposit_percent', first_deposit_percent], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert first_deposit_percent [end] :' + first_deposit_percent);
                console.log('setting - insert first_deposit_percent [end] :' + first_deposit_percent);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='first_deposit_percent'";
        lib.log('info', 'setting - update first_deposit_percent [begin] :' + first_deposit_percent);
        console.log('setting - update first_deposit_percent [begin] :' + first_deposit_percent);
        query(sql, [first_deposit_percent], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update first_deposit_percent [end] :' + first_deposit_percent);
            console.log('setting - update first_deposit_percent [end] :' + first_deposit_percent);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setFirstDepositMultiplier = function (first_deposit_multiplier, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'first_deposit_multiplier'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert first_deposit_multiplier [begin] :' + first_deposit_multiplier);
            console.log('setting - insert first_deposit_multiplier [begin] :' + first_deposit_multiplier);
            query(sql, ['first_deposit_multiplier', first_deposit_multiplier], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert first_deposit_multiplier [end] :' + first_deposit_multiplier);
                console.log('setting - insert first_deposit_multiplier [end] :' + first_deposit_multiplier);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='first_deposit_multiplier'";
        lib.log('info', 'setting - update first_deposit_multiplier [begin] :' + first_deposit_multiplier);
        console.log('setting - update first_deposit_multiplier [begin] :' + first_deposit_multiplier);
        query(sql, [first_deposit_multiplier], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update first_deposit_multiplier [end] :' + first_deposit_multiplier);
            console.log('setting - update first_deposit_multiplier [end] :' + first_deposit_multiplier);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setMinBetAmount = function (min_bet_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'min_bet_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert min_bet_amount [begin] :' + min_bet_amount);
            console.log('setting - insert min_bet_amount [begin] :' + min_bet_amount);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['min_bet_amount', min_bet_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert min_bet_amount [end] :' + min_bet_amount);
                console.log('setting - insert min_bet_amount [end] :' + min_bet_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='min_bet_amount'";
        lib.log('info', 'setting - update min_bet_amount [begins] :' + min_bet_amount);
        console.log('setting - update min_bet_amount [begin] :' + min_bet_amount);
        query(sql, [min_bet_amount], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update min_bet_amount [end] :' + min_bet_amount);
            console.log('setting - update min_bet_amount [end] :' + min_bet_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    // }, callback);
};

exports.setMaxBetAmount = function (max_bet_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'max_bet_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert max_bet_amount [begin] :' + max_bet_amount);
            console.log('setting - insert max_bet_amount [begin] :' + max_bet_amount);
            query(sql, ['max_bet_amount', max_bet_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert max_bet_amount [end] :' + max_bet_amount);
                console.log('setting - insert max_bet_amount [end] :' + max_bet_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='max_bet_amount'";
        lib.log('info', 'setting - update max_bet_amount [begin] :' + max_bet_amount);
        console.log('setting - update max_bet_amount [begin] :' + max_bet_amount);
        query(sql, [max_bet_amount], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update max_bet_amount [end] :' + max_bet_amount);
            console.log('setting - update max_bet_amount [end] :' + max_bet_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setMinExtraBetAmount = function (min_extra_bet_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'min_extra_bet_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert min_extra_bet_amount [begin] :' + min_extra_bet_amount);
            console.log('setting - insert min_extra_bet_amount [begin] :' + min_extra_bet_amount);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['min_extra_bet_amount', min_extra_bet_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert min_extra_bet_amount [end] :' + min_extra_bet_amount);
                console.log('setting - insert min_extra_bet_amount [end] :' + min_extra_bet_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        lib.log('info', 'setting - update min_extra_bet_amount [begin] :' + min_extra_bet_amount);
        console.log('setting - update min_extra_bet_amount [begin] :' + min_extra_bet_amount);
        sql = "UPDATE common SET strvalue=$1 WHERE strkey='min_extra_bet_amount'";
        query(sql, [min_extra_bet_amount], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update min_extra_bet_amount [end] :' + min_extra_bet_amount);
            console.log('setting - update min_extra_bet_amount [end] :' + min_extra_bet_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setMaxExtraBetAmount = function (max_extra_bet_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'max_extra_bet_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert max_extra_bet_amount [begin] :' + max_extra_bet_amount);
            console.log('setting - insert max_extra_bet_amount [begin] :' + max_extra_bet_amount);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['max_extra_bet_amount', max_extra_bet_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert max_extra_bet_amount [end] :' + max_extra_bet_amount);
                console.log('setting - insert max_extra_bet_amount [end] :' + max_extra_bet_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='max_extra_bet_amount'";
        lib.log('info', 'setting - update max_extra_bet_amount [begin] :' + max_extra_bet_amount);
        console.log('setting - update max_extra_bet_amount [begin] :' + max_extra_bet_amount);
        query(sql, [max_extra_bet_amount], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update max_extra_bet_amount [end] :' + max_extra_bet_amount);
            console.log('setting - update max_extra_bet_amount [end] :' + max_extra_bet_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setCollectFreeDays = function (collect_free_days, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'collect_free_days'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert collect_free_days [begin] :' + collect_free_days);
            console.log('setting - insert collect_free_days [begin] :' + collect_free_days);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['collect_free_days', collect_free_days], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert collect_free_days [end] :' + collect_free_days);
                console.log('setting - insert collect_free_days [end] :' + collect_free_days);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='collect_free_days'";
        lib.log('info', 'setting - update collect_free_days [begin] :' + collect_free_days);
        console.log('setting - update collect_free_days [begin] :' + collect_free_days);
        query(sql, [collect_free_days], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update collect_free_days [end] :' + collect_free_days);
            console.log('setting - update collect_free_days [end] :' + collect_free_days);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setWelcomeBitsMultiplier = function (welcome_bits_multiplier, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'welcome_bits_multiplier'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert welcome_bits_multiplier [begin] :' + welcome_bits_multiplier);
            console.log('setting - insert welcome_bits_multiplier [begin] :' + welcome_bits_multiplier);
            query(sql, ['welcome_bits_multiplier', welcome_bits_multiplier], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert welcome_bits_multiplier [end] :' + welcome_bits_multiplier);
                console.log('setting - insert welcome_bits_multiplier [end] :' + welcome_bits_multiplier);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='welcome_bits_multiplier'";
        lib.log('info', 'setting - update welcome_bits_multiplier [begin] :' + welcome_bits_multiplier);
        console.log('setting - update welcome_bits_multiplier [begin] :' + welcome_bits_multiplier);
        query(sql, [welcome_bits_multiplier], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update welcome_bits_multiplier [end] :' + welcome_bits_multiplier);
            console.log('setting - update welcome_bits_multiplier [end] :' + welcome_bits_multiplier);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setMinTransferAmount = function (min_transfer_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'min_transfer_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert min_transfer_amount [begin] :' + min_transfer_amount);
            console.log('setting - insert min_transfer_amount [begin] :' + min_transfer_amount);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['min_transfer_amount', min_transfer_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert min_transfer_amount [end] :' + min_transfer_amount);
                console.log('setting - insert min_transfer_amount [end] :' + min_transfer_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='min_transfer_amount'";
        lib.log('info', 'setting - update min_transfer_amount [begin] :' + min_transfer_amount);
        console.log('setting - update min_transfer_amount [begin] :' + min_transfer_amount);
        query(sql, [min_transfer_amount], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update min_transfer_amount [end] :' + min_transfer_amount);
            console.log('setting - update min_transfer_amount [end] :' + min_transfer_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.getMinTransferAmount = function (callback) {
    var sql = "SELECT strvalue FROM common WHERE strkey='min_transfer_amount'";
    query(sql, function (e, r) {
        if (e) { return callback(err); }

        if (r.rowCount == 1) {
            return callback(null, r.rows[0].strvalue);
        }

        return callback(null, 100);
    });
};

exports.setMaxTransferAmount = function (max_transfer_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'max_transfer_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert max_transfer_amount [begin] :' + max_transfer_amount);
            console.log('setting - insert max_transfer_amount [begin] :' + max_transfer_amount);
            query(sql, ['max_transfer_amount', max_transfer_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert max_transfer_amount [end] :' + max_transfer_amount);
                console.log('setting - insert max_transfer_amount [end] :' + max_transfer_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='max_transfer_amount'";
        lib.log('info', 'setting - update max_transfer_amount [begin] :' + max_transfer_amount);
        console.log('setting - update max_transfer_amount [begin] :' + max_transfer_amount);
        query(sql, [max_transfer_amount], function (err, res) {
            if (err) return callback(err);
            lib.log('info', 'setting - update max_transfer_amount [end] :' + max_transfer_amount);
            console.log('setting - update max_transfer_amount [end] :' + max_transfer_amount);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setMaxTipFeeAmount = function (max_tipfee_amount, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'max_tipfee_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert max_tipfee_amount [begin] :' + max_tipfee_amount);
            console.log('setting - insert max_tipfee_amount [begin] :' + max_tipfee_amount);
            query(sql, ['max_tipfee_amount', max_tipfee_amount], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert max_tipfee_amount [end] :' + max_tipfee_amount);
                console.log('setting - insert max_tipfee_amount [end] :' + max_tipfee_amount);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='max_tipfee_amount'";
        lib.log('info', 'setting - update max_tipfee_amount [begin] :' + max_tipfee_amount);
        console.log('setting - update max_tipfee_amount [begin] :' + max_tipfee_amount);
        query(sql, [max_tipfee_amount], function (err, res) {
            if (err) return callback(err);
            lib.log('info', 'setting - update max_tipfee_amount [end] :' + max_tipfee_amount);
            console.log('setting - update max_tipfee_amount [end] :' + max_tipfee_amount);
            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.getMaxTransferAmount = function (callback) {
    var sql = "SELECT strvalue FROM common WHERE strkey='max_transfer_amount'";
    query(sql, function (e, r) {
        if (e) { return callback(err); }

        if (r.rowCount == 1) {
            return callback(null, r.rows[0].strvalue);
        }

        return callback(null, 100);
    });
};

exports.getMaxTipFeeAmount = function (callback) {
    var sql = "SELECT strvalue FROM common WHERE strkey='max_tipfee_amount'";
    query(sql, function (e, r) {
        if (e) { return callback(err); }

        if (r.rowCount == 1) {
            return callback(null, r.rows[0].strvalue);
        }

        return callback(null, 500);
    });
};

exports.checkTransferBalance = function (user_id, transfer_amount, callback) {
    var sql = 'select (balance_satoshis - (play_times_profit + welcome_free_bit)) >= ' + transfer_amount + ' AS tipable from users where id= ' + user_id;
    query(sql, function (e, r) {
        if (e) return callback(e);

        return callback(null, r.rows[0].tipable);
    });
};

exports.setMaxProfit = function (max_profit, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'max_profit'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert max_profit [begin] :' + max_profit);
            console.log('setting - insert max_profit [begin] :' + max_profit);
            query(sql, ['max_profit', max_profit], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert max_profit [end] :' + max_profit);
                console.log('setting - insert max_profit [end] :' + max_profit);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='max_profit'";
        lib.log('info', 'setting - update max_profit [begin] :' + max_profit);
        console.log('setting - update max_profit [begin] :' + max_profit);
        query(sql, [max_profit], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update max_profit [end] :' + max_profit);
            console.log('setting - update max_profit [end] :' + max_profit);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setContactUsEmail = function (contactus_email, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'contactus_email'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert contactus_email [begin] :' + contactus_email);
            console.log('setting - insert contactus_email [begin] :' + contactus_email);
            query(sql, ['contactus_email', contactus_email], function (err, res) {
                if (err) return callback(err);
                lib.log('info', 'setting - insert contactus_email [end] :' + contactus_email);
                console.log('setting - insert contactus_email [end] :' + contactus_email);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='contactus_email'";
        lib.log('info', 'setting - update contactus_email [begin] :' + contactus_email);
        console.log('setting - update contactus_email [begin] :' + contactus_email);
        query(sql, [contactus_email], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update contactus_email [end] :' + contactus_email);
            console.log('setting - update contactus_email [end] :' + contactus_email);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.depositFakePool = function (deposit_fakepool, callback) {
    if (deposit_fakepool == undefined) return callback('undefined error.');
    deposit_fakepool = parseInt(deposit_fakepool);
    if (isNaN(deposit_fakepool)) return callback('isNaN error.');
    deposit_fakepool *= 100;

    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'deposit_fakepool'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert deposit_fakepool [begin] :' + deposit_fakepool);
            console.log('setting - insert deposit_fakepool [begin] :' + deposit_fakepool);
            query(sql, ['deposit_fakepool', deposit_fakepool], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert deposit_fakepool [end] :' + deposit_fakepool);
                console.log('setting - insert deposit_fakepool [end] :' + deposit_fakepool);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='deposit_fakepool'";
        lib.log('info', 'setting - update deposit_fakepool [begin] :' + deposit_fakepool);
        console.log('setting - update deposit_fakepool [begin] :' + deposit_fakepool);
        query(sql, [deposit_fakepool], function (err, res) {
            if (err) return callback(err);
            lib.log('info', 'setting - update deposit_fakepool [end] :' + deposit_fakepool);
            console.log('setting - update deposit_fakepool [end] :' + deposit_fakepool);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.depositFakeAccount = function (demo_account_info, callback) {
    var strName = demo_account_info['name'];
    var strDeposit = demo_account_info['deposit'];
    var nDeposit = parseInt(strDeposit);
    nDeposit *= 100;

    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE users SET balance_satoshis = cast(balance_satoshis as int8) + $1 WHERE lower(username)=lower($2) AND demo=true RETURNING balance_satoshis';
    query(sql, [nDeposit, strName], function (err, data) {
        if (err) return callback({state: 'DEMO_ERROR_1'});
        var balance = data.rows[0].balance_satoshis;
        balance /= 100;

        lib.log('info', 'setting - plus deposit_fakepool [end] :' + nDeposit);
        console.log('setting - plus deposit_fakepool [end] :' + nDeposit);
        sql = "UPDATE common SET strvalue = cast(strvalue as int8) + $1 WHERE strkey = 'deposit_fakepool'";
        query(sql, [nDeposit], function (err, res) {
            if (err) return callback({state: 'DEMO_ERROR_2'});
            return callback({state: 'SUCCESS', balance: balance});
        });
    });
    /* }, callback); */
};

exports.setAddGamingPool = function (add_gaming_pool, callback) {
    /* getClient(function(client, callback)
    { */
    add_gaming_pool *= 100;

    var sql = "SELECT * FROM common WHERE strkey = 'add_gaming_pool'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert add_gaming_pool [begin] :' + add_gaming_pool);
            console.log('setting - insert add_gaming_pool [begin] :' + add_gaming_pool);
            query(sql, ['add_gaming_pool', add_gaming_pool], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert add_gaming_pool [end] :' + add_gaming_pool);
                console.log('setting - insert add_gaming_pool [end] :' + add_gaming_pool);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='add_gaming_pool'";
        lib.log('info', 'setting - update add_gaming_pool [begin] :' + add_gaming_pool);
        console.log('setting - update add_gaming_pool [begin] :' + add_gaming_pool);
        query(sql, [add_gaming_pool], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update add_gaming_pool [end] :' + add_gaming_pool);
            console.log('setting - update add_gaming_pool [end] :' + add_gaming_pool);

            if (res.rowCount === 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setETHAddress = function (eth_address, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'eth_address'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert eth_address [begins] :' + eth_address);
            console.log('setting - insert eth_address [begin] :' + eth_address);
            query(sql, ['eth_address', eth_address], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert eth_address [end] :' + eth_address);
                console.log('setting - insert eth_address [end] :' + eth_address);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='eth_address'";
        lib.log('info', 'setting - update eth_address [begin] :' + eth_address);
        console.log('setting - update eth_address [begin] :' + eth_address);
        query(sql, [eth_address], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update eth_address [end] :' + eth_address);
            console.log('setting - update eth_address [end] :' + eth_address);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setETHPassword = function (eth_password, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'eth_password'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert eth_password [begin] :' + eth_password);
            console.log('setting - insert eth_password [begin] :' + eth_password);
            query(sql, ['eth_password', eth_password], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert eth_password [end] :' + eth_password);
                console.log('setting - insert eth_password [end] :' + eth_password);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='eth_password'";
        lib.log('info', 'setting - update eth_password [begin] :' + eth_password);
        console.log('setting - update eth_password [begin] :' + eth_password);
        query(sql, [eth_password], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update eth_password [end] :' + eth_password);
            console.log('setting - update eth_password [end] :' + eth_password);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setLoginBonusBet = function (login_bonus_bet, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'login_bonus_bet'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert login_bonus_bet [begin] :' + login_bonus_bet);
            console.log('setting - insert login_bonus_bet [begin] :' + login_bonus_bet);
            query(sql, ['login_bonus_bet', login_bonus_bet], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert login_bonus_bet [end] :' + login_bonus_bet);
                console.log('setting - insert login_bonus_bet [end] :' + login_bonus_bet);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='login_bonus_bet'";
        lib.log('info', 'setting - update login_bonus_bet [begin] :' + login_bonus_bet);
        console.log('setting - update login_bonus_bet [begin] :' + login_bonus_bet);
        query(sql, [login_bonus_bet], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update login_bonus_bet [end] :' + login_bonus_bet);
            console.log('setting - update login_bonus_bet [end] :' + login_bonus_bet);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    // }, callback);
};

exports.saveLoginBonus = function (login_bonus_data, callback) {
    /* getClient(function(client, callback)
    { */
    /* client. */query('DELETE FROM login_bonus', [], function (err, res) {
        if (err) return callback(err);

        for (var nId = 0; nId < login_bonus_data.length; nId++) {
            var day_id = login_bonus_data[nId]['day'];
            var bonus_bits = login_bonus_data[nId]['bonus_bits'];
            lib.log('info', 'setting - insert day_id, bonus_bits [begin] :' + day_id + ', ' + bonus_bits);
            console.log('setting - insert day_id, bonus_bits [begin] :' + day_id + ', ' + bonus_bits);
            /* client. */query('INSERT INTO login_bonus (id, bonus) VALUES($1, $2)', [day_id, bonus_bits], callback);
            lib.log('info', 'setting - insert day_id, bonus_bits [end] :' + day_id + ', ' + bonus_bits);
            console.log('setting - insert day_id, bonus_bits [end] :' + day_id + ', ' + bonus_bits);
        }

        return callback(null);
    });
    /* }, callback); */
};

exports.setExtraBetMultiplier = function (extrabet_multiplier, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'extrabet_multiplier'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert extrabet_multiplier [begin] :' + extrabet_multiplier);
            console.log('setting - insert extrabet_multiplier [begin] :' + extrabet_multiplier);
            query(sql, ['extrabet_multiplier', extrabet_multiplier], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert extrabet_multiplier [end] :' + extrabet_multiplier);
                console.log('setting - insert extrabet_multiplier [end] :' + extrabet_multiplier);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='extrabet_multiplier'";
        lib.log('info', 'setting - update extrabet_multiplier [begin] :' + extrabet_multiplier);
        console.log('setting - update extrabet_multiplier [begin] :' + extrabet_multiplier);
        query(sql, [extrabet_multiplier], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update extrabet_multiplier [end] :' + extrabet_multiplier);
            console.log('setting - update extrabet_multiplier [end] :' + extrabet_multiplier);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.saveCommonSetting = function (param, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * FROM common WHERE strkey = $1';
    query(sql, [param.strkey], function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert ' + param.strkey + ' [begin] :' + param.strkey);
            console.log('setting - insert ' + param.strkey + ' [begin] :' + param.strkey);
            query(sql, [param.strkey, param.strvalue], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert ' + param.strkey + ' [end] :' + param.strkey);
                console.log('setting - insert ' + param.strkey + ' [end] :' + param.strkey);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = 'UPDATE common SET strvalue=$1 WHERE strkey=$2';
        lib.log('info', 'setting - update ' + param.strkey + ' [begin] :' + param.strkey);
        console.log('setting - update ' + param.strkey + ' [begin] :' + param.strkey);
        query(sql, [param.strvalue, param.strkey], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update ' + param.strkey + ' [end] :' + param.strkey);
            console.log('setting - update ' + param.strkey + '[end] :' + param.strkey);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.getLoginBonusBet = function (callback) {
    var sql = "SELECT strvalue FROM common WHERE strkey='login_bonus_bet'";
    query(sql, function (e, r) {
        if (e) { return callback(err); }

        if (r.rowCount == 1) {
            return callback(null, r.rows[0].strvalue);
        }

        return callback(null, 1000);
    });
};

exports.getStatisticsForAdminPage_deletelater = function (date_from, date_to, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'rate_USD_bit'";
    query(sql, [], function (err, rateRecord) {
        var rate = 100;
        if (rateRecord.rows.length != 0) { rate = rateRecord.rows[0]['strvalue']; }

        var whereClauseWithDateRange = "WHERE to_char(p.created, 'YYYY-MM-DD') >= '" + date_from + "' AND " +
            "to_char(p.created, 'YYYY-MM-DD') <= '" + date_to + "' ";

        var sql_1 = 'SELECT SUM(p.profit_for_company + p.profit_for_staff) company_profit, SUM(p.bet + p.extra_bet) AS total_volume, ' +
            'SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS gross_profit, ' +
            'SUM(p.cash_out - p.bet - p.extra_bet) AS net_profit, ' +
            'SUM(p.profit_for_master_ib + p.profit_for_agent + p.profit_for_parent1 + p.profit_for_parent2 + p.profit_for_parent3) AS agent_profit, ' +
            'SUM(p.play_times_profit) AS play_times_profit, ' +
            'SUM(p.first_deposit_profit) AS first_deposit_profit, ' +
            'SUM(p.extra_bet) AS total_extra_bet ' +
            'FROM plays p ' +
            'LEFT JOIN users u ON u.id = p.user_id ' +
            whereClauseWithDateRange + ' AND u.demo = false ';

        var sql_2 = 'SELECT COUNT(p.user_id) total_player ' +
            'FROM plays p ' +
            whereClauseWithDateRange;

        var sql_3 = 'SELECT SUM(p.profit_for_company + p.profit_for_staff) daily_company_profit, ' +
            'SUM(p.bet + p.extra_bet) AS daily_volume, ' +
            'SUM(p.cash_out - p.bet - p.extra_bet) AS daily_net_profit, ' +
            'SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS daily_gross_profit, ' +
            'SUM(p.profit_for_master_ib + p.profit_for_agent + p.profit_for_parent1 + p.profit_for_parent2 + p.profit_for_parent3) AS daily_agent_profit, ' +
            'SUM(p.play_times_profit) AS daily_play_times_profit, ' +
            'SUM(p.first_deposit_profit) AS daily_first_deposit_profit, ' +
            'SUM(p.extra_bet) AS daily_extra_bet, ' +
            "to_char(p.created, 'YYYY-MM-DD') created_date " +
            'FROM plays p ' +
            'LEFT JOIN users u ON u.id = p.user_id ' +
            whereClauseWithDateRange + ' AND u.demo = false ';
        "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
        'ORDER BY created_date';

        var sql_4 = "SELECT COUNT(p.user_id) daily_player, to_char(p.created, 'YYYY-MM-DD') created_date " +
            'FROM plays p ' +
            whereClauseWithDateRange +
            "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
            'ORDER BY created_date';

        var sql_5 = "SELECT COUNT(p.id) daily_game, to_char(p.created, 'YYYY-MM-DD') created_date " +
            'FROM games p ' +
            whereClauseWithDateRange +
            "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
            'ORDER BY created_date';

        var sql_depoist_withdraw = "SELECT p.amount, to_char(p.created, 'YYYY-MM-DD') created_date FROM fundings p " + whereClauseWithDateRange;

        query(sql_1, function (err, data1) {
            var result = {};
            result['dailyCompanyProfitList'] = [];
            result['dailyPlayerList'] = [];
            result['dailyVolumeList'] = [];
            result['dailyGrossProfitList'] = [];
            result['dailyNetProfitList'] = [];
            result['dailyAgentProfitList'] = [];
            result['dailyPlayTimesProfitList'] = [];
            result['dailyWelcomeFreeBitList'] = [];
            result['dailyExtraBetList'] = [];
            result['dailyFirstDepositProfitList'] = [];
            result['dailyGameList'] = [];
            result['dailyDepositList'] = [];
            result['dailyWithdrawList'] = [];

            result['company_profit'] = Math.round(data1.rows[0]['company_profit'] / 100 / rate);
            result['total_volume'] = Math.round(data1.rows[0]['total_volume'] / 100 / rate);
            result['net_profit'] = Math.round(data1.rows[0]['net_profit'] / 100 / rate);
            result['gross_profit'] = Math.round(data1.rows[0]['gross_profit'] / 100 / rate);
            result['agent_profit'] = Math.round(data1.rows[0]['agent_profit'] / 100 / rate);
            result['total_extra_bet'] = Math.round(data1.rows[0]['total_extra_bet'] / 100 / rate);
            result['play_times_profit'] = Math.round(data1.rows[0]['play_times_profit'] / 100 / rate);
            result['first_deposit_profit'] = Math.round(data1.rows[0]['first_deposit_profit'] / 100 / rate);
            result['welcome_free_bit'] = Math.round(data1.rows[0]['welcome_free_bit'] / 100 / rate);
            result['total_deposit'] = 0;
            result['total_withdraw'] = 0;

            // query(sql_2, function(err, data2) {
            //     if(err) return callback(err);

            result['total_player'] = 0;
            result['total_game'] = 0;

            query(sql_3, function (err, data3) {
                if (err) return callback(err);
                data3 = data3.rows;

                for (var i = 0; i < data3.length; i++) {
                    result['dailyCompanyProfitList'][result['dailyCompanyProfitList'].length] = {
                        profit: Math.round(data3[i]['daily_company_profit'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };

                    result['dailyVolumeList'][result['dailyVolumeList'].length] = {
                        value: Math.round(data3[i]['daily_volume'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };

                    result['dailyNetProfitList'][result['dailyNetProfitList'].length] = {
                        value: Math.round(data3[i]['daily_net_profit'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };

                    result['dailyAgentProfitList'][result['dailyAgentProfitList'].length] = {
                        value: Math.round(data3[i]['daily_agent_profit'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };

                    result['dailyPlayTimesProfitList'][result['dailyPlayTimesProfitList'].length] = {
                        value: Math.round(data3[i]['daily_net_profit'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };

                    result['dailyFirstDepositProfitList'][result['dailyFirstDepositProfitList'].length] = {
                        value: Math.round(data3[i]['daily_net_profit'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };

                    // result['dailyWelcomeFreeBitList'][result['dailyWelcomeFreeBitList'].length] = {
                    //     value : Math.round(data3[i]['daily_welcome_free_bit']/100/rate),
                    //     created_date: data3[i]['created_date']
                    // };

                    result['dailyExtraBetList'][result['dailyExtraBetList'].length] = {
                        value: Math.round(data3[i]['daily_extra_bet'] / 100 / rate),
                        created_date: data3[i]['created_date']
                    };
                }

                query(sql_4, function (err, data4) {
                    if (err) return callback(err);
                    data4 = data4.rows;
                    for (var i = 0; i < data4.length; i++) {
                        result['dailyPlayerList'][result['dailyPlayerList'].length] = {value: data4[i]['daily_player'], created_date: data4[i]['created_date']};
                        result['total_player'] += data4[i]['daily_player'];
                    }

                    query(sql_5, function (err, data5) {
                        if (err) return callback(err);
                        data5 = data5.rows;
                        for (var i = 0; i < data5.length; i++) {
                            result['dailyGameList'][result['dailyGameList'].length] = {value: data5[i]['daily_game'], created_date: data5[i]['created_date']};
                            result['total_game'] += data5[i]['daily_game'];
                        }

                        query(sql_depoist_withdraw, function (err, data_deposit_withdraw) {
                            if (err) return callback(err);

                            data_deposit_withdraw = data_deposit_withdraw.rows;

                            var k_deposit = 0, k_withdraw = 0;
                            for (var i = 0; i < data_deposit_withdraw.length; i++) {
                                var amount = data_deposit_withdraw[i]['amount'];
                                var created_date = data_deposit_withdraw[i]['amount'];

                                if (amount > 0) {
                                    result['total_deposit'] += amount;
                                    result['dailyDepositList'][k_deposit++] = {
                                        value: amount,
                                        created_date: created_date
                                    };
                                } else {
                                    result['total_withdraw'] -= amount;
                                    result['dailyWithdrawList'][k_withdraw++] = {
                                        value: amount,
                                        created_date: created_date
                                    };
                                }
                            }
                            callback(null, result);
                        });
                    });
                });
            });
            // });
        });
    });
};

exports.getStatisticsForAdminPage = function (date_from, date_to, time_zone_name, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'rate_USD_bit'";
    query(sql, function (err, rateRecord) {
        var rate = 100;
        if (rateRecord.rows.length != 0) { rate = rateRecord.rows[0]['strvalue']; }

        sql = "SELECT SUM(strvalue::float) AS agent_percent_sum FROM common WHERE strkey LIKE 'agent_percent_%'";
        query(sql, function (err, agent_percent_sum) {
            agent_percent_sum = agent_percent_sum.rows[0]['agent_percent_sum'];

            // var whereClauseWithDateRange = "WHERE to_char(p.created, 'YYYY-MM-DD') >= '" + date_from + "' AND " +
            //     "to_char(p.created, 'YYYY-MM-DD') <= '" + date_to + "' ";

            var whereClauseWithDateRange = "WHERE p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' ";

            // where created at time zone 'Asia/Tokyo' > '2018-04-03 12:25:54';

            var sql_1 = 'SELECT SUM(p.profit_for_company + p.profit_for_staff) company_profit, SUM(p.bet + p.extra_bet) AS total_volume, ' +
                        // "SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS gross_profit, " +
                        'SUM(p.cash_out - p.bet - p.extra_bet) AS net_profit, ' +
                        'SUM(p.profit_for_master_ib + p.profit_for_agent + p.profit_for_parent1 + p.profit_for_parent2 + p.profit_for_parent3) AS agent_profit, ' +
                        'SUM(p.play_times_profit) AS play_times_profit, ' +
                        'SUM(p.first_deposit_profit) AS first_deposit_profit, ' +
                        'SUM(p.extra_bet) AS total_extra_bet ' +
                        'FROM plays p ' +
                        "WHERE p.demo = false AND p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' ";

            var sql_2 = 'SELECT COUNT(p.user_id) total_player ' +
                'FROM plays p ' +
                'LEFT JOIN users u ON u.id = p.user_id ' +
                whereClauseWithDateRange + ' AND u.demo = false';

            var sql_3 = 'SELECT SUM(p.profit_for_company + p.profit_for_staff) daily_company_profit, ' +
                        'SUM(p.bet + p.extra_bet) AS daily_volume, ' +
                        'SUM(p.cash_out - p.bet - p.extra_bet) AS daily_net_profit, ' +
                        'SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS daily_gross_profit, ' +
                        'SUM(p.profit_for_master_ib + p.profit_for_agent + p.profit_for_parent1 + p.profit_for_parent2 + p.profit_for_parent3) AS daily_agent_profit, ' +
                        'SUM(p.play_times_profit) AS daily_play_times_profit, ' +
                        'SUM(p.first_deposit_profit) AS daily_first_deposit_profit, ' +
                        'SUM(p.extra_bet) AS daily_extra_bet, ' +
                        "to_char(p.created, 'YYYY-MM-DD') created_date " +
                        'FROM plays p ' +
                        "WHERE p.demo = false AND p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' " +
                        "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
                        'ORDER BY created_date';

            var sql_4 = "SELECT COUNT(p.user_id) daily_player, to_char(p.created, 'YYYY-MM-DD') created_date " +
                'FROM plays p ' +
                "WHERE p.demo = false AND p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' " +
                "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
                'ORDER BY created_date';

            var sql_5 = "SELECT COUNT(p.id) daily_game, to_char(p.created, 'YYYY-MM-DD') created_date " +
                'FROM games p ' +
                whereClauseWithDateRange +
                "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
                'ORDER BY created_date';

            var sql_depoist_withdraw = "SELECT p.amount, to_char(p.created, 'YYYY-MM-DD') created_date, p.fee, p.description " +
                'FROM fundings p ' +
                'LEFT JOIN users u ON u.id = p.user_id ' +
                whereClauseWithDateRange + " AND u.username != 'madabit' AND u.username != 'staff'";

            var sql_transfer_fee = 'SELECT p.fee, p.created ' +
                'FROM transfers p ' +
                'LEFT JOIN users u ON u.id = p.from_user_id ' +
                whereClauseWithDateRange + " AND u.username != 'madabit' AND u.username != 'staff'";

            var sql_welcome_free_bit = 'SELECT SUM(welcome_free_bit) AS sum_welcome_free_bit ' +
                'FROM users p ' +
                whereClauseWithDateRange + " AND p.demo = false AND p.username != 'madabit' " +
                "AND p.username != 'staff' AND p.userclass != 'admin'";

            var sql_balance_satoshis = 'SELECT SUM(u.balance_satoshis) AS total_player_balance ' +
                'FROM users u ' +
                "WHERE  demo = false AND u.username != 'madabit' AND u.username != 'staff' AND " +
                "u.username != 'ex_to_mt_' AND u.username != 'fun_to_mt_' AND u.userclass != 'admin' AND " +
                "u.userclass != 'superadmin' AND u.userclass != 'staff'";

            query(sql_welcome_free_bit, function (err, sum_welcome_free_bit) {
                sum_welcome_free_bit = sum_welcome_free_bit.rows[0]['sum_welcome_free_bit'];

                query(sql_1, function (err, data1) {
                    var result = {};
                    result['dailyCompanyProfitList'] = [];
                    result['dailyPlayerList'] = [];
                    result['dailyVolumeList'] = [];
                    result['dailyGrossProfitList'] = [];
                    result['dailyNetProfitList'] = [];
                    result['dailyAgentProfitList'] = [];
                    result['dailyPlayTimesProfitList'] = [];
                    result['dailyWelcomeFreeBitList'] = [];
                    result['dailyExtraBetList'] = [];
                    result['dailyFirstDepositProfitList'] = [];
                    result['dailyGameList'] = [];
                    result['dailyDepositList'] = [];
                    result['dailyWithdrawList'] = [];

                    result['company_profit'] = data1.rows[0]['total_volume'] / 100 * agent_percent_sum / rate;
                    result['total_volume'] = data1.rows[0]['total_volume'] / rate;
                    result['net_profit'] = parseInt(data1.rows[0]['net_profit'] ? data1.rows[0]['net_profit'] : 0) / rate;
                    // result['gross_profit'] = Math.round(data1.rows[0]['gross_profit'] / 100 / rate);
                    result['gross_profit'] = (data1.rows[0]['total_volume'] / 100 * agent_percent_sum -
                        data1.rows[0]['agent_profit'] -
                        data1.rows[0]['play_times_profit'] -
                        data1.rows[0]['first_deposit_profit'] -
                        sum_welcome_free_bit) / rate;

                    // data1.rows[0]['welcome_free_bit']) / rate;                //company net profit
                    result['agent_profit'] = data1.rows[0]['agent_profit'] / rate;
                    result['total_extra_bet'] = data1.rows[0]['total_extra_bet'] / rate;
                    result['play_times_profit'] = data1.rows[0]['play_times_profit'] / rate;
                    result['first_deposit_profit'] = data1.rows[0]['first_deposit_profit'] / rate;
                    result['welcome_free_bit'] = sum_welcome_free_bit / rate;
                    result['total_player_balance'] = data1.rows[0]['total_player_balance'] / rate;
                    result['total_deposit'] = 0;
                    result['total_deposit_coin'] = 0;
                    result['total_deposit_money'] = 0;
                    result['total_withdraw'] = 0;
                    result['total_withdraw_coin'] = 0;
                    result['total_withdraw_money'] = 0;
                    result['total_withdraw_fee'] = 0;
                    result['total_transfer_fee'] = 0;
                    result['total_mining_fee'] = 0;

                    // query(sql_2, function(err, data2) {
                    //     if(err) return callback(err);

                    result['total_player'] = 0;
                    result['total_game'] = 0;

                    query(sql_3, function (err, data3) {
                        if (err) return callback(err);
                        data3 = data3.rows;

                        for (var i = 0; i < data3.length; i++) {
                            result['dailyCompanyProfitList'][result['dailyCompanyProfitList'].length] = {
                                profit: (data3[i]['daily_volume'] / 100 * agent_percent_sum) / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyVolumeList'][result['dailyVolumeList'].length] = {
                                value: data3[i]['daily_volume'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyNetProfitList'][result['dailyNetProfitList'].length] = {
                                value: data3[i]['daily_net_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyAgentProfitList'][result['dailyAgentProfitList'].length] = {
                                value: data3[i]['daily_agent_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyPlayTimesProfitList'][result['dailyPlayTimesProfitList'].length] = {
                                value: data3[i]['daily_play_times_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyFirstDepositProfitList'][result['dailyFirstDepositProfitList'].length] = {
                                value: data3[i]['daily_first_deposit_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyExtraBetList'][result['dailyExtraBetList'].length] = {
                                value: data3[i]['daily_extra_bet'] / rate,
                                created_date: data3[i]['created_date']
                            };
                        }

                        query(sql_4, function (err, data4) {
                            if (err) return callback(err);
                            data4 = data4.rows;
                            for (var i = 0; i < data4.length; i++) {
                                result['dailyPlayerList'][result['dailyPlayerList'].length] = {
                                    value: data4[i]['daily_player'],
                                    created_date: data4[i]['created_date']
                                };
                                result['total_player'] += data4[i]['daily_player'];
                            }

                            query(sql_5, function (err, data5) {
                                if (err) return callback(err);
                                data5 = data5.rows;

                                for (var i = 0; i < data5.length; i++) {
                                    result['dailyGameList'][result['dailyGameList'].length] = {
                                        value: data5[i]['daily_game'],
                                        created_date: data5[i]['created_date']
                                    };
                                    result['total_game'] += data5[i]['daily_game'];
                                }

                                query(sql_depoist_withdraw, function (err, data_deposit_withdraw) {
                                    if (err) return callback(err);

                                    data_deposit_withdraw = data_deposit_withdraw.rows;

                                    var k_deposit = 0, k_withdraw = 0;
                                    var total_withdraw_fee = 0;
                                    var mining_fee = config.MINING_FEE;

                                    for (var i = 0; i < data_deposit_withdraw.length; i++) {
                                        var amount = data_deposit_withdraw[i]['amount'];
                                        var fee = data_deposit_withdraw[i]['fee'];
                                        var created_date = data_deposit_withdraw[i]['created'];
                                        var description = data_deposit_withdraw[i]['description'];

                                        if (amount > 0) {
                                            result['total_deposit'] += amount;
                                            if (description == 'ETH Deposit' || description == 'BTC Deposit') {
                                                result['total_deposit_coin'] += amount;
                                            } else {
                                                result['total_deposit_money'] += amount;
                                            }
                                            result['dailyDepositList'][k_deposit++] = {
                                                value: amount,
                                                created_date: created_date
                                            };
                                        } else {
                                            result['total_withdraw'] -= amount;
                                            total_withdraw_fee += (fee != null && fee != undefined) ? fee : 0;
                                            if (description == 'ETH Withdrawal' || description == 'BTC Withdrawal') {
                                                result['total_withdraw_coin'] -= amount;
                                            } else {
                                                result['total_withdraw_money'] -= amount;
                                            }

                                            if (description != 'OTC Withdraw') {
                                                result['total_mining_fee'] += mining_fee;
                                            }
                                            result['dailyWithdrawList'][k_withdraw++] = {
                                                value: amount,
                                                created_date: created_date
                                            };
                                        }
                                    }

                                    result['total_deposit'] = result['total_deposit'] / rate;
                                    result['total_deposit_coin'] = result['total_deposit_coin'] / rate;
                                    result['total_deposit_money'] = result['total_deposit_money'] / rate;
                                    result['total_withdraw'] = result['total_withdraw'] / rate;
                                    result['total_withdraw_coin'] = result['total_withdraw_coin'] / rate;
                                    result['total_withdraw_money'] = result['total_withdraw_money'] / rate;
                                    result['total_withdraw_fee'] += total_withdraw_fee / rate;
                                    result['total_mining_fee'] = result['total_mining_fee'] / rate;

                                    query(sql_transfer_fee, function (err, data_transfer_fee) {
                                        if (err) return callback(err);

                                        data_transfer_fee = data_transfer_fee.rows;
                                        var total_transfer_fee = 0;
                                        for (var i = 0; i < data_transfer_fee.length; i++) {
                                            var fee = data_transfer_fee[i]['fee'];
                                            total_transfer_fee += (fee != null && fee != undefined) ? fee : 0;
                                        }

                                        result['total_transfer_fee'] += total_transfer_fee / rate;
                                        result['gross_profit'] += result['total_withdraw_fee'] + result['total_transfer_fee'];
                                        result['company_profit'] = (data1.rows[0]['total_volume'] / 100 * agent_percent_sum + total_transfer_fee + total_withdraw_fee) / rate;

                                        query(sql_balance_satoshis, function (err, total_player_balance) {
                                            if (err) return callback(err);

                                            total_player_balance = total_player_balance.rows[0].total_player_balance / rate;
                                            result['total_player_balance'] = total_player_balance;

                                            // for testing... delete later.
                                            // result['difference'] = total_player_balance - result['net_profit'] - result['agent_profit'] - result.total_deposit;
                                            // result['difference1'] = total_player_balance * 100 - result['net_profit'] * 100 - result['agent_profit'] * 100 - result.total_deposit * 100;

                                            var sql_madabit_staff_balance = "SELECT username, balance_satoshis FROM users WHERE username = 'madabit' OR username = 'staff'";
                                            query(sql_madabit_staff_balance, function (err, madabit_staff_balance) {
                                                madabit_staff_balance = madabit_staff_balance.rows;
                                                var madabit_balance = 0;
                                                var staff_balance = 0;
                                                for (var i = 0; i < madabit_staff_balance.length; i++) {
                                                    if (madabit_staff_balance[i].username == 'madabit') { madabit_balance = madabit_staff_balance[i].balance_satoshis / rate; } else { staff_balance = madabit_staff_balance[i].balance_satoshis / rate; }
                                                }

                                                query("SELECT strvalue FROM common WHERE strkey = 'deleted_profit'", [], function (err, deleted_profit_result) {
                                                    var deleted_profit = 0;
                                                    if (deleted_profit_result.rowCount == 1) { deleted_profit = deleted_profit_result.rows[0].strvalue; }

                                                    query('SELECT SUM(capture_pay) as total_capture_pay FROM users', function (err, total_capture_pay_result) {
                                                        var total_capture_pay = 0;
                                                        if (total_capture_pay_result.rowCount == 1 && total_capture_pay_result.rows[0].total_capture_pay != undefined) { total_capture_pay = total_capture_pay_result.rows[0].total_capture_pay; }

                                                        result['total_capture_pay'] = lib.getCommaFloat(total_capture_pay / rate / 100, 4);
                                                        result['deleted_profit'] = lib.getCommaFloat(deleted_profit / rate / 100, 4);
                                                        result['company_profit'] = lib.getCommaFloat(result['company_profit'] / 100, 4);
                                                        result['total_volume'] = lib.getCommaFloat(result['total_volume'] / 100, 4);
                                                        result['net_profit'] = lib.getCommaFloat(result['net_profit'] / 100, 4);
                                                        result['gross_profit'] = lib.getCommaFloat(result['gross_profit'] / 100, 4);
                                                        result['agent_profit'] = lib.getCommaFloat(result['agent_profit'] / 100, 4);
                                                        result['total_extra_bet'] = lib.getCommaFloat(result['total_extra_bet'] / 100, 4);
                                                        result['play_times_profit'] = lib.getCommaFloat(result['play_times_profit'] / 100, 4);
                                                        result['first_deposit_profit'] = lib.getCommaFloat(result['first_deposit_profit'] / 100, 4);
                                                        result['welcome_free_bit'] = lib.getCommaFloat(result['welcome_free_bit'] / 100, 4);
                                                        result['total_player_balance'] = lib.getCommaFloat(result['total_player_balance'] / 100, 4);
                                                        result['total_deposit'] = lib.getCommaFloat(result['total_deposit'] / 100, 4);
                                                        result['total_deposit_coin'] = lib.getCommaFloat(result['total_deposit_coin'] / 100, 4);
                                                        result['total_deposit_money'] = lib.getCommaFloat(result['total_deposit_money'] / 100, 4);
                                                        result['total_withdraw'] = lib.getCommaFloat(result['total_withdraw'] / 100, 4);
                                                        result['total_withdraw_coin'] = lib.getCommaFloat(result['total_withdraw_coin'] / 100, 4);
                                                        result['total_withdraw_money'] = lib.getCommaFloat(result['total_withdraw_money'] / 100, 4);
                                                        result['total_withdraw_fee'] = lib.getCommaFloat(result['total_withdraw_fee'] / 100, 4);
                                                        result['total_transfer_fee'] = lib.getCommaFloat(result['total_transfer_fee'] / 100, 4);
                                                        result['total_mining_fee'] = lib.getCommaFloat(result['total_mining_fee'] / 100, 4);
                                                        result['madabit_balance'] = lib.getCommaFloat(madabit_balance / 100, 4);
                                                        result['staff_balance'] = lib.getCommaFloat(staff_balance / 100, 4);

                                                        return callback(null, result);
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                    // });
                });
            });
        });
    });
};

exports.getStatisticsForAdminPage2 = function (last_game_id, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'rate_USD_bit'";
    query(sql, function (err, rateRecord) {
        var rate = 100;
        if (rateRecord.rows.length != 0) { rate = rateRecord.rows[0]['strvalue']; }

        sql = "SELECT SUM(strvalue::float) AS agent_percent_sum FROM common WHERE strkey LIKE 'agent_percent_%'";
        query(sql, function (err, agent_percent_sum) {
            agent_percent_sum = agent_percent_sum.rows[0]['agent_percent_sum'];

            var whereClauseWithDateRange = '';

            // where created at time zone 'Asia/Tokyo' > '2018-04-03 12:25:54';

            var sql_1 = 'SELECT SUM(p.profit_for_company + p.profit_for_staff) company_profit, SUM(p.bet + p.extra_bet) AS total_volume, ' +
                // "SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS gross_profit, " +
                'SUM(p.cash_out - p.bet - p.extra_bet) AS net_profit, ' +
                'SUM(p.profit_for_master_ib + p.profit_for_agent + p.profit_for_parent1 + p.profit_for_parent2 + p.profit_for_parent3) AS agent_profit, ' +
                'SUM(p.play_times_profit) AS play_times_profit, ' +
                'SUM(p.first_deposit_profit) AS first_deposit_profit, ' +
                'SUM(p.extra_bet) AS total_extra_bet ' +
                'FROM plays p ' +
                'WHERE p.game_id <= ' + last_game_id + ' AND p.demo = false ';

            var sql_2 = 'SELECT COUNT(p.user_id) total_player ' +
                'FROM plays p ' +
                'LEFT JOIN users u ON u.id = p.user_id ' +
                'WHERE p.game_id = ' + last_game_id + ' u.demo = false';

            var sql_3 = 'SELECT SUM(p.profit_for_company + p.profit_for_staff) daily_company_profit, ' +
                'SUM(p.bet + p.extra_bet) AS daily_volume, ' +
                'SUM(p.cash_out - p.bet - p.extra_bet) AS daily_net_profit, ' +
                'SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS daily_gross_profit, ' +
                'SUM(p.profit_for_master_ib + p.profit_for_agent + p.profit_for_parent1 + p.profit_for_parent2 + p.profit_for_parent3) AS daily_agent_profit, ' +
                'SUM(p.play_times_profit) AS daily_play_times_profit, ' +
                'SUM(p.first_deposit_profit) AS daily_first_deposit_profit, ' +
                'SUM(p.extra_bet) AS daily_extra_bet, ' +
                "to_char(p.created, 'YYYY-MM-DD') created_date " +
                'FROM plays p ' +
                'WHERE p.game_id <= ' + last_game_id + ' AND p.demo = false ' +
                "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
                'ORDER BY created_date';

            var sql_4 = "SELECT COUNT(p.user_id) daily_player, to_char(p.created, 'YYYY-MM-DD') created_date " +
                'FROM plays p ' +
                'WHERE p.game_id <= ' + last_game_id + ' AND p.demo = false ' +
                "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
                'ORDER BY created_date';

            var sql_5 = "SELECT COUNT(p.id) daily_game, to_char(p.created, 'YYYY-MM-DD') created_date " +
                'FROM games p ' +
                'WHERE p.id <= ' + last_game_id + ' ' +
                "GROUP BY to_char(p.created, 'YYYY-MM-DD') " +
                'ORDER BY created_date';

            var sql_depoist_withdraw = "SELECT p.amount, to_char(p.created, 'YYYY-MM-DD') created_date, p.fee, p.description " +
                'FROM fundings p ' +
                'LEFT JOIN users u ON u.id = p.user_id ' +
                "WHERE u.username != 'madabit' AND u.username != 'staff'";

            var sql_transfer_fee = 'SELECT p.fee, p.created ' +
                'FROM transfers p ' +
                'LEFT JOIN users u ON u.id = p.from_user_id ' +
                "WHERE u.username != 'madabit' AND u.username != 'staff'";

            var sql_welcome_free_bit = 'SELECT SUM(welcome_free_bit) AS sum_welcome_free_bit ' +
                'FROM users p ' +
                "WHERE p.demo = false AND p.username != 'madabit' " +
                "AND p.username != 'staff' AND p.userclass != 'admin'";

            var sql_balance_satoshis = 'SELECT SUM(u.prev_balance_satoshis) AS total_player_balance ' +
                'FROM users u ' +
                "WHERE  demo = false AND u.username != 'madabit' AND u.username != 'staff' AND " +
                "u.username != 'ex_to_mt_' AND u.username != 'fun_to_mt_' AND u.userclass != 'admin' AND " +
                "u.userclass != 'superadmin' AND u.userclass != 'staff'";

            query(sql_welcome_free_bit, function (err, sum_welcome_free_bit) {
                sum_welcome_free_bit = sum_welcome_free_bit.rows[0]['sum_welcome_free_bit'];

                query(sql_1, function (err, data1) {
                    var result = {};
                    result['dailyCompanyProfitList'] = [];
                    result['dailyPlayerList'] = [];
                    result['dailyVolumeList'] = [];
                    result['dailyGrossProfitList'] = [];
                    result['dailyNetProfitList'] = [];
                    result['dailyAgentProfitList'] = [];
                    result['dailyPlayTimesProfitList'] = [];
                    result['dailyWelcomeFreeBitList'] = [];
                    result['dailyExtraBetList'] = [];
                    result['dailyFirstDepositProfitList'] = [];
                    result['dailyGameList'] = [];
                    result['dailyDepositList'] = [];
                    result['dailyWithdrawList'] = [];

                    result['company_profit'] = data1.rows[0]['total_volume'] / 100 * agent_percent_sum / rate;
                    result['total_volume'] = data1.rows[0]['total_volume'] / rate;
                    result['net_profit'] = parseInt(data1.rows[0]['net_profit'] ? data1.rows[0]['net_profit'] : 0) / rate;
                    // result['gross_profit'] = Math.round(data1.rows[0]['gross_profit'] / 100 / rate);
                    result['gross_profit'] = (data1.rows[0]['total_volume'] / 100 * agent_percent_sum -
                        data1.rows[0]['agent_profit'] -
                        data1.rows[0]['play_times_profit'] -
                        data1.rows[0]['first_deposit_profit'] -
                        sum_welcome_free_bit) / rate;

                    // data1.rows[0]['welcome_free_bit']) / rate;                //company net profit
                    result['agent_profit'] = data1.rows[0]['agent_profit'] / rate;
                    result['total_extra_bet'] = data1.rows[0]['total_extra_bet'] / rate;
                    result['play_times_profit'] = data1.rows[0]['play_times_profit'] / rate;
                    result['first_deposit_profit'] = data1.rows[0]['first_deposit_profit'] / rate;
                    result['welcome_free_bit'] = sum_welcome_free_bit / rate;
                    result['total_player_balance'] = data1.rows[0]['total_player_balance'] / rate;
                    result['total_deposit'] = 0;
                    result['total_deposit_coin'] = 0;
                    result['total_deposit_money'] = 0;
                    result['total_withdraw'] = 0;
                    result['total_withdraw_coin'] = 0;
                    result['total_withdraw_money'] = 0;
                    result['total_withdraw_fee'] = 0;
                    result['total_transfer_fee'] = 0;
                    result['total_mining_fee'] = 0;

                    // query(sql_2, function(err, data2) {
                    //     if(err) return callback(err);

                    result['total_player'] = 0;
                    result['total_game'] = 0;

                    query(sql_3, function (err, data3) {
                        if (err) return callback(err);
                        data3 = data3.rows;

                        for (var i = 0; i < data3.length; i++) {
                            result['dailyCompanyProfitList'][result['dailyCompanyProfitList'].length] = {
                                profit: (data3[i]['daily_volume'] / 100 * agent_percent_sum) / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyVolumeList'][result['dailyVolumeList'].length] = {
                                value: data3[i]['daily_volume'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyNetProfitList'][result['dailyNetProfitList'].length] = {
                                value: data3[i]['daily_net_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyAgentProfitList'][result['dailyAgentProfitList'].length] = {
                                value: data3[i]['daily_agent_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyPlayTimesProfitList'][result['dailyPlayTimesProfitList'].length] = {
                                value: data3[i]['daily_play_times_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyFirstDepositProfitList'][result['dailyFirstDepositProfitList'].length] = {
                                value: data3[i]['daily_first_deposit_profit'] / rate,
                                created_date: data3[i]['created_date']
                            };

                            result['dailyExtraBetList'][result['dailyExtraBetList'].length] = {
                                value: data3[i]['daily_extra_bet'] / rate,
                                created_date: data3[i]['created_date']
                            };
                        }

                        query(sql_4, function (err, data4) {
                            if (err) return callback(err);
                            data4 = data4.rows;
                            for (var i = 0; i < data4.length; i++) {
                                result['dailyPlayerList'][result['dailyPlayerList'].length] = {
                                    value: data4[i]['daily_player'],
                                    created_date: data4[i]['created_date']
                                };
                                result['total_player'] += data4[i]['daily_player'];
                            }

                            query(sql_5, function (err, data5) {
                                if (err) return callback(err);
                                data5 = data5.rows;

                                for (var i = 0; i < data5.length; i++) {
                                    result['dailyGameList'][result['dailyGameList'].length] = {
                                        value: data5[i]['daily_game'],
                                        created_date: data5[i]['created_date']
                                    };
                                    result['total_game'] += data5[i]['daily_game'];
                                }

                                query(sql_depoist_withdraw, function (err, data_deposit_withdraw) {
                                    if (err) return callback(err);

                                    data_deposit_withdraw = data_deposit_withdraw.rows;

                                    var k_deposit = 0, k_withdraw = 0;
                                    var total_withdraw_fee = 0;
                                    var mining_fee = config.MINING_FEE;

                                    for (var i = 0; i < data_deposit_withdraw.length; i++) {
                                        var amount = data_deposit_withdraw[i]['amount'];
                                        var fee = data_deposit_withdraw[i]['fee'];
                                        var created_date = data_deposit_withdraw[i]['created'];
                                        var description = data_deposit_withdraw[i]['description'];

                                        if (amount > 0) {
                                            result['total_deposit'] += amount;
                                            if (description == 'ETH Deposit' || description == 'BTC Deposit') {
                                                result['total_deposit_coin'] += amount;
                                            } else {
                                                result['total_deposit_money'] += amount;
                                            }
                                            result['dailyDepositList'][k_deposit++] = {
                                                value: amount,
                                                created_date: created_date
                                            };
                                        } else {
                                            result['total_withdraw'] -= amount;
                                            if (description == 'ETH Withdrawal' || description == 'BTC Withdrawal') {
                                                result['total_withdraw_coin'] -= amount;
                                            } else {
                                                result['total_withdraw_money'] -= amount;
                                            }
                                            total_withdraw_fee += (fee != null && fee != undefined) ? fee : 0;
                                            if (description != 'OTC Withdraw') { result['total_mining_fee'] += mining_fee; }
                                            result['dailyWithdrawList'][k_withdraw++] = {
                                                value: amount,
                                                created_date: created_date
                                            };
                                        }
                                    }

                                    result['total_deposit'] = result['total_deposit'] / rate;
                                    result['total_deposit_coin'] = result['total_deposit_coin'] / rate;
                                    result['total_deposit_money'] = result['total_deposit_money'] / rate;
                                    result['total_withdraw'] = result['total_withdraw'] / rate;
                                    result['total_withdraw_coin'] = result['total_withdraw_coin'] / rate;
                                    result['total_withdraw_money'] = result['total_withdraw_money'] / rate;
                                    result['total_withdraw_fee'] += total_withdraw_fee / rate;
                                    result['total_mining_fee'] = result['total_mining_fee'] / rate;

                                    query(sql_transfer_fee, function (err, data_transfer_fee) {
                                        if (err) return callback(err);

                                        data_transfer_fee = data_transfer_fee.rows;
                                        var total_transfer_fee = 0;
                                        for (var i = 0; i < data_transfer_fee.length; i++) {
                                            var fee = data_transfer_fee[i]['fee'];
                                            total_transfer_fee += (fee != null && fee != undefined) ? fee : 0;
                                        }

                                        result['total_transfer_fee'] += total_transfer_fee / rate;
                                        result['gross_profit'] += result['total_withdraw_fee'] + result['total_transfer_fee'];
                                        result['company_profit'] = (data1.rows[0]['total_volume'] / 100 * agent_percent_sum + total_transfer_fee + total_withdraw_fee) / rate;

                                        query(sql_balance_satoshis, function (err, total_player_balance) {
                                            if (err) return callback(err);

                                            total_player_balance = total_player_balance.rows[0].total_player_balance / rate;
                                            result['total_player_balance'] = total_player_balance;

                                            // for testing... delete later.
                                            // result['difference'] = total_player_balance - result['net_profit'] - result['agent_profit'] - result.total_deposit;
                                            // result['difference1'] = total_player_balance * 100 - result['net_profit'] * 100 - result['agent_profit'] * 100 - result.total_deposit * 100;

                                            var sql_madabit_staff_balance = "SELECT username, prev_balance_satoshis FROM users WHERE username = 'madabit' OR username = 'staff'";
                                            query(sql_madabit_staff_balance, function (err, madabit_staff_balance) {
                                                madabit_staff_balance = madabit_staff_balance.rows;
                                                var madabit_balance = 0;
                                                var staff_balance = 0;
                                                for (var i = 0; i < madabit_staff_balance.length; i++) {
                                                    if (madabit_staff_balance[i].username == 'madabit') {
                                                        madabit_balance = madabit_staff_balance[i].prev_balance_satoshis / rate;
                                                    } else {
                                                        staff_balance = madabit_staff_balance[i].prev_balance_satoshis / rate;
                                                    }
                                                }

                                                query("SELECT strvalue FROM common WHERE strkey = 'deleted_profit'", [], function (err, deleted_profit_result) {
                                                    var deleted_profit = 0;
                                                    if (deleted_profit_result.rowCount == 1) { deleted_profit = deleted_profit_result.rows[0].strvalue; }

                                                    query('SELECT SUM(capture_pay) as total_capture_pay FROM users', function (err, total_capture_pay_result) {
                                                        var total_capture_pay = 0;
                                                        if (total_capture_pay_result.rowCount == 1 && total_capture_pay_result.rows[0].total_capture_pay != undefined) { total_capture_pay = total_capture_pay_result.rows[0].total_capture_pay; }

                                                        result['total_capture_pay'] = lib.getCommaFloat(total_capture_pay / rate / 100, 4);
                                                        result['deleted_profit'] = lib.getCommaFloat(deleted_profit / rate / 100, 4);
                                                        result['company_profit'] = lib.getCommaFloat(result['company_profit'] / 100, 4);
                                                        result['total_volume'] = lib.getCommaFloat(result['total_volume'] / 100, 4);
                                                        result['net_profit'] = lib.getCommaFloat(result['net_profit'] / 100, 4);
                                                        result['gross_profit'] = lib.getCommaFloat(result['gross_profit'] / 100, 4);
                                                        result['agent_profit'] = lib.getCommaFloat(result['agent_profit'] / 100, 4);
                                                        result['total_extra_bet'] = lib.getCommaFloat(result['total_extra_bet'] / 100, 4);
                                                        result['play_times_profit'] = lib.getCommaFloat(result['play_times_profit'] / 100, 4);
                                                        result['first_deposit_profit'] = lib.getCommaFloat(result['first_deposit_profit'] / 100, 4);
                                                        result['welcome_free_bit'] = lib.getCommaFloat(result['welcome_free_bit'] / 100, 4);
                                                        result['total_player_balance'] = lib.getCommaFloat(result['total_player_balance'] / 100, 4);
                                                        result['total_deposit'] = lib.getCommaFloat(result['total_deposit'] / 100, 4);
                                                        result['total_deposit_coin'] = lib.getCommaFloat(result['total_deposit_coin'] / 100, 4);
                                                        result['total_deposit_money'] = lib.getCommaFloat(result['total_deposit_money'] / 100, 4);
                                                        result['total_withdraw'] = lib.getCommaFloat(result['total_withdraw'] / 100, 4);
                                                        result['total_withdraw_coin'] = lib.getCommaFloat(result['total_withdraw_coin'] / 100, 4);
                                                        result['total_withdraw_money'] = lib.getCommaFloat(result['total_withdraw_money'] / 100, 4);
                                                        result['total_withdraw_fee'] = lib.getCommaFloat(result['total_withdraw_fee'] / 100, 4);
                                                        result['total_transfer_fee'] = lib.getCommaFloat(result['total_transfer_fee'] / 100, 4);
                                                        result['total_mining_fee'] = lib.getCommaFloat(result['total_mining_fee'] / 100, 4);
                                                        result['madabit_balance'] = lib.getCommaFloat(madabit_balance / 100, 4);
                                                        result['staff_balance'] = lib.getCommaFloat(staff_balance / 100, 4);

                                                        return callback(null, result);
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                    // });
                });
            });
        });
    });
};

/*
 * select messages from the supports table which will show in notification box
 */
exports.getReplyCheck = function (userid, callback) {
    var sql = 'SELECT * FROM supports WHERE ' +
        'message_to_user IS NOT NULL ' +
        'AND (reply_check IS NULL OR reply_check IS FALSE) ' +
        'AND user_id=' + userid;

    query(sql, function (err, res) {
        if (err) return callback(err);
        // else if (res.rowCount === 0) return callback("NO RESULT FROM DATABASE QUERY");
        else callback(null, res.rows);
    });
};

exports.setToBeAgentDepositMultiplier = function (to_be_agent_deposit_multiplier, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'to_be_agent_deposit_multiplier'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert to_be_agent_deposit_multiplier [begin] :' + to_be_agent_deposit_multiplier);
            console.log('setting - insert to_be_agent_deposit_multiplier [begin] :' + to_be_agent_deposit_multiplier);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['to_be_agent_deposit_multiplier', to_be_agent_deposit_multiplier], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert to_be_agent_deposit_multiplier [end] :' + to_be_agent_deposit_multiplier);
                console.log('setting - insert to_be_agent_deposit_multiplier [end] :' + to_be_agent_deposit_multiplier);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='to_be_agent_deposit_multiplier'";
        lib.log('info', 'setting - update to_be_agent_deposit_multiplier [begin] :' + to_be_agent_deposit_multiplier);
        console.log('setting - update to_be_agent_deposit_multiplier [begin] :' + to_be_agent_deposit_multiplier);
        query(sql, [to_be_agent_deposit_multiplier], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update to_be_agent_deposit_multiplier [end] :' + to_be_agent_deposit_multiplier);
            console.log('setting - update to_be_agent_deposit_multiplier [end] :' + to_be_agent_deposit_multiplier);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.setToBeAgentClientCount = function (to_be_agent_client_count, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'to_be_agent_client_count'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert to_be_agent_client_count [begin] :' + to_be_agent_client_count);
            console.log('setting - insert to_be_agent_client_count [begin] :' + to_be_agent_client_count);
            query(sql, ['to_be_agent_client_count', to_be_agent_client_count], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert to_be_agent_client_count [end] :' + to_be_agent_client_count);
                console.log('setting - insert to_be_agent_client_count [end] :' + to_be_agent_client_count);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='to_be_agent_client_count'";
        lib.log('info', 'setting - update to_be_agent_client_count [begin] :' + to_be_agent_client_count);
        console.log('setting - update to_be_agent_client_count [begin] :' + to_be_agent_client_count);
        query(sql, [to_be_agent_client_count], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update to_be_agent_client_count [end] :' + to_be_agent_client_count);
            console.log('setting - update to_be_agent_client_count [end] :' + to_be_agent_client_count);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    // }, callback);
};

/*
 * remove a notification from a notification box
 */
exports.deleteMail = function (mail_id, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE supports SET reply_check=true WHERE id=' + mail_id;
    /* client. */query(sql, function (err, res) {
        if (err) return callback(err);
        else return callback(null, res.rows);
    });
    /* }, callback); */
};

exports.checkDup = function (reg_name, phone_number, callback) {
    var sql = 'SELECT (SELECT count(*) FROM users WHERE lower(username)=lower($1)) + (SELECT count(*) FROM register WHERE lower(username)=lower($1)) as name_dup';
    query(sql, [reg_name], function (err, res) {
        if (err) return callback(err);
        if (res.rowCount != 1) return callback('ERROR_1');

        var nCntDup = parseInt(res.rows[0].name_dup);
        if (nCntDup > 0) return callback(null, 'NAME_DUP');

        sql = 'SELECT (SELECT count(*) FROM users WHERE lower(phone_number)=lower($1) AND is_deleted = false ) + (SELECT count(*) FROM register WHERE lower(phone_number)=lower($1)) as phone_dup';
        query(sql, [phone_number], function (err, res) {
            if (err) return callback(err);

            if (res.rowCount != 1) return callback('ERROR_2');

            var nCntDup = parseInt(res.rows[0].phone_dup);
            if (nCntDup > 0) return callback(null, 'PHONE_DUP');

            callback(null, 'NO_DUP');
        });
    });
};

exports.createRegBuffer = function (username, phone_number, password, ref_id, email, ipAddress, userAgent, verify_code, callback) {
    /* getClient(function(client, callback)
    { */
    var sql;
    sql = 'DELETE FROM register WHERE username=$1';
    /* client. */query(sql, [username], function (err, res) {
        if (err) return callback(err);

        sql = 'INSERT INTO register (username, phone_number, password, ref_id, email, ip_address, user_agent, verify_code, created) VALUES($1, $2, $3, $4, $5, $6, $7, $8, now())';
        /* client. */query(sql, [username, phone_number, password, ref_id, email, ipAddress, userAgent, verify_code], function (err, res) {
            if (err) return callback(err);
            return callback(null);
        });
    });
    // }, callback);
};

exports.delRegBuffer = function (username, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "DELETE FROM register WHERE lower(username)=lower($1) OR (DATE_PART('hour', now()-created)*60 + DATE_PART('minute', now()-created)) > 5 OR check_count > 3";
    /* client. */query(sql, [username], function (err) {
        if (err) return callback(err);

        callback(null);
    });
    /* }, callback); */
};

exports.checkVerifyCode = function (username, verify_code, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT DATE_PART('hour', now()-created)*60 + DATE_PART('minute', now()-created) AS min_diff, check_count, verify_code FROM register WHERE lower(username)=lower($1)";
    query(sql, [username], function (err, res) {
        if (err) return callback(err);
        if (res.rowCount != 1) {
            if (err) return callback(err);
            return callback('ILLEGAL_USER');
        } else {
            sql = 'UPDATE register SET check_count=check_count + 1 WHERE lower(username)=lower($1)';
            /* client. */query(sql, [username], function (err) {
                if (err) return callback(err);

                var nMin = res.rows[0].min_diff;
                var nCheckCount = res.rows[0].check_count;
                var strVerifyCode = res.rows[0].verify_code;

                nMin = parseInt(nMin);
                nCheckCount = parseInt(nCheckCount);
                if (nCheckCount > 3) {
                    sql = 'DELETE FROM register WHERE lower(username)=lower($1)';
                    /* client. */query(sql, [username], function (err) {
                        if (err) return callback(err);
                        return callback('EXCEED_MAX_INPUT');
                    });
                } else {
                    if (nMin > 5) {
                        sql = 'DELETE FROM register WHERE lower(username)=lower($1)';
                        /* client. */query(sql, [username], function (err) {
                            if (err) return callback(err);
                            return callback('EXCEED_MAX_MINUTE');
                        });
                    } else {
                        if (strVerifyCode != verify_code) {
                            return callback('VERIFY_CODE_MISMATCH');
                        }

                        return callback(null, res.rows[0]);
                    }
                }
            });
        }
    });
    /* }, callback); */
};

exports.getUserAccountPageStatistics = function (user_id, date_from, date_to, time_zone_name, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'rate_USD_bit'";
    query(sql, [], function (err, rateRecord) {
        var rate = 100;
        if (rateRecord.rows.length != 0) { rate = rateRecord.rows[0]['strvalue']; }

        var whereClauseWithDateRange = '';
        if (date_from != '' && date_to != '' && time_zone_name != '') {
            whereClauseWithDateRange = 'WHERE p.user_id = ' + user_id + " AND p.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
                "p.created at time zone '" + time_zone_name + "' <= '" + date_to + "' ";
        } else { whereClauseWithDateRange = 'WHERE p.user_id = ' + user_id + ' '; }

        var sql = 'SELECT SUM(p.bet + p.extra_bet) AS total_volume, ' +
            'SUM(p.cash_out - p.bet - p.extra_bet) AS net_profit, ' +
            'SUM(p.play_times_profit) AS play_times_profit, ' +
            'SUM(p.first_deposit_profit) AS first_deposit_profit, ' +
            'SUM(CASE WHEN (p.cash_out - p.bet - p.extra_bet) < 0 THEN 0 else (p.cash_out - p.bet - p.extra_bet) END) AS gross_profit ' +
            'FROM plays p ' +
            whereClauseWithDateRange;

        var sql_game = 'SELECT COUNT(game_id) game_count ' +
            'FROM plays p ' +
            whereClauseWithDateRange;

        var sql_deposit = 'SELECT SUM(p.amount) sum_deposit ' +
            'FROM fundings p ' +
            whereClauseWithDateRange + 'AND p.amount >= 0';

        var sql_withdraw = 'SELECT SUM(p.amount) sum_withdrawal ' +
            'FROM fundings p ' +
            whereClauseWithDateRange + 'AND p.amount < 0 ';

        var sql_welcome_free_bit = 'SELECT welcome_free_bit FROM users WHERE id = ' + user_id;

        var statistics = {};

        query(sql_welcome_free_bit, function (err, welcome_free_bit) {
            if (err) return callback(err);

            welcome_free_bit = welcome_free_bit.rows[0]['welcome_free_bit'];

            query(sql, function (err, data) {
                if (err) return callback(err);

                data = data.rows;

                statistics['total_volume'] = 0;
                statistics['net_profit'] = 0;
                statistics['gross_profit'] = 0;
                statistics['game_count'] = 0;
                statistics['deposit'] = 0;
                statistics['withdrawal'] = 0;
                statistics['play_times_profit'] = 0;
                statistics['first_deposit_profit'] = 0;
                statistics['welcome_free_bit'] = (welcome_free_bit / 100).toFixed();

                if (data.length != 0) {
                    statistics['total_volume'] = data[0].total_volume == undefined ? 0 : (data[0].total_volume / 100).toFixed();
                    statistics['net_profit'] = data[0].net_profit == undefined ? 0 : (data[0].net_profit / 100).toFixed();
                    statistics['gross_profit'] = data[0].gross_profit == undefined ? 0 : (data[0].gross_profit / 100).toFixed();
                    statistics['play_times_profit'] = data[0].play_times_profit == undefined ? 0 : (data[0].play_times_profit / 100).toFixed();
                    statistics['first_deposit_profit'] = data[0].first_deposit_profit == undefined ? 0 : (data[0].first_deposit_profit / 100).toFixed();
                    // statistics['welcome_free_bit'] = data[0].welcome_free_bit == undefined ? 0 : (data[0].welcome_free_bit / 100).toFixed();
                }

                query(sql_game, function (err, data_game) {
                    if (err) callback(err);

                    if (data_game.rows.length != 0) { statistics['game_count'] = data_game.rows[0]['game_count']; }

                    query(sql_deposit, function (err, data_deposit) {
                        if (err) callback(err);

                        if (data_deposit.rows.length != 0) {
                            statistics['deposit'] = (data_deposit.rows[0]['sum_deposit'] / 100).toFixed();
                        }

                        query(sql_withdraw, function (err, data_withdrawal) {
                            if (err) callback(err);

                            if (data_withdrawal.rows.length != 0) {
                                statistics['withdrawal'] = (data_withdrawal.rows[0]['sum_withdrawal'] / 100).toFixed();
                            }

                            callback(null, statistics);
                        });
                    });
                });
            });
        });
    });
};

/*
 * get the company mail address or set to the default value
 */
exports.getCompanyMail = function (callback) {
    /* getClient(function(client, callback)
    { */
    query("SELECT strvalue FROM common WHERE strkey='company_mail'", function (err, res) {
        if (err) return callback(err);
        if (res.rowCount === 0) {
            lib.log('info', 'setting - insert company_mail [begin] : example@domain.com');
            console.log('setting - insert company_mail [begin] : example@domain.com');
            /* client. */query("INSERT INTO common(strkey, strvalue) VALUES ('company_mail', 'example@domain.com')", function (error, result) {
                if (error) return callback(error);
                lib.log('info', 'setting - insert company_mail [end] : example@domain.com');
                console.log('setting - insert company_mail [end] : example@domain.com');
                return callback(null, 'example@domain.com');
            });
        } else {
            return callback(null, res.rows[0].strvalue);
        }
    });
    /* }, callback); */
};

/*
 * get company password for the above email or return the default
 */
exports.getCompanyPassword = function (callback) {
    /* getClient(function(client, callback)
    { */
    query("SELECT strvalue FROM common WHERE strkey='mail_password'", function (err, res) {
        if (err) return callback(err);
        if (res.rowCount === 0) {
            /* client. */query("INSERT INTO common(strkey, strvalue) VALUES ('mail_password', 'password')", function (error, result) {
                if (error) return callback(error);
                return callback(null, 'password');
            });
        } else {
            return callback(null, res.rows[0].strvalue);
        }
    });
    // }, callback);
};

/*
 * update the company mail address for the game site
 */
exports.changeMail = function (company_mail, mail_password, callback) {
    /* getClient(function(client, callback)
    { */
    save_company_mail();
    function save_company_mail () {
        var sql = "SELECT * FROM common WHERE strkey = 'company_mail'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                lib.log('info', 'setting - insert company_mail [begin] :' + company_mail);
                console.log('setting - insert company_mail [begin] :' + company_mail);
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                query(sql, ['company_mail', company_mail], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - insert company_mail [end] :' + company_mail);
                    console.log('setting - insert company_mail [end] :' + company_mail);

                    if (res.rowCount == 1) { return save_company_mail_password(); }

                    return callback(null, false);
                });
            }

            lib.log('info', 'setting - update company_mail [begin] :' + company_mail);
            console.log('setting - update company_mail [begin] :' + company_mail);
            sql = "UPDATE common SET strvalue=$1 WHERE strkey='company_mail'";
            query(sql, [company_mail], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - update company_mail [end] :' + company_mail);
                console.log('setting - update company_mail [end] :' + company_mail);

                if (res.rowCount == 1) { return save_company_mail_password(); }
                return callback(null, false);
            });
        });
    }

    function save_company_mail_password () {
        var sql = "SELECT * FROM common WHERE strkey = 'mail_password'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                lib.log('info', 'setting - insert mail_password [begin] :' + mail_password);
                console.log('setting - insert mail_password [begin] :' + mail_password);
                query(sql, ['mail_password', mail_password], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - insert mail_password [end] :' + mail_password);
                    console.log('setting - insert mail_password [end] :' + mail_password);

                    if (res.rowCount == 1) { return callback(null, true); }
                    return callback(null, false);
                });
            }

            sql = "UPDATE common SET strvalue=$1 WHERE strkey='mail_password'";
            lib.log('info', 'setting - update mail_password [begin] :' + mail_password);
            console.log('setting - update mail_password [begin] :' + mail_password);
            query(sql, [mail_password], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - update mail_password [end] :' + mail_password);
                console.log('setting - update mail_password [end] :' + mail_password);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        });
    }
    /* }, callback); */
};

exports.setBetMode = function (bet_mode, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'bet_mode'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert bet_mode [begin] :' + bet_mode);
            console.log('setting - insert bet_mode [begin] :' + bet_mode);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['bet_mode', bet_mode], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert bet_mode [end] :' + bet_mode);
                console.log('setting - insert bet_mode [end] :' + bet_mode);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='bet_mode'";
        lib.log('info', 'setting - update bet_mode [begin] :' + bet_mode);
        console.log('setting - update bet_mode [begin] :' + bet_mode);
        query(sql, [bet_mode], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update bet_mode [end] :' + bet_mode);
            console.log('setting - update bet_mode [end] :' + bet_mode);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    // }, callback);
};

/**
 * Set Mobile Bet Mode (Custom-Bet show or hide)
 * @author Bio
 * @since 2018.3.25
 */
exports.setMobileBetMode = function (bet_mode_mobile, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'bet_mode_mobile'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            lib.log('info', 'setting - insert bet_mode_mobile [begin] :' + bet_mode_mobile);
            console.log('setting - insert bet_mode_mobile [begin] :' + bet_mode_mobile);
            query(sql, ['bet_mode_mobile', bet_mode_mobile], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert bet_mode_mobile [end] :' + bet_mode_mobile);
                console.log('setting - insert bet_mode_mobile [end] :' + bet_mode_mobile);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='bet_mode_mobile'";
        lib.log('info', 'setting - update bet_mode_mobile [begin] :' + bet_mode_mobile);
        console.log('setting - update bet_mode_mobile [begin] :' + bet_mode_mobile);
        query(sql, [bet_mode_mobile], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update bet_mode_mobile [end] :' + bet_mode_mobile);
            console.log('setting - update bet_mode_mobile [end] :' + bet_mode_mobile);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    // }, callback);
};

/**
 * Set Hash Visiblity (show_hash/hide_hash)
 * @author Bio
 * @since 2018.3.26
 */
exports.setShowHash = function (show_hash, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = "SELECT * FROM common WHERE strkey = 'show_hash'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        if (res.rowCount == 0) {
            lib.log('info', 'setting - insert show_hash [begin] :' + show_hash);
            console.log('setting - insert show_hash [begin] :' + show_hash);
            sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
            query(sql, ['show_hash', show_hash], function (err, res) {
                if (err) return callback(err);

                lib.log('info', 'setting - insert show_hash [end] :' + show_hash);
                console.log('setting - insert show_hash [end] :' + show_hash);

                if (res.rowCount == 1) { return callback(null, true); }
                return callback(null, false);
            });
        }

        sql = "UPDATE common SET strvalue=$1 WHERE strkey='show_hash'";
        lib.log('info', 'setting - update show_hash [begin] :' + show_hash);
        console.log('setting - update show_hash [begin] :' + show_hash);
        query(sql, [show_hash], function (err, res) {
            if (err) return callback(err);

            lib.log('info', 'setting - update show_hash [end] :' + show_hash);
            console.log('setting - update show_hash [end] :' + show_hash);

            if (res.rowCount == 1) { return callback(null, true); }
            return callback(null, false);
        });
    });
    /* }, callback); */
};

exports.getLoginBonusList = function (callback) {
    var sql = 'SELECT * FROM login_bonus ORDER BY id';
    query(sql, function (e, r) {
        if (e) { return callback(e); }

        var nCnt = r.rowCount;
        for (var nId = nCnt; nId < 7; nId++) {
            r.rows.push({id: nId + 1, bonus: (nId + 1) * 10});
        }

        // if (r.rowCount == 0) return callback(null, {});
        return callback(null, r.rows);
    });
};

exports.getUserGameHistory = function (userId, date_from, date_to, time_zone_name, callback) {
    var sql = "SELECT g.id game_id, g.game_crash, g.created at time zone '" + time_zone_name + "' AS created, \n" +
        'p.cash_out, p.bet, p.extra_bet, u.id user_id, u.username, p.range_bet_amount, p.range_bet_from, p.range_bet_to, p.range_bet_multiplier\n' +
        'FROM plays p\n' +
        'LEFT JOIN games g ON g.id = p.game_id\n' +
        'LEFT JOIN users u ON u.id = p.user_id\n' +
        'WHERE u.id = $1 AND g.ended = TRUE AND \n' +
        "g.created at time zone '" + time_zone_name + "' >= '" + date_from + "' AND " +
        "g.created at time zone '" + time_zone_name + "' <= '" + date_to + "' " +
        'ORDER by g.created DESC';
    query(sql, [userId], function (err, histories) {
        if (err) callback(err);
        callback(null, histories.rows);
    });
};

exports.requestVerifyCode = function (user_id, verify_code, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'DELETE FROM withdraw_verify WHERE id=$1';
    /* client. */query(sql, [user_id], function (err, res) {
        if (err) return callback(err);

        sql = 'SELECT phone_number FROM users WHERE id=$1';
        query(sql, [user_id], function (err, res) {
            if (err) { return callback(err); }
            if (res.rowCount != 1) { return callback('ERR_PHONE'); }
            var phone_number = res.rows[0].phone_number;
            // if (phone_number == '85569845910') { verify_code = '0'; }
            sql = 'INSERT INTO withdraw_verify (id, verify_code) VALUES($1, $2)';
            query(sql, [user_id, verify_code], function (err, res) {
                if (err) { return callback(err); }
                return callback(null, phone_number);
            });
        });
    });
    /* }, callback); */
};

exports.checkWithdrawVerifyCode = function (user_id, verify_code, callback) {
    var sql = 'SELECT * FROM withdraw_verify WHERE id=$1 AND verify_code=$2';
    query(sql, [user_id, verify_code], function (err, res) {
        if (err) return callback(err);
        if (res.rowCount != 1) return callback('ILLEGAL');
        return callback(null);
    });
};

exports.canUserChat = function (user_id, callback) {
    var sql = 'SELECT can_chat FROM users WHERE id=$1';
    query(sql, [user_id], function (err, res) {
        if (err) return callback(err);

        if (res.rowCount != 1) return callback('ERROR');
        var can_chat = res.rows[0].can_chat;
        if (can_chat == null || can_chat == false) return callback('MUTED');

        return callback(null);
    });
};

exports.getAgentUserList = function (callback, param) {
    var sort_field = '';
    var sort_direction = '';
    if (param == undefined || param.sort_field == undefined || param.sort_direction == undefined || param.sort_field == 'undefined' || param.sort_direction == 'undefined') {
        sort_field = 'userclass';
        sort_direction = 'ASC';
    } else {
        sort_field = param.sort_field;
        sort_direction = param.sort_direction;
    }
    var sql = "SELECT * FROM users WHERE userclass = 'agent' OR userclass = 'master_ib' ";
    var order_clause = ' ORDER BY ' + sort_field + ' ' + sort_direction;
    sql += order_clause;
    query(sql, function (err, result) {
        if (err) { callback(err); }
        callback(null, result.rows);
    });
};

exports.saveIBRanking = function (ibRanking, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'DELETE from ib_ranking';

    /* client. */query(sql, function (err, result) {
        if (err) { callback(err); }
        sql = 'INSERT INTO ib_ranking (id, user_id, rank, amount) VALUES($1, $2, $3, $4)';

        for (var i = 0; i < ibRanking.length; i++) {
            var id = i + 1;
            var user_id = ibRanking[i]['user_id'];
            var rank = ibRanking[i]['rank'];
            var amount = ibRanking[i]['amount'];
            /* client. */query(sql, [id, user_id, rank, amount], function (err, callback) {
            });
        }
        callback(null, true);

    // var tasks = [];
    // for(var i = 0; i < ibRanking.length; i++) {
    //     var id = i + 1;
    //     var user_id = ibRanking[i]['user_id'];
    //     var rank = ibRanking[i]['rank'];
    //     var amount = ibRanking[i]['amount'];
    //     tasks.push(function(callback) {
    //         client.query(sql, [id, user_id, rank, amount], callback);
    //     });
    // }
    //
    // async.parallel(tasks, function (err, result) {
    //      if (err)
    //         return callback(err);
    //     callback(null, true);
    // });
    });
    /* }, callback); */
};

exports.getIBRanking = function (callback) {
    var sql = 'SELECT r.*, u.username\n' +
        'FROM ib_ranking r\n' +
        'LEFT JOIN users u ON u.id = r.user_id\n' +
        'ORDER BY r.rank';

    query(sql, function (err, result) {
        if (err) { return callback(err); }
        callback(null, result.rows);
    });
};

/**
 * Unlock Password in Admin Capture Pay Page
 * @author Bio
 * @since 2018.5.30
 * @param param['password']
 * @return true/false
 */
exports.capturePayUnlockPassword = function (param, callback) {
    var sql = "SELECT strvalue FROM common WHERE strkey = 'capture_pay_password'";

    query(sql, function (err, result) {
        if (err) {
            return callback(err, false);
        }
        if (result.rowCount != 1) { return callback(null, false); }
        if (result.rows[0].strvalue == param.current_password) { return callback(null, true); }
        return callback(null, false);
    });
};

/**
 * Update Password in Admin Capture Pay Page
 * @author Bio
 * @since 2018.5.30
 * @param param['new_password']
 * @return true/false
 */
exports.capturePayUpdatePassword = function (param, callback) {
    var sql = "SELECT strvalue FROM common WHERE strkey = 'capture_pay_password'";

    query(sql, function (err, result) {
        if (err) {
            return callback(err, false);
        }
        if (result.rowCount == 0) {
            sql = 'INSERT INTO common (strkey, strvalue) VALUES ($1, $2)';
            query(sql, ['capture_pay_password', param.new_password], function (err, result) {
                if (err) { return callback(null, false); }
                return callback(null, true);
            });
        } else {
            sql = 'UPDATE common SET strvalue = $1 WHERE strkey = $2';
            query(sql, [param.new_password, 'capture_pay_password'], function (err, result) {
                if (err) { return callback(null, false); }
                return callback(null, true);
            });
        }
    });
};

/**
 * Deposit Capture Pay in Admin Page
 * @param cpPayInfo
 * @return {err, 'failed'} OR
 * @return {err, funding_info}
 */
exports.depositCapturePay = function (cpPayInfo, callback) {
    var username = cpPayInfo.user;
    var cp_type = cpPayInfo.type;
    var amount = cpPayInfo.amount;
    amount = parseInt(amount) * 100;

    var sql = 'UPDATE users SET balance_satoshis = balance_satoshis + $1, capture_pay = capture_pay + $1 WHERE username=$2 RETURNING *';
    query(sql, [amount, username], function (err, result) {
        if (err) {
            return callback(err, 'failed');
        }

        var user_id = result.rows[0].id;

        sql = "INSERT INTO fundings(user_id, amount, description, baseunit, currency) VALUES($1, $2, $3, $4, 'USD') RETURNING *";
        query(sql, [user_id, amount, cp_type, amount / 100], function (err, result) {
            if (err) {
                return callback(err, 'failed');
            }

            var funding_info = result.rows[0];
            funding_info['username'] = '';

            sql = 'SELECT * FROM users WHERE id = $1';
            query(sql, [funding_info.user_id], function (err, user_info) {
                if (err) {
                    return callback(null, funding_info);
                }
                funding_info.username = user_info.rows[0].username;
                return callback(null, funding_info);
            });
        });
    });
};

/**
 * Get Capture Pay List
 * @author Bio
 * @param param['time_zone']
 * @return [{id, user_id, amount, fee, withdrawal_txid, withdrawal_address,
 *          created, description, deposit_txid, withdrawal_id baseunit,
 *          currency created_timezone, username}]
 * Modified By Bio 2018.6.1
 */
exports.getCapturePayList = function (param, callback) {
    var sql = 'SELECT username FROM users WHERE ' +
        "username != 'madabit' AND " +
        "userclass != 'staff' AND " +
        "username != 'staff' AND " +
        "username != 'superadmin' AND " +
        "username != 'ex_to_mt_' AND " +
        "username != 'fun_to_mt_' AND " +
        "userclass != 'staff' AND " +
        "userclass != 'superadmin' AND " +
        'demo = false;';

    query(sql, function (err, result) {
        if (err) {
            return callback(err);
        }

        var aryUsers = result.rows;
        var capturePayType = [{'cp_type': 'WeChat Pay'}, {'cp_type': 'QQ Pay'}];

        sql = "SELECT f.*, u.username, f.created at time zone '" + param.time_zone + "' AS created_timezone " +
                'FROM fundings f ' +
                'LEFT JOIN users u ON u.id = f.user_id ' +
                "WHERE description = 'WeChat Pay' " +
                'ORDER BY created DESC; ';
        query(sql, function (err, result) {
            if (err) return callback(err);
            var history = result.rows;

            return callback(null, {
                cp_users: aryUsers,
                cp_types: capturePayType,
                cp_history: history
            });
        });
    });
};

exports.setPlaying = function (username, bPlaying, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE users SET playing=$1 WHERE lower(username)=lower($2)';
    /* client. */query(sql, [bPlaying, username], function (err) {
        if (err) return callback(err);
        return callback(null);
    });
    /* }, callback); */
};

exports.getPlaying = function (username, callback) {
    var sql = 'SELECT playing FROM users WHERE (lower(username)=lower($1) OR lower(phone_number)=lower($1)) AND is_deleted = false';
    query(sql, [username], function (err, res) {
        if (err) return callback(err);
        if (res.rowCount != 1) return callback('NO_USER', false);
        var bPlaying = res.rows[0].playing;
        return callback(null, bPlaying);
    });
};

exports.clearPlaying = function (callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'UPDATE users SET playing=false';
    /* client. */query(sql, function (e) {
        if (e) return callback(e);
        return callback(null);
    });
    /* }, callback); */
};

exports.getVerifyCodeFromRegBuffer = function (username, phone_number, strVerifyCode, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * ' +
            'FROM register ' +
            'WHERE  check_count < 3 AND ' +
            'lower(username) = lower($1) AND ' +
            'phone_number = $2 AND ' +
            'extract(epoch from (NOW() - created)) < 300 ' +
            'ORDER BY created DESC';

    query(sql, [username, phone_number], function (err, result) {
        if (err) { return callback(err); }

        if (result.rowCount == 0) { return callback('Time is limited.', ''); }

        sql = 'UPDATE register SET verify_code = $1, check_count = check_count + 1 WHERE username = $2 AND phone_number = $3 AND verify_code = $4';
        /* client. */query(sql, [strVerifyCode, username, phone_number, result.rows[0]['verify_code']], function (err) {
            if (err) return callback(err, false);
            return callback(null, strVerifyCode);
        });
    });
    /* }, callback); */
};

exports.getVerifyCodeFromRegBufferWithUsername = function (username, email, strVerifyCode, callback) {
    /* getClient(function(client, callback)
    { */
    var sql = 'SELECT * ' +
        'FROM register ' +
        'WHERE  check_count < 3 AND ' +
        'lower(username) = lower($1) AND ' +
        // 'email = $2 AND ' +
        'extract(epoch from (NOW() - created)) < 300 ' +
        'ORDER BY created DESC';

    query(sql, [username], function (err, result) {
        if (err) { return callback(err); }

        if (result.rowCount == 0) { return callback('Time is limited.', ''); }

        sql = 'UPDATE register SET verify_code = $1, email = $2, check_count = check_count + 1 WHERE username = $3 AND verify_code = $4';
        /* client. */query(sql, [strVerifyCode, email, username, result.rows[0]['verify_code']], function (err) {
            if (err) return callback(err, false);
            return callback(null, strVerifyCode);
        });
    });
    /* }, callback); */
};

exports.canWithdraw = function (user_id, callback) {
    var sql = "SELECT * FROM common WHERE strkey = 'withdrawable_bet_amount'";
    query(sql, function (err, res) {
        if (err) return callback(err);

        var withdrawable_bet_amount = 0;
        if (res.rowCount == 1) withdrawable_bet_amount = parseInt(res.rows[0]['strvalue']);

        sql = 'select * from users where users.id=$1 and (select sum(plays.bet) + sum(plays.extra_bet) from plays where plays.user_id=users.id) >= $2';
        query(sql, [user_id, withdrawable_bet_amount], function (err, result) {
            if (err) return callback(err);
            if (result.rowCount == 0) return callback(null, false);
            return callback(null, true);
        });
    });
};

/**
 * Set No Agent Commission Region
 * @author Bio
 * @since 2018.3.29
 * @default from : 1, to : 1.5
 */
exports.saveNoAgentCommissionRegion = function (no_commission_from, no_commission_to, callback) {
    /* getClient(function(client, callback)
    { */
    save_no_agent_commission_from();

    function save_no_agent_commission_from () {
        var sql = "SELECT * FROM common WHERE strkey = 'no_commission_from'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                lib.log('info', 'setting - insert no_commission_from [begin] :' + no_commission_from);
                console.log('setting - insert no_commission_from [begin] :' + no_commission_from);
                query(sql, ['no_commission_from', no_commission_from], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - insert no_commission_from [end] :' + no_commission_from);
                    console.log('setting - insert no_commission_from [end] :' + no_commission_from);

                    if (res.rowCount == 1) { return save_no_agent_commission_to(); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='no_commission_from'";
                lib.log('info', 'setting - update no_commission_from [begin] :' + no_commission_from);
                console.log('setting - update no_commission_from [begin] :' + no_commission_from);
                query(sql, [no_commission_from], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - update no_commission_from [end] :' + no_commission_from);
                    console.log('setting - update no_commission_from [end] :' + no_commission_from);

                    if (res.rowCount == 1) { return save_no_agent_commission_to(); }
                    return callback(null, false);
                });
            }
        });
    }

    function save_no_agent_commission_to () {
        var sql = "SELECT * FROM common WHERE strkey = 'no_commission_to'";
        query(sql, function (err, res) {
            if (err) return callback(err);

            if (res.rowCount == 0) {
                sql = 'INSERT INTO common (strkey, strvalue) VALUES($1, $2)';
                lib.log('info', 'setting - insert no_commission_to [begin] :' + no_commission_to);
                console.log('setting - insert no_commission_to [begin] :' + no_commission_to);
                query(sql, ['no_commission_to', no_commission_to], function (err, res) {
                    if (err) return callback(err);
                    lib.log('info', 'setting - insert no_commission_to [end] :' + no_commission_to);
                    console.log('setting - insert no_commission_to [end] :' + no_commission_to);
                    if (res.rowCount == 1) { return callback(null, true); }
                    return callback(null, false);
                });
            } else {
                sql = "UPDATE common SET strvalue=$1 WHERE strkey='no_commission_to'";
                lib.log('info', 'setting - update no_commission_to [begin] :' + no_commission_to);
                console.log('setting - update no_commission_to [begin] :' + no_commission_to);
                query(sql, [no_commission_to], function (err, res) {
                    if (err) return callback(err);

                    lib.log('info', 'setting - update no_commission_to [end] :' + no_commission_to);
                    console.log('setting - update no_commission_to [end] :' + no_commission_to);

                    if (res.rowCount == 1) { return callback(null, true); }
                    return callback(null, false);
                });
            }
        });
    }
    // }, callback);
};

exports.createSuperAccount = function (username, password, callback) {
    getClient(
        function (client, callback) {
            var nextId;
            var sql = 'SELECT MAX(id) FROM users';
            query(sql, [], function (err, result) {
                nextId = result.rows[0]['max'];
                nextId = (nextId == null) ? 1 : (nextId + 1);

                var hashedPassword = passwordHash.generate(password);
                query('SELECT COUNT(*) count FROM users WHERE lower(username) = lower($1)', [username],
                    function (err, data) {
                        if (err) return callback(err);
                        assert(data.rows.length === 1);
                        if (data.rows[0].count > 0) { return callback('USERNAME_TAKEN'); }

                        var sql = "SELECT MAX(path) FROM users WHERE path LIKE '___'";
                        query(sql, [], function (err, data) {
                            var max_path = lib.calculateNextPath(data.rows[0]['max']);
                            client.query('INSERT INTO users(username, email, password, ref_id, userclass, path, demo, can_chat, playing, id, did_ref_deposit) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
                                [username, '', hashedPassword, '', 'user', max_path, false, true, false, nextId, true],
                                function (err, data) {
                                    if (err) {
                                        if (err.code === '23505') { return callback('USERNAME_TAKEN'); } else { return callback(err); }
                                    }

                                    return callback(null);
                                });
                        });
                    });
            });
        }, callback);
};

/** ======================= BEGIN EXCHANGE SITE API ======================= **/
exports.getUserInfoById_api = function (userid, callback) {
    assert(userid && callback);
    query('SELECT * FROM users WHERE id = $1', [userid], function (err, result) {
        if (err) return callback(err);
        return callback(null, result.rows);
    });
};

exports.getUserInfoByUsername_api = function (username, callback) {
    assert(username && callback);
    query('SELECT * FROM users WHERE lower(username) = lower($1)', [username], function (err, result) {
        if (err) return callback(err);
        return callback(null, result.rows);
    });
};

exports.updateBalance_api = function (userid, amount, fee, callback) {
    getClient(
        function (client, callback) {
            assert(userid && amount && callback);

            var sql_withdraw = 'INSERT INTO fundings (user_id, amount, fee, description, baseunit, currency) VALUES ($1, $2, $3, $4, $5, $6)';
            var sql_deposit = 'INSERT INTO fundings (user_id, amount, fee, description, baseunit, currency) VALUES ($1, $2, $3, $4, $5, $6)';
            var sql = sql_deposit;
            var description = 'OTC Deposit';
            var baseunit = amount / 10000.0;
            var currency = 'USD';
            if (amount < 0) {
                sql = sql_withdraw;
                description = 'OTC Withdraw';
            }

            client.query(sql, [userid, amount, fee, description, baseunit, currency], function (err, result) {
                if (err) return callback(err);

                var amount_fee = amount - fee;
                client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2', [amount_fee, userid], function (err) {
                    if (err) {
                        console.log('error', 'api - update_balance_database - user_id:' + userid + '   amount:' + amount + '   error:' + err);
                        lib.log('error', 'api - update_balance_database - user_id:' + userid + '   amount:' + amount + '   error:' + err);
                        return callback(err);
                    }
                    console.log('success', 'api - update_balance_database - user_id:' + userid + '   amount:' + amount);
                    lib.log('success', 'api - update_balance_database - user_id:' + userid + '   amount:' + amount);

                    if (fee > 0) {
                        getClient(function (client, callback) {
                            client.query("UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE username = 'madabit'", [fee], function (err) {
                                if (err) {
                                    console.log('error', 'api - increase_company_balance - error');
                                    lib.log('error', 'api - increase_company_balance');
                                    return callback(err);
                                }
                                console.log('success', 'api - increase_company_balance - success');
                                lib.log('success', 'api - increase_company_balance');

                                return callback(null, true);
                            });
                        }, callback);
                    } else {
                        return callback(null, true);
                    }
                });
            });
        }
        , callback);
};

exports.getCompanyBalance_api = function (callback) {
    assert(callback);
    query("SELECT * FROM users WHERE username = 'madabit'", function (err, result) {
        if (err) return callback(err);
        return callback(null, result.rows);
    });
};

exports.increaseCompanyBalance_api = function (amount, callback) {
    getClient(function (client, callback) {
        assert(amount && callback);

        client.query("UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE username = 'madabit'", [amount], function (err, result) {
            if (err) {
                console.log('api - increase_company_balance - error');
                lib.log('error', 'api - increase_company_balance');
                return callback(err);
            }

            console.log('api - increase_company_balance - success');
            lib.log('success', 'api - increase_company_balance');

            return callback(null, true);
        });
    }, callback);
};
/** ======================= END EXCHANGE SITE API ======================= **/
/** ======================= BEGIN FUNDING SITE API ======================= **/
/**
 * depsoit from Funding Site(TOPUP888)
 * @param username
 * @param amount
 * @param baseunit
 * @param currency
 * @param callback
 */
exports.depositFromFundingSite_api = function (username, amount, baseunit, currency, callback) {
    lib.log('info', 'db.deposit_from_funding_site_api - [begin]    useranme:' + username + 'amount:' + amount + '   baseunit:' + baseunit + '   currency:' + currency);
    console.log('info', 'db.deposit_from_funding_site_api - [begin]    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
    getClient(function (client, callback) {
        client.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username], function (err, userInfoArray) {
            if (err) {
                lib.log('error', 'db.deposit_from_funding_site_api - get user info   ' + err);
                console.log('error', 'db.deposit_from_funding_site_api - get user info   ' + err);
                return callback(err, false);
            }
            if (userInfoArray.rowCount != 1) {
                lib.log('error', 'db.deposit_from_funding_site_api - NO USER    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
                console.log('error', 'db.deposit_from_funding_site_api - NO USER    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
                return callback('NO USER', false);
            }
            var userInfo = userInfoArray.rows[0];

            client.query('INSERT INTO fundings (user_id, amount, fee, description, baseunit, currency) VALUES($1, $2, $3, $4, $5, $6)',
                [userInfo.id, amount, 0, 'TOPUP Deposit', baseunit, currency], function (err, result) {
                    if (err) {
                        lib.log('error', 'db.deposit_from_funding_site_api - insert funding info   ' + err);
                        console.log('error', 'db.deposit_from_funding_site_api - insert funding info   ' + err);
                        return callback(err, false);
                    }

                    if (result.rowCount != 1) {
                        lib.log('error', 'db.deposit_from_funding_site_api - DEPOSIT FAILED    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
                        console.log('error', 'db.deposit_from_funding_site_api - DEPOSIT FAILED    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
                        return callback('DEPOSIT FAILED', false);
                    }

                    client.query('UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2', [amount, userInfo.id], function (err, result) {
                        if (err) {
                            lib.log('error', 'db.deposit_from_funding_site_api - update  user balance   ' + err);
                            console.log('error', 'db.deposit_from_funding_site_api - update user balance   ' + err);
                            return callback(err, false);
                        }
                        lib.log('info', 'db.deposit_from_funding_site_api - [end]    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
                        console.log('info', 'db.deposit_from_funding_site_api - [end]    useranme:' + username + '   baseunit:' + baseunit + '   currency:' + currency);
                        return callback(null, true);
                    });
                });
        });
    }, callback);
};
/** ======================= END FUNDING SITE API ======================= **/
/* ========================= FOR TESTING ...=========================== */
function resetBalance (client, userId, startTime, prevData, callback) {
    client.query('UPDATE users SET balance_satoshis = balance_satoshis WHERE id = $1', [userId], function (err, result) {
        if (err) return callback(err);

        var resultMap = {};
        var current_time = new Date();

        resultMap['user_id'] = userId;
        resultMap['current_time'] = current_time.getTime() - startTime;

        console.log('db - reset_balance');
        lib.log('info', 'db - reset_balance');
        return callback(null, resultMap);
    });
}

function resetBalance_waterfall (client, userId, startTime, prevData, callback) {
    client.query('UPDATE users SET balance_satoshis = balance_satoshis WHERE id = $1', [userId], function (err, result) {
        if (err) return callback(err);

        var resultMap = {};
        var current_time = new Date();

        resultMap['user_id'] = userId;
        resultMap['current_time'] = current_time.getTime() - startTime;

        console.log('db - reset_balance_waterfall');
        lib.log('info', 'db - reset_balance_waterfall');

        if (typeof prevData === 'function') { prevData(null, resultMap); }
        return callback(null, resultMap);
    });
}

function resetBalanceUsername (client, playerId, username, startTime, prevData, callback) {
    client.query('UPDATE users SET balance_satoshis = balance_satoshis WHERE username = $1', [username], function (err, result) {
        if (err) return callback(err);

        var resultMap = {};
        var current_time = new Date();

        resultMap['user_id'] = username;
        resultMap['current_time'] = current_time.getTime() - startTime;

        console.log('db - reset_balance_username');
        lib.log('info', 'db - reset_balance_username');

        if (typeof prevData === 'function') { prevData(null, resultMap); }
        return callback(null, resultMap);
    });
}

function resetBalanceUsername_waterfall (client, playerId, username, startTime, prevData, callback) {
    client.query('UPDATE users SET balance_satoshis = balance_satoshis WHERE username = $1', [username], function (err, result) {
        if (err) return callback(err);

        var resultMap = {};
        var current_time = new Date();

        resultMap['user_id'] = username;
        resultMap['current_time'] = current_time.getTime() - startTime;

        console.log('db - reset_balance_username_waterfall');
        lib.log('info', 'db - reset_balance_username_waterfall');

        return callback(null, resultMap);
    });
}

exports.testRollback = function (callback) {
    console.log('= testRollback BEGIN');
    getClient(function (client, callback) {
        var tasks = [];
        query('SELECT * FROM users WHERE id > 4 ORDER BY id', function (err, result_player) {
            if (err) return callback(err);
            var playerList = result_player.rows;
            var current_date = new Date();
            playerList.forEach(function (playerInfo, index) {
                tasks.push(function (callback) {
                    resetBalance(client, playerInfo['id'], current_date.getTime(), callback);
                });
                tasks.push(function (callback) {
                    resetBalanceUsername(client, playerInfo['id'], 'madabit', current_date.getTime(), callback);
                });
                tasks.push(function (callback) {
                    resetBalanceUsername(client, playerInfo['id'], 'staff', current_date.getTime(), callback);
                });

                if (playerInfo.master_ib != null) {
                    tasks.push(function (callback) {
                        resetBalanceUsername(client, playerInfo['id'], playerInfo.master_ib, current_date.getTime(), callback);
                    });
                }
                if (playerInfo.parent1 != null) {
                    tasks.push(function (callback) {
                        resetBalanceUsername(client, playerInfo['id'], playerInfo.parent1, current_date.getTime(), callback);
                    });
                }
                if (playerInfo.parent2 != null) {
                    tasks.push(function (callback) {
                        resetBalanceUsername(client, playerInfo['id'], playerInfo.parent2, current_date.getTime(), callback);
                    });
                }
                if (playerInfo.parent3 != null) {
                    tasks.push(function (callback) {
                        resetBalanceUsername(client, playerInfo['id'], playerInfo.parent3, current_date.getTime(), callback);
                    });
                }
            });

            console.log('= async.series BEGIN');
            async.series(tasks, function (err, result) {
                if (err) callback(err);

                console.log('= async.series END');
                console.log('= testRollback END');
                return callback(null);
            });
            // console.log("= async.waterfall BEGIN");
            // async.waterfall(tasks, function(err, result) {
            //     if(err) callback(err);
            //
            //     console.log("= async.waterfall END");
            //     console.log("= testRollback END");
            //     return callback(null);
            // });
        });
    }, callback);
};

exports.testRollback_waterfall = function (callback) {
    console.log('= testRollback BEGIN');
    getClient(function (client, callback) {
        var tasks = [];
        query('SELECT * FROM users WHERE id > 4 ORDER BY id', function (err, result_player) {
            if (err) return callback(err);
            var playerList = result_player.rows;
            var current_date = new Date();
            playerList.forEach(function (playerInfo, index) {
                tasks.push(function (prevData, callback) {
                    resetBalance_waterfall(client, playerInfo['id'], current_date.getTime(), prevData, callback);
                });
                tasks.push(function (prevData, callback) {
                    resetBalanceUsername(client, playerInfo['id'], 'madabit', current_date.getTime(), prevData, callback);
                });

                if (playerInfo.master_ib != null) {
                    tasks.push(function (prevData, callback) {
                        resetBalanceUsername_waterfall(client, playerInfo['id'], playerInfo.master_ib, current_date.getTime(), prevData, callback);
                    });
                }
                if (playerInfo.parent1 != null) {
                    tasks.push(function (prevData, callback) {
                        resetBalanceUsername_waterfall(client, playerInfo['id'], playerInfo.parent1, current_date.getTime(), prevData, callback);
                    });
                }
                if (playerInfo.parent2 != null) {
                    tasks.push(function (prevData, callback) {
                        resetBalanceUsername_waterfall(client, playerInfo['id'], playerInfo.parent2, current_date.getTime(), prevData, callback);
                    });
                }
                if (playerInfo.parent3 != null) {
                    tasks.push(function (prevData, callback) {
                        resetBalanceUsername_waterfall(client, playerInfo['id'], playerInfo.parent3, current_date.getTime(), prevData, callback);
                    });
                }
            });

            console.log('= async.series BEGIN');
            // async.series(tasks, function(err, result) {
            //     if(err) callback(err);
            //
            //     console.log("= async.series END");
            //     console.log("= testRollback END");
            //     return callback(null);
            // });
            // console.log("= async.waterfall BEGIN");
            async.waterfall(tasks, function (err, result) {
                if (err) callback(err);

                console.log('= async.waterfall END');
                console.log('= testRollback END');
                return callback(null);
            });
        });
    }, callback);
};
/* ============================================================================================================= */
/**
 * Get admin setting information
 * @author Bio
 * @param callback
 */
exports.getSettings = function (callback) {
    var sql = 'SELECT * FROM common;';
    query(sql, function (e, r) {
        if (e) return callback(e);

        var result = {};
        r.rows.forEach(function (setting) {
            result[setting.strkey] = setting.strvalue;
        });

        var agent_percent_parent1 = (result.agent_percent_parent1 !== null && result.agent_percent_parent1 !== undefined) ? parseFloat(result.agent_percent_parent1) : 0;
        var agent_percent_parent2 = (result.agent_percent_parent2 !== null && result.agent_percent_parent2 !== undefined) ? parseFloat(result.agent_percent_parent2) : 0;
        var agent_percent_parent3 = (result.agent_percent_parent3 !== null && result.agent_percent_parent3 !== undefined) ? parseFloat(result.agent_percent_parent3) : 0;
        var agent_percent_masterib = (result.agent_percent_masterib !== null && result.agent_percent_masterib !== undefined) ? parseFloat(result.agent_percent_masterib) : 0;
        var agent_percent_agent = (result.agent_percent_agent !== null && result.agent_percent_agent !== undefined) ? parseFloat(result.agent_percent_agent) : 0;
        var agent_percent_company = (result.agent_percent_company !== null && result.agent_percent_company !== undefined) ? parseFloat(result.agent_percent_company) : 0;
        var agent_percent_staff = (result.agent_percent_staff !== null && result.agent_percent_company !== undefined) ? parseFloat(result.agent_percent_staff) : 0;
        var agent_percent_max_profit = (result.agent_percent_max_profit !== null && result.agent_percent_max_profit !== undefined) ? parseFloat(result.agent_percent_max_profit) : 0;
        result.agentProfitPercents = {
            'agent_percent_parent1': agent_percent_parent1,
            'agent_percent_parent2': agent_percent_parent2,
            'agent_percent_parent3': agent_percent_parent3,
            'agent_percent_masterib': agent_percent_masterib,
            'agent_percent_agent': agent_percent_agent,
            'agent_percent_company': agent_percent_company,
            'agent_percent_staff': agent_percent_staff,
            'agent_percent_max_profit': agent_percent_max_profit
        };

        result.withdrawable_bet_amount = (result.withdrawable_bet_amount !== null && result.withdrawable_bet_amount !== undefined) ? parseInt(result.withdrawable_bet_amount) : 0;
        result.minimum_deposit_amount_for_withdrawal = (result.minimum_deposit_amount_for_withdrawal !== null && result.minimum_deposit_amount_for_withdrawal !== undefined) ? parseInt(result.minimum_deposit_amount_for_withdrawal) : 0;
        result.first_deposit_percent = (result.first_deposit_percent !== null && result.first_deposit_percent !== undefined) ? parseFloat(result.first_deposit_percent) : 0;
        result.first_deposit_multiplier = (result.first_deposit_multiplier !== null && result.first_deposit_multiplier !== undefined) ? parseInt(result.first_deposit_multiplier) : 0;

        result.min_bet_amount = (result.min_bet_amount !== null && result.min_bet_amount !== undefined) ? parseInt(result.min_bet_amount) : 1;
        result.max_bet_amount = (result.max_bet_amount !== null && result.max_bet_amount !== undefined) ? parseInt(result.max_bet_amount) : 100000000;

        result.min_extra_bet_amount = (result.min_extra_bet_amount !== null && result.min_extra_bet_amount !== undefined) ? parseInt(result.min_extra_bet_amount) : 1;
        result.max_extra_bet_amount = (result.max_extra_bet_amount !== null && result.max_extra_bet_amount !== undefined) ? parseInt(result.max_extra_bet_amount) : 100000000;
        result.extrabet_multiplier = (result.extrabet_multiplier !== null && result.extrabet_multiplier !== undefined) ? parseInt(result.extrabet_multiplier) : 50;

        result.min_range_bet_amount = (result.min_range_bet_amount !== null && result.min_range_bet_amount !== undefined) ? parseInt(result.min_range_bet_amount) : 1;
        result.max_range_bet_amount = (result.max_range_bet_amount !== null && result.max_range_bet_amount !== undefined) ? parseInt(result.max_range_bet_amount) : 100000000;
        result.tipfee = (result.tipfee !== null && result.tipfee !== undefined) ? parseFloat(result.tipfee) : 1;
        result.min_transfer_amount = (result.min_transfer_amount !== null && result.min_transfer_amount !== undefined) ? parseInt(result.min_transfer_amount) : 1;
        result.max_transfer_amount = (result.max_transfer_amount !== null && result.max_transfer_amount !== undefined) ? parseInt(result.max_transfer_amount) : 100000000;
        result.max_tipfee_amount = (result.max_tipfee_amount !== null && result.max_tipfee_amount !== undefined) ? parseInt(result.max_tipfee_amount) : 500;
        result.max_profit = (result.max_profit !== null && result.max_profit !== undefined) ? parseFloat(result.max_profit) : 3;
        result.to_be_agent_deposit_multiplier = (result.to_be_agent_deposit_multiplier !== null && result.to_be_agent_deposit_multiplier !== undefined) ? parseFloat(result.to_be_agent_deposit_multiplier) : 0;
        result.to_be_agent_client_count = (result.to_be_agent_client_count !== null && result.to_be_agent_client_count !== undefined) ? parseFloat(result.to_be_agent_client_count) : 5;
        result.company_mail = (result.company_mail !== null && result.company_mail !== undefined) ? result.company_mail : '';
        result.company_password = (result.company_password !== null && result.company_password !== undefined) ? result.company_password : '';
        result.bet_mode = (result.bet_mode !== null && result.bet_mode !== undefined) ? result.bet_mode : 'auto_bet';
        result.bet_mode_mobile = (result.bet_mode_mobile !== null && result.bet_mode_mobile !== undefined) ? result.bet_mode_mobile : 'custom_hide';
        result.show_hash = (result.show_hash !== null && result.show_hash !== undefined) ? result.show_hash : 'hide_hash';
        result.no_commission_from = (result.no_commission_from !== null && result.no_commission_from !== undefined) ? parseFloat(result.no_commission_from) : 1;
        result.no_commission_to = (result.no_commission_to !== null && result.no_commission_to !== undefined) ? parseFloat(result.no_commission_to) : 1.5;
        result.welcome_free_bit = (result.welcome_free_bit !== null && result.welcome_free_bit !== undefined) ? parseInt(result.welcome_free_bit) / 100 : 0;
        result.welcome_bits_multiplier = (result.welcome_bits_multiplier !== null && result.welcome_bits_multiplier !== undefined) ? parseInt(result.welcome_bits_multiplier) : 1;
        result.collect_free_days = (result.collect_free_days !== null && result.collect_free_days !== undefined) ? parseInt(result.collect_free_days) : 30;
        result.eth_address = (result.eth_address !== null && result.eth_address !== undefined) ? result.eth_address : '';
        result.eth_password = (result.eth_password !== null && result.eth_password !== undefined) ? result.eth_password : '';
        result.add_gaming_pool = (result.add_gaming_pool !== null && result.add_gaming_pool !== undefined) ? parseInt(result.add_gaming_pool) / 100 : 0;
        result.contactus_email = (result.contactus_email !== null && result.contactus_email !== undefined) ? result.contactus_email : '';

        return callback(null, result);
    });
};

/**
 * Get First and Last Game Info
 * @author Bio
 * @since 2018.5.5
 * @param callback
 * @return [{last}, {last-1}, {last-2}, {first}, {first+1}]
 */
exports.getFirstLastGameInfo = function (time_zone_name, callback) {
    var sql = "(SELECT id, game_crash, created at time zone '" + time_zone_name + "' AS created, ended FROM games ORDER BY id DESC LIMIT 2)\n" +
                'UNION ALL\n' +
                "(SELECT id, game_crash, created at time zone '" + time_zone_name + "' AS created, ended FROM games ORDER BY id ASC LIMIT 1)";
    query(sql, function (err, result) {
        if (err) { return callback(err); }
        return callback(err, result.rows);
    });
};

/**
 * Increase the amount of GPs using tokens
 * @author  pichmuy
 * @param   target      target tokens address GPs of which should be inceased
 * @param   amount      the amount of tokens transferred
 * @param   callback    takes (error, result)
 */
exports.tokenDeposit = function (target, amount, madabit_address_otcmode, callback) {
    var baseunit = amount;
    amount = parseInt(parseFloat(baseunit) * 1000);
    var sql = 'SELECT * FROM users WHERE token_address=$1';
    query(sql, [target], function (err, user_info) {
        if (err) { return callback(err); }

        if (user_info.rowCount === 0) { return callback('No such mdc account in madabit.com'); }

        user_info = user_info.rows[0];

        sql = 'INSERT INTO fundings (user_id, amount, description, baseunit,  currency) VALUES($1, $2, $3, $4, $5)';
        query(sql, [user_info.id, amount, 'MDC Deposit', baseunit, 'MDC'], function (err) {
            if (err) { return callback(err); }
            sql = 'UPDATE users SET balance_satoshis=balance_satoshis+$1 WHERE id=$2';
            query(sql, [amount, user_info.id], function (error) {
                if (error) return callback(error);
                else {
                    var formData = {};
                    formData['source'] = target;
                    formData['taraget'] = madabit_address_otcmode;
                    formData['amount'] = amount;
                    remoteQuery(formData, 'transferToken', callback);
                }
            });
        });
    });
};

var URI = 'http://localhost:8080/api/';
function remoteQuery (formData, route, callback) {
    var uri = URI + route;

    console.log('remoteQuery call: ', formData);

    // formData.username = USERNAME;
    // formData.password = PASSWORD;
    var formData = querystring.stringify(formData);

    var contentLength = formData.length;

    request({
        headers: {
            'Content-Length': contentLength,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        uri: uri,
        body: formData,
        method: 'POST'
    }, function (err, res_api, body) {
        if (err) {
            console.log('err-code', err.message);
            return callback(err, body);
        }
        console.log('API Test : ', body);
        try {
            console.log('remoteQuery : try', body);
            return callback(null, JSON.parse(body));
        } catch (e) {
            console.log('remoteQuery : catch', body);
            return callback(null, {status: 'failed', msg: 'JSON parse exception'});
        }
    });
}

exports.updateMDC = function (address, balance, callback) {
    lib.log('info', 'db.updateMDC [begin] -   address:' + address + '   balance:' + balance);
    console.log('info', 'db.updateMDC [begin] - address' + address + '    balance:' + balance);

    lib.log('info', 'db.updateMDC  -  select begin');
    console.log('info', 'db.updateMDC  - select begin');
    var sql = 'SELECT * FROM users WHERE token_address = $1';
    query(sql, [address], function (err, user_info) {
        if (err) {
            lib.log('error', 'db.updateMDC - ' + err);
            console.log('error', 'db.updateMDC - ' + err);
            return callback(err);
        }

        lib.log('info', 'db.updateMDC  -  select end');
        console.log('info', 'db.updateMDC  - select end');

        if (user_info.rows.length == 0) {
            lib.log('error', 'db.updateMDC - ' + err);
            console.log('error', 'db.updateMDC - no user ' + err);
            return callback('no_user');
        }

        user_info = user_info.rows[0];

        var amount = parseInt(balance * 1000);

        lib.log('info', 'db.updateMDC  -  insert into fundings begin');
        console.log('info', 'db.updateMDC  - insert into fundings begin');

        sql = 'INSERT INTO fundings (user_id, amount, description, baseunit,  currency) VALUES($1, $2, $3, $4, $5)';
        query(sql, [user_info.id, amount, 'MDC Deposit', balance, 'MDC'], function (err) {
            if (err) {
                lib.log('error', 'db.updateMDC - insert into fundings end' + err);
                console.log('error', 'db.updateMDC - insert into fundings end' + err);
                return callback(err);
            }

            lib.log('info', 'db.updateMDC  -  insert into fundings end');
            console.log('info', 'db.updateMDC  - insert into fundings end');

            lib.log('info', 'db.updateMDC  -  update users balance begin');
            console.log('info', 'db.updateMDC  - update users balance begin');

            sql = 'UPDATE users SET balance_satoshis=balance_satoshis + $1 WHERE id=$2';
            query(sql, [amount, user_info.id], function (err, res) {
                if (err) {
                    lib.log('error', 'db.updateMDC - update users balance  end  ' + err);
                    console.log('error', 'db.updateMDC - update users balance  end  ' + err);
                    return callback(err);
                }

                lib.log('info', 'db.updateMDC  -  update users balance end');
                console.log('info', 'db.updateMDC  - update users balance end');

                lib.log('info', 'db.updateMDC [end] -   address:' + address + '   balance:' + balance);
                console.log('info', 'db.updateMDC [end] - address' + address + '    balance:' + balance);
                return callback(null);
                //
                // if (res.rowCount === 0)
                //     return callback('no_user');
                // else {
                //     sql = "UPDATE users SET balance_satoshis=balance_satoshis+$1 WHERE username='madabit'";
                //     query(sql, [amount], function (err) {
                //         if (err) return callback(err);
                //         return callback(null);
                //     });
                // }
            });
        });
    });
};

/**
 * Get Common Setting With Key
 * @author Bio
 * @since 2018.7.6
 * @param param.strkey
 * @return {strkey, strvalue}
 */
exports.getCommonSettingWithKey = function (param, callback) {
    var sql = 'SELECT * FROM common WHERE strkey = $1';
    query(sql, [param.strkey], function (err, result) {
        if (err) return callback(err);
        if (result.length == 0) {
            result = {};
            result.strkey = param.strkey;
            result.strvalue = '0';
        } else {
            result = result.rows[0];
        }
        return callback(null, result);
    });
};
