/**
 * This view acts as a wrapper for all the other views in the game
 * it is subscribed to changes in EngineVirtualStore but it only
 * listen to connection changes so every view should subscribe to
 * EngineVirtualStore independently.
 */
define([
    'react',
    'components/TopBar',
    'components/GraphicsContainer',
    'components/ControlsSelector',
    'components/GamesLog',
    'components/Chat',
    'components/Players',
    'components/BetBar',
    'components/GameLogChatSelector',
    'components/Controls',
    'game-logic/engine',
    'game-logic/clib',
    'game-logic/hotkeys',
    'stores/GameSettingsStore'
], function (
    React,
    TopBarClass,
    GraphicsContainerClass,
    ControlsSelectorClass,
    GamesLogClass,
    ChatClass,
    PlayersClass,
    BetBarClass,
    GameLogChatSelectorClass,
    ControlsClass,
    Engine,
    Clib,
    Hotkeys,
    GameSettingsStore
) {
    var TopBar = React.createFactory(TopBarClass);
    var GraphicsContainer = React.createFactory(GraphicsContainerClass);
    var ControlsSelector = React.createFactory(ControlsSelectorClass);

    var GamesLog = React.createFactory(GamesLogClass);
    var Chat = React.createFactory(ChatClass);
    var GameLogChatSelector = React.createFactory(GameLogChatSelectorClass);

    var Players = React.createFactory(PlayersClass);
    var BetBar = React.createFactory(BetBarClass);
    var Controls = React.createFactory(ControlsClass);

    var D = React.DOM;

    return React.createClass({
        displayName: 'Game',

        getInitialState: function () {
            var state = GameSettingsStore.getState();
            state.username = Engine.username;
            state.demo = Engine.demo;
            state.isConnected = Engine.isConnected;
            state.superadmin = Engine.superadmin;
            state.staff = Engine.staff;
            state.admin = Engine.admin;
            state.is_parent = Engine.is_parent;
            state.showMessage = true;
            state.isMobileOrSmall = Clib.isMobileOrSmall(); // bool
            return state;
        },

        componentDidMount: function () {
            Engine.on({
                'connected': this._onEngineChange,
                'disconnected': this._onEngineChange
            });
            GameSettingsStore.addChangeListener(this._onSettingsChange);
            window.addEventListener('resize', this._onWindowResize);
            Hotkeys.mount();
        },

        componentWillUnmount: function () {
            Engine.off({
                'connected': this._onChange,
                'disconnected': this._onChange
            });

            window.removeEventListener('resize', this._onWindowResize);

            Hotkeys.unmount();
        },

        _onEngineChange: function () {
            var height = null;
            var timer = window.setInterval(is_element_loaded, 50);

            var adsModalClassStr = '.ads-modal.not-mobile';
            var type = $('#id_type').text();

            $('.ads-close').click(function () {
                $(adsModalClassStr).slideUp(110);
            });

            $('.balance-close').click(function () {
                $('.balance-modal').slideUp(110);
            });

            $('.reg-close').click(function () {
                $('.reg-modal').slideUp(110);
            });

            $('#id_btn_ads_1').click(function () {
                $('#id_btn_ads_1').addClass('ads-btn-selected');
                $('#id_btn_ads_2').removeClass('ads-btn-selected');
                $('#id_btn_ads_3').removeClass('ads-btn-selected');
                $('#id_btn_ads_4').removeClass('ads-btn-selected');
                $('.ads-modal-img').attr('src', '/img/ads_1.png');
            });

            $('#id_btn_ads_2').click(function () {
                $('#id_btn_ads_1').removeClass('ads-btn-selected');
                $('#id_btn_ads_2').addClass('ads-btn-selected');
                $('#id_btn_ads_3').removeClass('ads-btn-selected');
                $('#id_btn_ads_4').removeClass('ads-btn-selected');
                $('.ads-modal-img').attr('src', '/img/ads_2.png');
            });

            $('#id_btn_ads_3').click(function () {
                $('#id_btn_ads_1').removeClass('ads-btn-selected');
                $('#id_btn_ads_2').removeClass('ads-btn-selected');
                $('#id_btn_ads_3').addClass('ads-btn-selected');
                $('#id_btn_ads_4').removeClass('ads-btn-selected');
                $('.ads-modal-img').attr('src', '/img/ads_3.png');
            });

            $('#id_btn_ads_4').click(function () {
                $('#id_btn_ads_1').removeClass('ads-btn-selected');
                $('#id_btn_ads_2').removeClass('ads-btn-selected');
                $('#id_btn_ads_3').removeClass('ads-btn-selected');
                $('#id_btn_ads_4').addClass('ads-btn-selected');
                $('.ads-modal-img').attr('src', '/img/ads_4.png');
            });

            $('#id_btn_ads_1_m').click(function () {
                $('#id_btn_ads_1_m').addClass('ads-btn-selected');
                $('#id_btn_ads_2_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_3_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_4_m').removeClass('ads-btn-selected');
                $('.ads-modal-img_m').attr('src', '/img/ads_1.png');
            });

            $('#id_btn_ads_2_m').click(function () {
                $('#id_btn_ads_1_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_2_m').addClass('ads-btn-selected');
                $('#id_btn_ads_3_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_4_m').removeClass('ads-btn-selected');
                $('.ads-modal-img_m').attr('src', '/img/ads_2.png');
            });

            $('#id_btn_ads_3_m').click(function () {
                $('#id_btn_ads_1_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_2_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_3_m').addClass('ads-btn-selected');
                $('#id_btn_ads_4_m').removeClass('ads-btn-selected');
                $('.ads-modal-img_m').attr('src', '/img/ads_3.png');
            });

            $('#id_btn_ads_4_m').click(function () {
                $('#id_btn_ads_1_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_2_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_3_m').removeClass('ads-btn-selected');
                $('#id_btn_ads_4_m').addClass('ads-btn-selected');
                $('.ads-modal-img_m').attr('src', '/img/ads_4.png');
            });

            function is_element_loaded () {
                height = $('#id_divRoundNote').height();
                if (height != null) {
                    var screenWidth = $(window).width();
                    if (screenWidth <= 1200) { adsModalClassStr = '.ads-modal.mobile'; }

                    if (type == 'r') {
                        $('.reg-modal').slideDown(110);
                    } else {
                        $(adsModalClassStr).slideDown(110);
                    }

                    $('#loading-div').hide();
                    window.clearTimeout(timer);

                    jQuery(document).ready(function () {
                        function isMobileDevice () {
                            return (typeof window.orientation !== 'undefined') || (navigator.userAgent.indexOf('IEMobile') !== -1);
                        };

                        calcLayout();
                        if (!(screen.width <= 480 && isMobileDevice())) {
                            $(window).resize(function () {
                                // console.log('resize the layout - game');
                                calcLayout();
                            });
                        }
                    });

                    function calcLayout () {
                        // screen.orientation.lock('landscape');
                        Metronic.init();
                        Layout.init();
                        var height = $(window).height();
                        var width = $(window).width();
                        // console.log('width', $(document).width() + "    " + width + "   " + screen.width);
                        // console.log('height', $(document).height() + "   " + height + "   " + screen.height);
                        var headerHeight = $('.page-header').outerHeight();
                        height = height - headerHeight;

                        if (width <= 480) {
                            var cash_panel_height = 70; // =cash_panel_width
                            var cash_panel_top = 25;
                            var cash_panel_right = (width - cash_panel_height) / 2 + 30;
                            var cash_panel_font = cash_panel_height / 7 * 5;
                            var cash_panel_padding = (cash_panel_height - cash_panel_font) / 7 * 3;
                            $('#id_divPayout').css('height', cash_panel_height + 'px');
                            $('#id_divPayout').css('width', cash_panel_height + 'px');
                            $('#id_divPayout').css('top', cash_panel_top + 'px');
                            $('#id_divPayout').css('right', cash_panel_right + 'px');
                            $('#id_divPayout').css('font-size', cash_panel_font + 'px');
                            $('#id_divPayout').css('padding', cash_panel_padding + 'px 1px');
                            $('#id_divPayout').removeClass('btn-circle-50p');

                            var graph_height = cash_panel_height + 120;
                            $('#id_divChart').css('height', graph_height + 'px');
                            $('#id_divChart').css('width', '125%');
                            $('#id_divChart').css('margin-left', '-8%');

                            var roundNote_height = cash_panel_height;
                            var roundNote_top = cash_panel_top - 20;
                            var roundNote_right = 0;
                            var roundNote_width = width - 50;
                            var roundNote_padding = cash_panel_padding;
                            var roundNote_font = cash_panel_font / 5 * 4;
                            $('#id_divRoundNote').css('height', roundNote_height + 'px');
                            $('#id_divRoundNote').css('top', roundNote_top + 'px');
                            $('#id_divRoundNote').css('right', (roundNote_right + 25) + 'px');
                            $('#id_divRoundNote').css('width', roundNote_width + 'px');
                            $('#id_divRoundNote').css('padding', roundNote_padding + 'px 1px');
                            $('#id_divRoundNote').css('font-size', roundNote_font + 'px');

                            var round_info_height = 200;
                            $('#round_info').css('height', round_info_height + 'px');
                            $('#round_info').parent().css('height', round_info_height + 'px');

                            var tab_content_height = height - graph_height - $('.custom-login-play-btn').height() - 34;
                            $('#play_button_tab_content').css('height', tab_content_height + 'px');
                            $('#play_button_tab_content').parent().css('padding', '0 0 0 40px');
                            $('#play_button_tab_content').parent().parent().css('padding', '0 7px 0 0');

                            $('.button-container').parent().css('padding', '0 20px');

                            $('#tab_chat').find('.scroller').css('height', (tab_content_height - 46) + 'px');
                            $('#tab_chat').find('.slimScrollDiv').css('height', (tab_content_height - 55) + 'px');

                            $('#tab_players').find('.scroller').css('height', (tab_content_height - 23) + 'px');
                            $('#tab_players').find('.slimScrollDiv').css('height', (tab_content_height - 23) + 'px');

                            $('#tab_history').find('.scroller').css('height', (tab_content_height - 23) + 'px');
                            $('#tab_history').find('.slimScrollDiv').css('height', (tab_content_height - 23) + 'px');

                            var maxProfit_right = $('#play_button_tab_content').width() / 100 * 72;
                            var maxProfit_top = -17;
                            $('.max-profit').css('right', maxProfit_right + 'px');
                            $('.max-profit').css('top', maxProfit_top + 'px');

                            $('#id_imgFireworks').css('top', '25px');
                            $('#id_imgFireworks').css('right', (width - 80) + 'px');

                            $(document).on('click', '.custom-tab-menu', function () {
                                if ($(this).attr('name') == 'name_customTab') {
                                    setTextareaHeight();
                                    function setTextareaHeight () {
                                        if ($('#id_textareaCustomScript').css('height') == undefined) { setTimeout(setTextareaHeight, 30); } else $('#id_textareaCustomScript').css('height', (tab_content_height - 60) + 'px');
                                    }
                                }
                            });

                            $('.custom-control-tab-li').first().children().click();
                        } else if (width < 768) {
                            var cash_panel_height = 150; // =cash_panel_width
                            var cash_panel_top = 50;
                            var cash_panel_right = (width - cash_panel_height) / 2;
                            var cash_panel_font = cash_panel_height / 7 * 5;
                            var cash_panel_padding = (cash_panel_height - cash_panel_font) / 7 * 3;

                            $('#id_divPayout').css('height', cash_panel_height + 'px');
                            $('#id_divPayout').css('width', cash_panel_height + 'px');
                            $('#id_divPayout').css('top', cash_panel_top + 'px');
                            $('#id_divPayout').css('right', cash_panel_right + 'px');
                            $('#id_divPayout').css('font-size', cash_panel_font + 'px');
                            $('#id_divPayout').css('padding', cash_panel_padding + 'px 1px');
                            $('#id_divPayout').removeClass('btn-circle-50p');

                            var graph_height = cash_panel_height + 150;
                            $('#id_divChart').css('height', graph_height + 'px');
                            $('#id_divChart').css('width', '115%');
                            $('#id_divChart').css('margin-left', '-4%');

                            var roundNote_height = cash_panel_height;
                            var roundNote_top = cash_panel_top;
                            var roundNote_right = 0;
                            var roundNote_width = width - 50;
                            var roundNote_padding = cash_panel_padding;
                            var roundNote_font = cash_panel_font * 4 / 5;
                            $('#id_divRoundNote').css('height', roundNote_height + 'px');
                            $('#id_divRoundNote').css('top', roundNote_top + 'px');
                            $('#id_divRoundNote').css('right', (roundNote_right + 25) + 'px');
                            $('#id_divRoundNote').css('width', roundNote_width + 'px');
                            $('#id_divRoundNote').css('padding', roundNote_padding + 'px 1px');
                            $('#id_divRoundNote').css('font-size', roundNote_font + 'px');

                            var round_info_height = 200;
                            $('#round_info').css('height', round_info_height + 'px');
                            $('#round_info').parent().css('height', round_info_height + 'px');

                            var tab_content_height = height - graph_height - 58;
                            $('#play_button_tab_content').css('height', tab_content_height + 'px');
                            $('#play_button_tab_content').parent().css('padding', '0 0 0 40px');
                            $('#play_button_tab_content').parent().parent().css('padding', '0 7px 0 0');

                            $('.button-container').parent().css('padding', '0 20px');

                            $('#tab_chat').find('.scroller').css('height', (tab_content_height - 55) + 'px');
                            $('#tab_chat').find('.slimScrollDiv').css('height', (tab_content_height - 64) + 'px');

                            $('#tab_players').find('.scroller').css('height', (tab_content_height - 23) + 'px');
                            $('#tab_players').find('.slimScrollDiv').css('height', (tab_content_height - 23) + 'px');

                            $('#tab_history').find('.scroller').css('height', (tab_content_height - 23) + 'px');
                            $('#tab_history').find('.slimScrollDiv').css('height', (tab_content_height - 23) + 'px');

                            $(document).on('click', '.custom-tab-menu', function () {
                                if ($(this).attr('name') == 'name_customTab') {
                                    setTextareaHeight();
                                    function setTextareaHeight () {
                                        if ($('#id_textareaCustomScript').css('height') == undefined) { setTimeout(setTextareaHeight, 100); } else $('#id_textareaCustomScript').css('height', (tab_content_height - 60) + 'px');
                                    }
                                }
                            });

                            $('.custom-control-tab-li').first().children().click();

                            if ($('#tab_manual').children().eq(0).children().eq(0).hasClass('col-xs-9')) {
                                $('#tab_manual').children().eq(0).children().eq(0).removeClass('col-xs-9').addClass('col-xs-6');
                                $('#tab_manual').children().eq(0).children().eq(1).removeClass('col-xs-3').addClass('col-xs-6');
                            }

                            var maxProfit_right = $('#play_button_tab_content').width() / 100 * 90;
                            var maxProfit_top = -18;
                            $('.max-profit').css('right', maxProfit_right + 'px');
                            $('.max-profit').css('top', maxProfit_top + 'px');

                            $('#id_imgFireworks').css('top', '30px');
                            $('#id_imgFireworks').css('right', (width - 100) + 'px');
                        } else if (width < 992) {
                            var element1 = $('#bet_button_tabs').parent();
                            var element2 = $('#history_chat_button_tabs').parent();
                            $(element1).insertBefore(element2);

                            $('#tab_auto').children().first().children().eq(1).children().first().css('margin-top', '0');
                            $('.button-container').parent().removeClass('col-sm-6').addClass('col-sm-5');

                            $('.page-sidebar-menu-hover-submenu').parent().attr('style', 'height:' + height + 'px !important');
                            var play_button_tab_content_height = 260;
                            $('#play_button_tab_content').css('height', play_button_tab_content_height + 'px');

                            var round_info_height = (height - 250) / 2;
                            $('#round_info').css('height', round_info_height + 'px');
                            $('#round_info').parent().css('height', round_info_height + 'px');

                            $('#id_divGamesLog').css('height', round_info_height + 'px');
                            $('#id_divGamesLog').parent().css('height', round_info_height + 'px');

                            var graph_height = height - play_button_tab_content_height - 200;
                            var graph_width = $('#play_button_tab_content').width();

                            $('#id_divChart').css('height', graph_height + 'px');
                            $('#id_divChart').css('width', '105%');

                            var cash_panel_height = ((graph_height < graph_width) ? (graph_height) : (graph_width)) - 30;
                            $('#id_divPayout').css('height', cash_panel_height + 'px');
                            $('#id_divPayout').css('width', cash_panel_height + 'px');

                            var cash_panel_top = (graph_height - cash_panel_height) / 2 - 10;
                            // var cash_panel_right = $('#id_divRecentHistory').width() + ($('#play_button_tab_content').width() - $('#id_divRecentHistory').width()) / 2 - $('#id_divPayout').width() / 2;
                            var cash_panel_right = width / 2 - $('#id_divPayout').width() / 2;
                            var cash_panel_font = cash_panel_height / 10 * 3;
                            var cash_panel_padding = (cash_panel_height - cash_panel_font) / 8 * 3;

                            $('#id_divPayout').css('top', cash_panel_top + 'px');
                            $('#id_divPayout').css('font-size', cash_panel_font + 'px');
                            $('#id_divPayout').css('padding', cash_panel_padding + 'px 1px');
                            $('#id_divPayout').css('right', cash_panel_right + 'px');

                            var roundNote_height = cash_panel_height;
                            var roundNote_top = cash_panel_top;
                            var roundNote_right = $('#id_divRecentHistory').width() + 10;
                            var roundNote_width = $('#play_button_tab_content').width() - $('#id_divRecentHistory').width();
                            var roundNote_padding = cash_panel_height / 4;
                            var roundNote_font = (cash_panel_height - cash_panel_font) / 8 * 3;
                            $('#id_divRoundNote').css('height', roundNote_height + 'px');
                            $('#id_divRoundNote').css('top', roundNote_top + 'px');
                            $('#id_divRoundNote').css('right', (roundNote_right + 10) + 'px');
                            $('#id_divRoundNote').css('width', roundNote_width + 'px');
                            $('#id_divRoundNote').css('padding', roundNote_padding + 'px 1px');
                            $('#id_divRoundNote').css('font-size', roundNote_font + 'px');

                            var maxProfit_right = $('#play_button_tab_content').width() / 100 * 85;
                            $('.max-profit').css('right', maxProfit_right + 'px');

                            var recentHistoryPadding = ($('#id_divRecentHistory').find('.scroller').innerWidth() - $('#id_divRecentHistory').find('.scroller').width()) / 2;
                            $('#id_divRecentHistory').find('.scroller').css('padding-left', recentHistoryPadding + 'px');

                            $('#id_imgFireworks').css('top', '100px');
                            $('#id_imgFireworks').css('right', width / 2 - 50 + 'px');

                            $(document).on('click', '.custom-tab-menu', function () {
                                if ($(this).hasClass('custom-tab-menu-custom')) {
                                    setTextareaHeight();
                                    function setTextareaHeight () {
                                        if ($('#id_textareaCustomScript').css('height') == undefined) { setTimeout(setTextareaHeight, 100); } else {
                                            $('#id_textareaCustomScript').css('height', 'auto');
                                            $('.custom-customscript-button').css('margin-top', ($('#id_textareaCustomScript').height() - 60) + 'px', '!important');
                                        }
                                    }
                                }
                            });
                        } else if (width < 1200) {
                            $('#tab_range .md-radio-list').children().eq(0).removeClass('col-md-6').addClass('col-md-12');
                            $('#tab_range .md-radio-list').children().eq(1).removeClass('col-md-6').addClass('col-md-12');
                            $('#history_chat_button_tabs').parent().css('padding-right', '2px');
                            // $("#play_button_tab_content").parent().parent().css('padding-left', '2px');
                            $('.class_mainPart1').children().first().children().first().css('padding-left', '2px');
                            $('.class_mainPart1').css('padding-left', '2px');

                            $('#play_button_tab_content').css('overflow-y', 'auto');
                            $('#play_button_tab_content').css('overflow-x', 'hidden');

                            var targetElement = $('#id_divAutoBetButtonContainer').parent().parent();
                            $('#id_divSetAllRangeBetAmount').insertBefore(targetElement);
                            $('#id_divControlButtonsInAutoTab > .class_emptyElement').remove();
                            $('#id_divControlButtonsInAutoTab').children().eq(0).removeClass('col-md-2').addClass('col-md-3');
                            $('#id_divControlButtonsInAutoTab').children().eq(1).removeClass('col-md-2').addClass('col-md-3');

                            $('.page-sidebar-menu-hover-submenu').parent().attr('style', 'height:' + height + 'px !important');
                            var play_button_tab_content_height = height / 2 - 60;
                            $('#play_button_tab_content').css('height', (play_button_tab_content_height) + 'px');
                            $('#id_divChart').css('width', '110%');

                            var round_info_height = (height - 82) / 2;
                            $('#round_info').css('height', (round_info_height + 10) + 'px');
                            $('#round_info').parent().css('height', (round_info_height + 10) + 'px');

                            $('#id_divGamesLog').css('height', (round_info_height - 40) + 'px');
                            $('#id_divGamesLog').parent().css('height', (round_info_height - 40) + 'px');

                            var id_divChatBoxElement = $('#id_divChatBox');
                            id_divChatBoxElement.css('height', (round_info_height - 85) + 'px');
                            id_divChatBoxElement.parent().css('height', (round_info_height - 85) + 'px');

                            var graph_height = height - play_button_tab_content_height - 76;
                            var graph_width = $('#play_button_tab_content').width();

                            $('#id_divChart').css('height', graph_height + 'px');

                            var cash_panel_height = ((graph_height < graph_width) ? (graph_height) : (graph_width)) - 80;
                            $('#id_divPayout').css('height', cash_panel_height + 'px');
                            $('#id_divPayout').css('width', cash_panel_height + 'px');

                            var cash_panel_top = (graph_height - cash_panel_height) / 2 - 10;
                            var cash_panel_right = $('#id_divRecentHistory').width() + ($('#play_button_tab_content').width() - $('#id_divRecentHistory').width()) / 2 - $('#id_divPayout').width() / 2;
                            var cash_panel_font = cash_panel_height / 10 * 3;
                            var cash_panel_padding = (cash_panel_height - cash_panel_font) / 8 * 3;

                            $('#id_divPayout').css('top', cash_panel_top + 'px');
                            $('#id_divPayout').css('font-size', cash_panel_font + 'px');
                            $('#id_divPayout').css('padding', cash_panel_padding + 'px 1px');
                            $('#id_divPayout').css('right', cash_panel_right + 'px');

                            var roundNote_height = cash_panel_height;
                            var roundNote_top = cash_panel_top;
                            var roundNote_right = $('#id_divRecentHistory').width() + 10;
                            var roundNote_width = $('#play_button_tab_content').width() - $('#id_divRecentHistory').width();
                            var roundNote_padding = cash_panel_height / 4;
                            var roundNote_font = (cash_panel_height - cash_panel_font) / 8 * 3;
                            $('#id_divRoundNote').css('height', roundNote_height + 'px');
                            $('#id_divRoundNote').css('top', roundNote_top + 'px');
                            $('#id_divRoundNote').css('right', (roundNote_right + 10) + 'px');
                            $('#id_divRoundNote').css('width', roundNote_width + 'px');
                            $('#id_divRoundNote').css('padding', roundNote_padding + 'px 1px');
                            $('#id_divRoundNote').css('font-size', roundNote_font + 'px');

                            var maxProfit_right = $('#play_button_tab_content').width() / 100 * 85;
                            $('.max-profit').css('right', maxProfit_right + 'px');

                            var recentHistoryPadding = ($('#id_divRecentHistory').find('.scroller').innerWidth() - $('#id_divRecentHistory').find('.scroller').width()) / 2;
                            $('#id_divRecentHistory').find('.scroller').css('padding-left', recentHistoryPadding + 'px');

                            $('#id_imgFireworks').css('top', '100px');
                            $('#id_imgFireworks').css('right', width / 2 - 50 + 'px');

                            $(document).on('click', '.custom-tab-menu', function () {
                                if ($(this).hasClass('custom-tab-menu-custom')) {
                                    setTextareaHeight();
                                    function setTextareaHeight () {
                                        if ($('#id_textareaCustomScript').css('height') == undefined) { setTimeout(setTextareaHeight, 100); } else {
                                            $('#id_textareaCustomScript').css('height', 'auto');
                                            $('.custom-customscript-button').css('margin-top', ($('#id_textareaCustomScript').height() - 60) + 'px', '!important');
                                        }
                                    }
                                }
                            });
                        } else {
                            $('.page-sidebar-menu-hover-submenu').parent().attr('style', 'height:' + height + 'px !important');
                            play_button_tab_content_height = height / 2 - 61;
                            $('#play_button_tab_content').css('height', (play_button_tab_content_height + 11) + 'px');

                            var round_info_height = (height - 82) / 2;
                            $('#round_info').css('height', (round_info_height + 10) + 'px');
                            $('#round_info').parent().css('height', (round_info_height + 10) + 'px');

                            var id_divGamesLogElement = $('#id_divGamesLog');
                            id_divGamesLogElement.css('height', (round_info_height - 33) + 'px');
                            id_divGamesLogElement.parent().css('height', (round_info_height - 33) + 'px');

                            var id_divChatBoxElement = $('#id_divChatBox');
                            id_divChatBoxElement.css('height', (round_info_height - 75) + 'px');
                            id_divChatBoxElement.parent().css('height', (round_info_height - 75) + 'px');

                            var graph_height = height - play_button_tab_content_height - 77;
                            var graph_width = (width - 110) / 100 * 45;

                            $('#id_divChart').css('height', graph_height + 'px');
                            $('#id_divChart').css('width', '105%');

                            var cash_panel_height = ((graph_height < graph_width) ? (graph_height) : (graph_width)) - 80;
                            $('#id_divPayout').css('height', cash_panel_height + 'px');
                            $('#id_divPayout').css('width', cash_panel_height + 'px');

                            var cash_panel_top = (graph_height - cash_panel_height) / 2 - 10;
                            var cash_panel_right = $('#id_divRecentHistory').width() + ($('#play_button_tab_content').width() - $('#id_divRecentHistory').width()) / 2 - $('#id_divPayout').width() / 2;
                            var cash_panel_font = cash_panel_height / 10 * 3;
                            var cash_panel_padding = (cash_panel_height - cash_panel_font) / 8 * 3;

                            $('#id_divPayout').css('top', cash_panel_top + 'px');
                            $('#id_divPayout').css('font-size', cash_panel_font + 'px');
                            $('#id_divPayout').css('padding', cash_panel_padding + 'px 1px');
                            $('#id_divPayout').css('right', cash_panel_right + 'px');

                            var roundNote_height = cash_panel_height;
                            var roundNote_top = cash_panel_top;
                            var roundNote_right = $('#id_divRecentHistory').width() + 10;
                            var roundNote_width = graph_width;
                            var roundNote_padding = cash_panel_height / 4;
                            var roundNote_font = (cash_panel_height - cash_panel_font) / 9 * 3;
                            $('#id_divRoundNote').css('height', roundNote_height + 'px');
                            $('#id_divRoundNote').css('top', roundNote_top + 'px');
                            $('#id_divRoundNote').css('right', (roundNote_right + 10) + 'px');
                            $('#id_divRoundNote').css('width', roundNote_width + 'px');
                            $('#id_divRoundNote').css('padding', roundNote_padding + 'px 1px');
                            $('#id_divRoundNote').css('font-size', roundNote_font + 'px');

                            var maxProfit_right = $('#play_button_tab_content').width() / 100 * 85;
                            $('.max-profit').css('right', maxProfit_right + 'px');

                            var recentHistoryPadding = ($('#id_divRecentHistory').find('.scroller').innerWidth() - $('#id_divRecentHistory').find('.scroller').width()) / 2;
                            $('#id_divRecentHistory').find('.scroller').css('padding-left', recentHistoryPadding + 'px');

                            $('#id_imgFireworks').css('top', '100px');
                            $('#id_imgFireworks').css('right', width / 2 - 50 + 'px');

                            $(document).on('click', '.custom-tab-menu', function () {
                                if ($(this).hasClass('custom-tab-menu-custom')) {
                                    setTextareaHeight();
                                    function setTextareaHeight () {
                                        if ($('#id_textareaCustomScript').css('height') == undefined) { setTimeout(setTextareaHeight, 100); } else {
                                            $('#id_textareaCustomScript').css('height', 'auto');
                                            $('.custom-customscript-button').css('margin-top', ($('#id_textareaCustomScript').height() - 60) + 'px', '!important');
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }

            if ((this.state.isConnected != Engine.isConnected) && this.isMounted()) {
                this.setState({
                    isConnected: Engine.isConnected,
                    username: Engine.username,
                    admin: Engine.admin,
                    superadmin: Engine.superadmin,
                    staff: Engine.staff,
                    demo: Engine.demo,
                    is_parent: Engine.is_parent
                });
            }
        },

        _onSettingsChange: function () {
            if (this.isMounted()) { this.setState(GameSettingsStore.getState()); }
        },

        _onWindowResize: function () {
            var isMobileOrSmall = Clib.isMobileOrSmall();
            if (this.state.isMobileOrSmall !== isMobileOrSmall) { this.setState({ isMobileOrSmall: isMobileOrSmall }); }
        },

        _hideMessage: function () {
            console.log('engine._hideMessage');
            this.setState({ showMessage: false });
        },

        render: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');
            var ghost_handheld_detect = window.getComputedStyle(document.getElementById('ghost-handheld-detection'), null).display == 'none';

            if (!this.state.isConnected) {
                return D.div({ id: 'loading-container' },
                    D.div({ className: 'loading-image' },
                        D.span({ className: 'bubble-1' }),
                        D.span({ className: 'bubble-2' }),
                        D.span({ className: 'bubble-3' })
                    )
                );
            }

            var loginButton = null;
            var registerButton = null;
            var accountButton = null;
            var adminButton = null;
            var logoutButton = null;
            var languageButton = null;
            var agentButton = null;
            var leaderBoardButton = null;

            gameButton = D.li({className: 'active'},
                D.a({href: '/play/?clang=' + languageCode},
                    D.img({src: '/img/line-chart.svg', style: {width: '26px'}}, null),
                    D.span({className: 'title'}, languageFlag ? 'Game' : '游戏分析')
                )
            );
            if (this.state.username) { // isLogin
                if (this.state.admin) {
                    adminButton = D.li(null,
                        D.a({href: '/statistics-admin/?clang=' + languageCode},
                            D.i({className: 'fa fa-cogs fa-2x'}),
                            D.span({className: 'title'}, languageFlag ? 'Admin' : '管理人')
                        )
                    );
                } else {
                    if (this.state.demo == false && this.state.staff == false) {
                        accountButton = D.li(null,
                            D.a({ href: '/account/?clang=' + languageCode },
                                D.i({ className: 'far fa-user fa-2x' }),
                                D.span({ className: 'title'}, languageFlag ? 'Account' : '账户')
                            )
                        );
                    }
                    if (this.state.demo == false && this.state.staff == false) {
                        agentButton = D.li(null,
                            D.a({href: '/agent/?clang=' + languageCode},
                                D.i({className: 'fas fa-user-secret fa-2x'}),
                                D.span({className: 'title'}, languageFlag ? 'Agent' : '推荐奖励')
                            )
                        );
                    }
                }
            }

            if (this.state.isMobileOrSmall) {
                leaderBoardButton = D.li(null,
                    D.a({ href: '/leaderboard/?clang=' + languageCode },
                        D.i({ className: 'fas fa-users fa-2x' }),
                        D.span({ className: 'title'},
                            languageFlag ? 'Leaderboard' : '排行榜'
                        )
                    )
                );
            } else {
                leaderBoardButton = D.li(null,
                    D.a({ href: '/leaderboard/?clang=' + languageCode },
                        D.i({ className: 'fas fa-users fa-2x' }),
                        D.span({ className: 'title'},
                            languageFlag ? 'Leader' : '排行榜',
                            D.br(null),
                            languageFlag ? 'board' : ''
                        )
                    )
                );
            }

            if (!this.state.username && this.state.isMobileOrSmall) { // isNotLogin and isOnMobile
                loginButton = D.li(null,
                    D.a({ href: '/login/?clang=' + languageCode },
                        D.i({ className: 'fas fa-sign-in-alt fa-2x' }),
                        D.span({ className: 'title'}, languageFlag ? 'Login' : '登陆')
                    )
                );

                registerButton = D.li({style: {display: 'none'}},
                    D.a({ href: '/register/?clang=' + languageCode },
                        D.i({ className: 'far fa-user fa-2x' }),
                        D.span({ className: 'title'}, languageFlag ? 'Register' : '注册')
                    )
                );
            } else if (this.state.username && (this.state.isMobileOrSmall || ghost_handheld_detect)) {
                logoutButton = D.li(null,
                    D.form({'action': '/logout', 'method': 'post', id: 'logout'}),
                    D.a({style: {'position': 'relative'},
                        'onclick': 'logout()',
                        'alt': 'Logout',
                        id: 'id_linkLogout_sidebar'},
                    D.i({className: 'fas fa-power-off fa-2x'}),
                    D.span({ className: 'title'}, languageFlag ? 'Logout' : '登出')
                    )
                );
            }

            var objSideBar =
                D.div({ className: 'page-sidebar-wrapper' },
                    D.div({ className: 'page-sidebar navbar-collapse collapse' },
                        D.ul({ className: 'page-sidebar-menu page-sidebar-menu-hover-submenu ', 'data-keep-expanded': false, 'data-auto-scroll': true, 'data-slide-speed': 200 },
                            gameButton,
                            loginButton,
                            registerButton,
                            adminButton,
                            accountButton,
                            agentButton,
                            leaderBoardButton,
                            D.li(null,
                                D.a({ href: '/no_user/?clang=' + languageCode },
                                    D.i({ className: 'fas fa-chart-line fa-2x' }),
                                    D.span({ className: 'title'}, languageFlag ? 'Stats' : '统计')
                                )
                            ),
                            D.li(null,
                                D.a({ href: '/tutorial/?clang=' + languageCode },
                                    D.i({ className: 'fab fa-leanpub fa-2x' }),
                                    D.span({ className: 'title'}, (languageFlag ? 'Tutorial' : '教程'))
                                )
                            ),
                            D.li(null,
                                D.a({ href: '/faq_' + languageCode + '/?clang=' + languageCode },
                                    D.i({ className: 'fas fa-question-circle fa-2x' }),
                                    D.span({ className: 'title'}, languageFlag ? 'FAQ' : '问题')
                                )
                            ),
                            languageButton,
                            logoutButton
                        )
                    )
                );

            var contentDiv = null;
            // var ghost_handheld_detect = window.getComputedStyle(document.getElementById('ghost-handheld-detection'), null).display == 'none';

            if (!this.state.isMobileOrSmall) {
                contentDiv = D.div({className: 'row'},
                    D.div({className: 'col-md-5-8 class_mainPart2'},
                        GraphicsContainer({
                            isMobileOrSmall: this.state.isMobileOrSmall,
                            controlsSize: this.state.controlsSize
                        }),
                        BetBar(),
                        GameLogChatSelector({
                            isMobileOrSmall: this.state.isMobileOrSmall,
                            controlsSize: this.state.controlsSize
                        })
                    ),
                    D.div({className: 'col-md-6-4 class_mainPart1'},
                        Players(),
                        ControlsSelector({
                            isMobileOrSmall: this.state.isMobileOrSmall,
                            controlsSize: this.state.controlsSize
                        })
                    )
                );
            } else {
                if (!Engine.username) {
                    contentDiv = D.div({className: 'row'},
                        D.div({className: 'col-md-12'},
                            GraphicsContainer({
                                isMobileOrSmall: this.state.isMobileOrSmall,
                                controlsSize: this.state.controlsSize
                            }),
                            Controls({
                                isMobileOrSmall: this.state.isMobileOrSmall,
                                controlsSize: this.state.controlsSize
                            }),
                            ControlsSelector({
                                isMobileOrSmall: this.state.isMobileOrSmall,
                                controlsSize: this.state.controlsSize
                            })
                        )
                    );
                } else {
                    contentDiv = D.div({className: 'row'},
                        D.div({className: 'col-md-12'},
                            GraphicsContainer({
                                isMobileOrSmall: this.state.isMobileOrSmall,
                                controlsSize: this.state.controlsSize
                            }),
                            ControlsSelector({
                                isMobileOrSmall: this.state.isMobileOrSmall,
                                controlsSize: this.state.controlsSize
                            })
                        )
                    );
                }
            }

            return D.div({id: 'game-inner-container'},
                TopBar({isMobileOrSmall: this.state.isMobileOrSmall}),
                D.div({className: 'clearfix'}),
                D.div({className: 'page-container'},
                    objSideBar,
                    D.div({className: 'page-content-wrapper'},
                        D.div({className: 'page-content'},
                            contentDiv
                        )
                    )
                )
            );
        }
    });
});
