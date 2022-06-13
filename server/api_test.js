
var querystring = require('querystring');
var request = require('request');

//= ========= BEGIN API TEST ==========

var form = {
    username: 'ex_to_mt_',
    password: 'fuckfuck',
    playername: 'test'
};

var formData = querystring.stringify(form);
var contentLength = formData.length;

request({
    headers: {
        'Content-Length': contentLength,
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    uri: 'http://192.168.1.43/api/getPlayerInfo',
    body: formData,
    method: 'POST'
}, function (err, res_api, body) {
    if (err) {
        console.log('err-code', body);
        return callback(err);
    }
});

//= ========= END API TEST ==========
