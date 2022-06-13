requirejs.config({
    baseUrl: '/scripts', // If no baseUrl is explicitly set in the configuration, the default value will be the location of the HTML page that loads require.js.
    paths: {
        autolinker: '../../node_modules/autolinker/dist/Autolinker',
        classnames: '../../node_modules/classnames/index',
        lodash: '../../node_modules/lodash/index',
        react: '../../node_modules/react/dist/react-with-addons',
        seedrandom: '../../node_modules/seedrandom/seedrandom',
        socketio: '../../node_modules/socket.io-client/socket.io',
        mousetrap: '../../node_modules/mousetrap/mousetrap',
        screenfull: '../../node_modules/screenfull/dist/screenfull'
    },
    shim: {

    }
});

require(['game'], function () {
    var height = null;
    var timer = window.setInterval(is_element_loaded, 10);

    function is_element_loaded () {
        height = $('#id_divRoundNote').height();
        if (height != null) {
            $('#loading-div').hide();
            window.clearTimeout(timer);
            Metronic.init();
            Layout.init();
            jQuery(document).ready(function () {
                var languageCode = document.getElementById('id_hiddenLanguageCode').value;

                $(document).on('click', '#id_linkLogout', function () {
                    if (document.getElementById('logout')) {
                        if (languageCode == 'zh') { bootbox.setDefaults('locale', 'zh_CN'); }
                        bootbox.confirm({
                            size: 'small',
                            message: confirmString,
                            callback: function (result) {
                                if (result) { document.getElementById('logout').submit(); }
                            }
                        });
                    }
                });

                $(document).on('click', '#id_linkLogout_sidebar', function () {
                    if (document.getElementById('logout')) {
                        if (languageCode == 'zh') { bootbox.setDefaults('locale', 'zh_CN'); }
                        bootbox.confirm({
                            size: 'small',
                            message: confirmString,
                            callback: function (result) {
                                if (result) { document.getElementById('logout').submit(); }
                            }
                        });
                    }
                });

                //= ====================== Hash Copy Clipboard =======================
                var clipboard = new ClipboardJS('.hash-copy-cont');

                clipboard.on('success', function (e) {
                    if (languageCode == 'en') {
                        toastr['success']('Copy address completed.');
                    } else {
                        toastr['success']('已经复制好了。');
                    }
                });

                clipboard.on('error', function (e) {
                    if (languageCode == 'en') {
                        toastr['warning']('Copy address failed.');
                    } else {
                        toastr['warning']('failed');
                    }
                });

                $(document).on('click', '.class_liLanguage', function () {
                    var current_url = window.location.href;
                    var language_code;
                    if ($(this).next().hasClass('class_liLanguage')) { language_code = 'en'; } else language_code = 'zh';
                    $('#id_formSetLanguage').find("[name='current_url']").val(current_url);
                    $('#id_formSetLanguage').find("[name='language_code']").val(language_code);
                    $('#id_formSetLanguage').submit();
                });

                $(document).on('click', '#id_btnLanguageSwitch', function () {
                    var current_url = window.location.href;
                    var language_code = ($('#id_hiddenLanguageCode').val() === 'en' ? 'zh' : 'en');
                    $('#id_formSetLanguage').find("[name='current_url']").val(current_url);
                    $('#id_formSetLanguage').find("[name='language_code']").val(language_code);
                    $('#id_formSetLanguage').submit();
                });

                $(document).on('click', '#id_btnLanguageSwitch2', function () {
                    var current_url = window.location.href;
                    var language_code = ($('#id_hiddenLanguageCode').val() === 'en' ? 'zh' : 'en');
                    $('#id_formSetLanguage').find("[name='current_url']").val(current_url);
                    $('#id_formSetLanguage').find("[name='language_code']").val(language_code);
                    $('#id_formSetLanguage').submit();
                });

                var selectedElement;
                var badgeNumber;

                $(document).on('click', '.delete', function () {
                    selectedElement = $(this);
                    var mail_id = $(this).siblings().first().attr('value');

                    $.post('/delete-mail', {id: mail_id}, function (data, status) {
                        if (status === 'success') {
                            selectedElement.parent().remove();
                            badgeNumber = parseInt($('.badge.badge-danger').text()) - 1;
                            if (badgeNumber <= 0) {
                                $('.reply.dropdown-menu').hide();
                                $('#header_inbox_bar').hide();
                            } else {
                                $('.badge.badge-danger').text(badgeNumber);
                                if (languageCode === 'en') {
                                    $('.bold').text((badgeNumber) + ' New');
                                } else if (languageCode === 'zh') {
                                    $('.bold').text((badgeNumber) + '封新');
                                }
                            }
                        } else {
                            console.log('Status: ' + status + '\nData: ' + data);
                        }
                    });
                });

                $('#header_inbox_bar').click(function () {
                    if ($('#header_inbox_bar').hasClass('open')) {
                        return;
                    }
                    $.post('/get-notifications',
                        {id: user.id},
                        function (data, status) {
                            if (status === 'success' && data.result) {
                                user['reply'] = data.result;

                                var replylist = "<li class='external'>";

                                if (languageCode === 'en') { replylist += "<div><span class='bold'>" + user.reply.length + ' New</span> Messages</div>'; } else if (languageCode === 'zh') { replylist += "<div><span class='bold'>" + user.reply.length + '封新</span>信息</div>'; } else { replylist += "<div><span class='bold'>" + user.reply.length + ' New</span> Messages</div>'; }

                                replylist += '</li>';
                                replylist += '<li>';
                                replylist += "<ul class='dropdown-menu-list scroller' data-handle-color='#637283' style='height:250px; overflow: auto;' data-initialized='1'>";

                                user.reply.forEach(function (row) {
                                    replylist += '<li>';
                                    replylist += "<input type='hidden' value='" + row.id + "'/>";
                                    replylist += "<a class='message' style='border:none!important;'>";
                                    if (row.message_to_user.indexOf('welcome_free_bits:') >= 0) {
                                        var welcome_free_bits = row.message_to_user.substr(18);
                                        replylist += '<p>' + strBonusMessage0 + welcome_free_bits;
                                        if (languageCode === 'zh') replylist += '。</p>';
                                        else replylist += '.</p>';
                                    } else if (row.message_to_user.indexOf('tip_transfer:') >= 0) {
                                        var amount = row.message_to_user.split(' ')[0].substr(13);
                                        var from = row.message_to_user.split(' ')[1].substr(5);
                                        replylist += '<p>' + from + strBonusMessage2 + amount + strBonusMessage3 + '</p>';
                                    } else if (row.message_to_user.indexOf('funding_bonus:') >= 0) {
                                        var amount = row.message_to_user.split(' ')[0].substr(14);
                                        var from = row.message_to_user.split(' ')[1].substr(5);
                                        replylist += '<p>' + strBonusMessage6 + from + strBonusMessage7 + amount + strBonusMessage8 + '</p>';
                                    } else if (row.message_to_user.indexOf('login_bonus:') >= 0) {
                                        var amount = row.message_to_user.split(' ')[0].substr(12);
                                        replylist += '<p>' + strBonusMessage4 + amount + strBonusMessage5 + '</p>';
                                    } else {
                                        replylist += '<p>' + row.message_to_user + '</p>';
                                    }
                                    replylist += '</a>';
                                    replylist += "<a class='delete' style='border:none!important;'>";
                                    replylist += "<i class='fas fa-trash-alt'></i>";
                                    replylist += '</a>';
                                    replylist += '</li>';
                                });

                                replylist += '</ul></li>';

                                $('ul.reply').children().remove();
                                $('ul.reply').append(replylist);
                                $('#header_inbox_bar').addClass('open');
                            } else {
                                console.log('***** Error *****');
                                console.log(data.error);
                            }
                        });
                });

                $(document).on('click', '.class_speaker', function () {
                    var bPlay = false;
                    if ($(this).find('img').attr('src') == '/img/speaker_off.svg') {
                        $(this).find('img').attr('src', '/img/speaker_on.svg');
                        bPlay = true;
                    } else {
                        $(this).find('img').attr('src', '/img/speaker_off.svg');
                        bPlay = false;
                    }

                    if ($(this).hasClass('class_speaker_background')) {
                        enableChatMsg = bPlay;
                        var objAutioBackground = document.getElementById('id_audioBackground');
                        if (bPlay == true) {
                            objAutioBackground.play();
                        } else {
                            objAutioBackground.pause();
                            objAutioBackground.currentTime = 0.0;
                        }
                    } else if ($(this).hasClass('class_speaker_chat')) {
                        enableChatMsg = bPlay;
                    } else if ($(this).hasClass('class_speaker_etc')) {
                        enableEtc = bPlay;
                    }
                });
            });
        }
    }
});
