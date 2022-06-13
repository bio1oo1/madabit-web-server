
var nodemailer = require('nodemailer');
var config = require('../config/config');
var database = require('./database');

var SITE_URL = config.SITE_URL;

// function send(details, callback) {
//     assert(details, callback);
//
//     var transport = nodemailer.createTransport(sesTransport({
//         AWSAccessKeyID: config.AWS_SES_KEY,
//         AWSSecretKey: config.AWS_SES_SECRET
//     }));
//
//     transport.sendMail(details, function(err) {
//         if (err)
//             return callback(err);
//
//         callback(null);
//     });
// }

/*
 * email send function (in )
 * details object there are all the information about the mail transfer
 * source address can be get from the common table in database
 */
function send (details, callback) {
    // nodemailer.createTestAccount((err, account) => {
    // console.log("\n  Now in the nodemailer.createTestAccount function.");
    // console.log("\n  Error\n" + err);
    // console.log("\n  Account information");
    // console.log(account);
    // if (err) {
    //     console.error('\n  Failed to create a testing account. ' + err.message);
    //     return callback(err);
    // }

    // console.log('\n  Credentials obtained, sending message...');
    var user, pass, service;
    database.getCompanyMail(function (err, res) {
        if (err) return callback(err);
        user = res;
        service = res.substr(res.indexOf('@') + 1);
        service = service.substr(0, service.indexOf('.'));

        database.getCompanyPassword(function (err, result) {
            pass = result;

            // Create a SMTP transporter object
            let transporter = nodemailer.createTransport({
                // host: account.smtp.host,
                // port: account.smtp.port,
                // secure: account.smtp.secure,
                service: service,
                auth: {
                    user: user,
                    pass: pass
                }
            });

            // Message object
            let message = {
                from: 'Madabit Center',
                to: details.to,
                subject: 'Support Message',
                html: details.html
            };

            transporter.sendMail(message, (err, info) => {
                if (err) {
                    console.log('\n  Error occurred. ' + err.message);
                    return callback(err);
                }

                // console.log('\n  Message Info');
                // console.log(info);
                // console.log("\n\n");
                // console.log('Message sent: %s', info.messageId);
                // // Preview only available when sending through an Ethereal account
                // console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
                callback(null);
            });
        });
    });
    // });
};

/*
 * make a email transfer object with input parameters and send mail function
 */
exports.contact = function (to, content, callback) {
    content = content.split('\r\n').join('<br>');
    var details = {
        to: to,
        from: 'p.chakra115@outlook.com',
        html: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
        '<html xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' +
        '<title>Madabit</title>' +
        '</head>' +
        '<body>' +
        '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="e4e4e4"><tr><td> <table id="top-message" cellpadding="20" cellspacing="0" width="600" align="center"> <tr> <td></td> </tr> </table> <table id="main" width="600" align="center" cellpadding="0" cellspacing="15" bgcolor="ffffff"> <tr> <td> <table id="content-1" cellpadding="0" cellspacing="0" align="center"> <tr> <td width="570" valign="top"> <table cellpadding="5" cellspacing="0"> <div style="background-color:#000;"> <div style="text-align:center;margin-left: 230"> </div> </div> </td> </tr> </table> </td> </tr> <tr> <td> <table id="content-6" cellpadding="0" cellspacing="0"> <p> ' + content + ' </p> </table> </td> </tr> </table> </td></tr></table></td></tr></table>' +
        '</body></html>'
    };
    send(details, function (err) {
        if (err) return callback(err);
        else { return callback(null); }
    });
};

/*
 * make a email transfer object with input parameters and send mail function
 */
exports.contactus = function (userEmail, name, content, callback) {
    database.getContactUsEmail(function (err, contactus_email) {
        if (err) return callback(err);
        if (contactus_email === '') return callback('NO_CONTACTUS_EMAIL');

        content = content.split('\r\n').join('<br>');

        var html = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>\n' +
            '    <!--[if gte mso 9]><xml>\n' +
            '     <o:OfficeDocumentSettings>\n' +
            '      <o:AllowPNG/>\n' +
            '      <o:PixelsPerInch>96</o:PixelsPerInch>\n' +
            '     </o:OfficeDocumentSettings>\n' +
            '    </xml><![endif]-->\n' +
            '    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n' +
            '    <meta name="viewport" content="width=device-width">\n' +
            '    <!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->\n' +
            '    <title></title>\n' +
            '    \n' +
            '    \n' +
            '    <style type="text/css" id="media-query">\n' +
            '      body {\n' +
            '  margin: 0;\n' +
            '  padding: 0; }\n' +
            '\n' +
            'table, tr, td {\n' +
            '  vertical-align: top;\n' +
            '  border-collapse: collapse; }\n' +
            '\n' +
            '.ie-browser table, .mso-container table {\n' +
            '  table-layout: fixed; }\n' +
            '\n' +
            '* {\n' +
            '  line-height: inherit; }\n' +
            '\n' +
            'a[x-apple-data-detectors=true] {\n' +
            '  color: inherit !important;\n' +
            '  text-decoration: none !important; }\n' +
            '\n' +
            '[owa] .img-container div, [owa] .img-container button {\n' +
            '  display: block !important; }\n' +
            '\n' +
            '[owa] .fullwidth button {\n' +
            '  width: 100% !important; }\n' +
            '\n' +
            '[owa] .block-grid .col {\n' +
            '  display: table-cell;\n' +
            '  float: none !important;\n' +
            '  vertical-align: top; }\n' +
            '\n' +
            '.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {\n' +
            '  width: 480px !important; }\n' +
            '\n' +
            '.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {\n' +
            '  line-height: 100%; }\n' +
            '\n' +
            '.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {\n' +
            '  width: 160px !important; }\n' +
            '\n' +
            '.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {\n' +
            '  width: 320px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {\n' +
            '  width: 240px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {\n' +
            '  width: 160px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {\n' +
            '  width: 120px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {\n' +
            '  width: 96px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {\n' +
            '  width: 80px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {\n' +
            '  width: 68px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {\n' +
            '  width: 60px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {\n' +
            '  width: 53px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {\n' +
            '  width: 48px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {\n' +
            '  width: 43px !important; }\n' +
            '\n' +
            '.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {\n' +
            '  width: 40px !important; }\n' +
            '\n' +
            '@media only screen and (min-width: 500px) {\n' +
            '  .block-grid {\n' +
            '    width: 480px !important; }\n' +
            '  .block-grid .col {\n' +
            '    vertical-align: top; }\n' +
            '    .block-grid .col.num12 {\n' +
            '      width: 480px !important; }\n' +
            '  .block-grid.mixed-two-up .col.num4 {\n' +
            '    width: 160px !important; }\n' +
            '  .block-grid.mixed-two-up .col.num8 {\n' +
            '    width: 320px !important; }\n' +
            '  .block-grid.two-up .col {\n' +
            '    width: 240px !important; }\n' +
            '  .block-grid.three-up .col {\n' +
            '    width: 160px !important; }\n' +
            '  .block-grid.four-up .col {\n' +
            '    width: 120px !important; }\n' +
            '  .block-grid.five-up .col {\n' +
            '    width: 96px !important; }\n' +
            '  .block-grid.six-up .col {\n' +
            '    width: 80px !important; }\n' +
            '  .block-grid.seven-up .col {\n' +
            '    width: 68px !important; }\n' +
            '  .block-grid.eight-up .col {\n' +
            '    width: 60px !important; }\n' +
            '  .block-grid.nine-up .col {\n' +
            '    width: 53px !important; }\n' +
            '  .block-grid.ten-up .col {\n' +
            '    width: 48px !important; }\n' +
            '  .block-grid.eleven-up .col {\n' +
            '    width: 43px !important; }\n' +
            '  .block-grid.twelve-up .col {\n' +
            '    width: 40px !important; } }\n' +
            '\n' +
            '@media (max-width: 500px) {\n' +
            '  .block-grid, .col {\n' +
            '    min-width: 320px !important;\n' +
            '    max-width: 100% !important;\n' +
            '    display: block !important; }\n' +
            '  .block-grid {\n' +
            '    width: calc(100% - 40px) !important; }\n' +
            '  .col {\n' +
            '    width: 100% !important; }\n' +
            '    .col > div {\n' +
            '      margin: 0 auto; }\n' +
            '  img.fullwidth, img.fullwidthOnMobile {\n' +
            '    max-width: 100% !important; }\n' +
            '  .no-stack .col {\n' +
            '    min-width: 0 !important;\n' +
            '    display: table-cell !important; }\n' +
            '  .no-stack.two-up .col {\n' +
            '    width: 50% !important; }\n' +
            '  .no-stack.mixed-two-up .col.num4 {\n' +
            '    width: 33% !important; }\n' +
            '  .no-stack.mixed-two-up .col.num8 {\n' +
            '    width: 66% !important; }\n' +
            '  .no-stack.three-up .col.num4 {\n' +
            '    width: 33% !important; }\n' +
            '  .no-stack.four-up .col.num3 {\n' +
            '    width: 25% !important; }\n' +
            '  .mobile_hide {\n' +
            '    min-height: 0px;\n' +
            '    max-height: 0px;\n' +
            '    max-width: 0px;\n' +
            '    display: none;\n' +
            '    overflow: hidden;\n' +
            '    font-size: 0px; } }\n' +
            '\n' +
            '    </style>\n' +
            '</head>\n' +
            '<body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: #FFFFFF">\n' +
            '  <style type="text/css" id="media-query-bodytag">\n' +
            '    @media (max-width: 520px) {\n' +
            '      .block-grid {\n' +
            '        min-width: 320px!important;\n' +
            '        max-width: 100%!important;\n' +
            '        width: 100%!important;\n' +
            '        display: block!important;\n' +
            '      }\n' +
            '\n' +
            '      .col {\n' +
            '        min-width: 320px!important;\n' +
            '        max-width: 100%!important;\n' +
            '        width: 100%!important;\n' +
            '        display: block!important;\n' +
            '      }\n' +
            '\n' +
            '        .col > div {\n' +
            '          margin: 0 auto;\n' +
            '        }\n' +
            '\n' +
            '      img.fullwidth {\n' +
            '        max-width: 100%!important;\n' +
            '      }\n' +
            '\t\t\timg.fullwidthOnMobile {\n' +
            '        max-width: 100%!important;\n' +
            '      }\n' +
            '      .no-stack .col {\n' +
            '\t\t\t\tmin-width: 0!important;\n' +
            '\t\t\t\tdisplay: table-cell!important;\n' +
            '\t\t\t}\n' +
            '\t\t\t.no-stack.two-up .col {\n' +
            '\t\t\t\twidth: 50%!important;\n' +
            '\t\t\t}\n' +
            '\t\t\t.no-stack.mixed-two-up .col.num4 {\n' +
            '\t\t\t\twidth: 33%!important;\n' +
            '\t\t\t}\n' +
            '\t\t\t.no-stack.mixed-two-up .col.num8 {\n' +
            '\t\t\t\twidth: 66%!important;\n' +
            '\t\t\t}\n' +
            '\t\t\t.no-stack.three-up .col.num4 {\n' +
            '\t\t\t\twidth: 33%!important;\n' +
            '\t\t\t}\n' +
            '\t\t\t.no-stack.four-up .col.num3 {\n' +
            '\t\t\t\twidth: 25%!important;\n' +
            '\t\t\t}\n' +
            '      .mobile_hide {\n' +
            '        min-height: 0px!important;\n' +
            '        max-height: 0px!important;\n' +
            '        max-width: 0px!important;\n' +
            '        display: none!important;\n' +
            '        overflow: hidden!important;\n' +
            '        font-size: 0px!important;\n' +
            '      }\n' +
            '    }\n' +
            '  </style>\n' +
            '  <!--[if IE]><div class="ie-browser"><![endif]-->\n' +
            '  <!--[if mso]><div class="mso-container"><![endif]-->\n' +
            '  <table class="nl-container" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;min-width: 320px;Margin: 0 auto;background-color: #FFFFFF;width: 100%" cellpadding="0" cellspacing="0">\n' +
            '\t<tbody>\n' +
            '\t<tr style="vertical-align: top">\n' +
            '\t\t<td style="word-break: break-word;border-collapse: collapse !important;vertical-align: top">\n' +
            '    <!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: #FFFFFF;"><![endif]-->\n' +
            '\n' +
            '    <div style="background-color:transparent;">\n' +
            '      <div style="Margin: 0 auto;min-width: 320px;max-width: 480px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid mixed-two-up ">\n' +
            '        <div style="border-collapse: collapse;display: table;width: 100%;background-color:transparent;">\n' +
            '          <!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 480px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]-->\n' +
            '\n' +
            '              <!--[if (mso)|(IE)]><td align="center" width="160" style=" width:160px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]-->\n' +
            '            <div class="col num4" style="display: table-cell;vertical-align: top;max-width: 320px;min-width: 160px;">\n' +
            '              <div style="background-color: transparent; width: 100% !important;">\n' +
            '              <!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]-->\n' +
            '\n' +
            '                  \n' +
            '                    <div class="">\n' +
            '\t<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]-->\n' +
            '\t<div style="color:#555555;line-height:120%;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">\t\n' +
            '\t\t<div style="font-size:12px;line-height:14px;color:#555555;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: left"><strong>Email</strong></p></div>\t\n' +
            '\t</div>\n' +
            '\t<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</div>\n' +
            '                  \n' +
            '              <!--[if (!mso)&(!IE)]><!--></div><!--<![endif]-->\n' +
            '              </div>\n' +
            '            </div>\n' +
            '              <!--[if (mso)|(IE)]></td><td align="center" width="320" style=" width:320px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]-->\n' +
            '            <div class="col num8" style="display: table-cell;vertical-align: top;min-width: 320px;max-width: 320px;">\n' +
            '              <div style="background-color: transparent; width: 100% !important;">\n' +
            '              <!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]-->\n' +
            '\n' +
            '                  \n' +
            '                    <div class="">\n' +
            '\t<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]-->\n' +
            '\t<div style="color:#555555;line-height:120%;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">\t\n' +
            '\t\t<div style="font-size:12px;line-height:14px;color:#555555;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px">' + userEmail + '</p></div>\t\n' +
            '\t</div>\n' +
            '\t<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</div>\n' +
            '                  \n' +
            '              <!--[if (!mso)&(!IE)]><!--></div><!--<![endif]-->\n' +
            '              </div>\n' +
            '            </div>\n' +
            '          <!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]-->\n' +
            '        </div>\n' +
            '      </div>\n' +
            '    </div>    <div style="background-color:transparent;">\n' +
            '      <div style="Margin: 0 auto;min-width: 320px;max-width: 480px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid mixed-two-up ">\n' +
            '        <div style="border-collapse: collapse;display: table;width: 100%;background-color:transparent;">\n' +
            '          <!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 480px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]-->\n' +
            '\n' +
            '              <!--[if (mso)|(IE)]><td align="center" width="160" style=" width:160px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]-->\n' +
            '            <div class="col num4" style="display: table-cell;vertical-align: top;max-width: 320px;min-width: 160px;">\n' +
            '              <div style="background-color: transparent; width: 100% !important;">\n' +
            '              <!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]-->\n' +
            '\n' +
            '                  \n' +
            '                    <div class="">\n' +
            '\t<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]-->\n' +
            '\t<div style="color:#555555;line-height:120%;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">\t\n' +
            '\t\t<div style="font-size:12px;line-height:14px;color:#555555;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: left"><strong>Name</strong></p></div>\t\n' +
            '\t</div>\n' +
            '\t<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</div>\n' +
            '                  \n' +
            '              <!--[if (!mso)&(!IE)]><!--></div><!--<![endif]-->\n' +
            '              </div>\n' +
            '            </div>\n' +
            '              <!--[if (mso)|(IE)]></td><td align="center" width="320" style=" width:320px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]-->\n' +
            '            <div class="col num8" style="display: table-cell;vertical-align: top;min-width: 320px;max-width: 320px;">\n' +
            '              <div style="background-color: transparent; width: 100% !important;">\n' +
            '              <!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]-->\n' +
            '\n' +
            '                  \n' +
            '                    <div class="">\n' +
            '\t<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]-->\n' +
            '\t<div style="color:#555555;line-height:120%;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">\t\n' +
            '\t\t<div style="font-size:12px;line-height:14px;color:#555555;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px">' + name + '</p></div>\t\n' +
            '\t</div>\n' +
            '\t<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</div>\n' +
            '                  \n' +
            '              <!--[if (!mso)&(!IE)]><!--></div><!--<![endif]-->\n' +
            '              </div>\n' +
            '            </div>\n' +
            '          <!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]-->\n' +
            '        </div>\n' +
            '      </div>\n' +
            '    </div>    <div style="background-color:transparent;">\n' +
            '      <div style="Margin: 0 auto;min-width: 320px;max-width: 480px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid ">\n' +
            '        <div style="border-collapse: collapse;display: table;width: 100%;background-color:transparent;">\n' +
            '          <!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 480px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]-->\n' +
            '\n' +
            '              <!--[if (mso)|(IE)]><td align="center" width="480" style=" width:480px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]-->\n' +
            '            <div class="col num12" style="min-width: 320px;max-width: 480px;display: table-cell;vertical-align: top;">\n' +
            '              <div style="background-color: transparent; width: 100% !important;">\n' +
            '              <!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]-->\n' +
            '\n' +
            '                  \n' +
            '                    \n' +
            '<table border="0" cellpadding="0" cellspacing="0" width="100%" class="divider " style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;min-width: 100%;-ms-text-size-adjust: 100%;-webkit-text-size-adjust: 100%">\n' +
            '    <tbody>\n' +
            '        <tr style="vertical-align: top">\n' +
            '            <td class="divider_inner" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top;padding-right: 10px;padding-left: 10px;padding-top: 10px;padding-bottom: 10px;min-width: 100%;mso-line-height-rule: exactly;-ms-text-size-adjust: 100%;-webkit-text-size-adjust: 100%">\n' +
            '                <table class="divider_content" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;border-top: 1px solid #BBBBBB;-ms-text-size-adjust: 100%;-webkit-text-size-adjust: 100%">\n' +
            '                    <tbody>\n' +
            '                        <tr style="vertical-align: top">\n' +
            '                            <td style="word-break: break-word;border-collapse: collapse !important;vertical-align: top;mso-line-height-rule: exactly;-ms-text-size-adjust: 100%;-webkit-text-size-adjust: 100%">\n' +
            '                                <span></span>\n' +
            '                            </td>\n' +
            '                        </tr>\n' +
            '                    </tbody>\n' +
            '                </table>\n' +
            '            </td>\n' +
            '        </tr>\n' +
            '    </tbody>\n' +
            '</table>\n' +
            '                  \n' +
            '                  \n' +
            '                    <div class="">\n' +
            '\t<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]-->\n' +
            '\t<div style="color:#555555;line-height:120%;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">\t\n' +
            '\t\t<div style="font-size:12px;line-height:14px;color:#555555;font-family:Arial, \'Helvetica Neue\', Helvetica, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px">' + content + '</p></div>\t\n' +
            '\t</div>\n' +
            '\t<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</div>\n' +
            '                  \n' +
            '              <!--[if (!mso)&(!IE)]><!--></div><!--<![endif]-->\n' +
            '              </div>\n' +
            '            </div>\n' +
            '          <!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]-->\n' +
            '        </div>\n' +
            '      </div>\n' +
            '    </div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]-->\n' +
            '\t\t</td>\n' +
            '  </tr>\n' +
            '  </tbody>\n' +
            '  </table>\n' +
            '  <!--[if (mso)|(IE)]></div><![endif]-->\n' +
            '\n' +
            '\n' +
            '</body></html>';
        var details = {
            to: contactus_email,
            html: html
        };
        send(details, function (err) {
            if (err) return callback(err, false);
            return callback(null, true);
        });
    });
};

/*
 * this is used for the recovery password using email address
 */
exports.passwordReset = function (to, recoveryList, callback) {
    var htmlRecoveryLinks = '';
    recoveryList.forEach(function (pair, index) {
        htmlRecoveryLinks += '<a href="' + SITE_URL + '/reset/' + pair[1] + '">Please click here to reset ' + pair[0] + "'s account</a><br>";
    });

    var html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
        '<html xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' +
        '<title>MADABIT</title>' +
        '</head>' +
        '<body>' +
        '<h2>Madabit Password recovery</h2>' +
        '<br>' +
         htmlRecoveryLinks +
        '<br>' +
        '<br>' +
        '<span>We only send password resets to registered email accounts.' +
        '</body></html>';

    var details = {
        to: to,
        from: 'p.chakra115@outlook.com',
        subject: 'Madabit - Reset Password Request',
        html: html
    };
    send(details, callback);
};

exports.sendRegVCode = function (to, strVerifyCode, i18n_lang, callback) {
    var str_madabit_verification_code = 'MADABIT Verification Code';
    var str_madabit_verification_code_is = 'MADABIT Verification Code is';
    if(i18n_lang == 'zh') {
        str_madabit_verification_code = 'MADABIT 验证妈';
        str_madabit_verification_code_is = 'MADABIT 验证妈是';
    }

    var html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +

        '<html xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' +
        '<title>' + str_madabit_verification_code + '</title>' +
        '</head>' +
        '<body>' +
        '<h2>' + str_madabit_verification_code_is + '</h2>' +
        '<br>' +
        strVerifyCode +
       '</body></html>';

    var details = {
        to: to,
        from: 'p.chakra115@outlook.cosm',
        subject: str_madabit_verification_code,
        html: html
    };
    send(details, callback);
};

exports.sendWithdrawNotifyMail = function (param, callback) {
    var sms_title = 'MADABIT Withdraw Request';
    var sms_content1 = 'Username : ' + param.username;
    var sms_content2 = 'Currency : ' + param.cointype;
    var sms_content3 = 'Amount : ' + parseInt(param.amount/100.0) + ' Bits';

    var html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +

        '<html xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' +
        '<title>' + sms_title + '</title>' +
        '</head>' +
        '<body>' +
        '<h2>' + sms_title + '</h2>' +
        '<br>' +
        sms_content1 + '<br>' +
        sms_content2 + '<br>' +
        sms_content3 + '<br>' +
        '</body></html>';
    database.getContactUsEmail(function(err, contact_us_email) {
        var details = {
            to: contact_us_email,
            from: 'support@madabit.com',
            subject: sms_title,
            html: html
        };
        send(details, callback);
    });


};
