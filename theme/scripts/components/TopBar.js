define([
    'react',
    'game-logic/engine',
    'stores/GameSettingsStore',
    'actions/GameSettingsActions',
    'game-logic/clib',
    'screenfull'
], function (
    React,
    Engine,
    GameSettingsStore,
    GameSettingsActions,
    Clib,
    Screenfull /* Attached to window.screenfull */
) {
    var D = React.DOM;

    function getState () {
        return {
            balanceBitsFormatted: Clib.formatSatoshis(Engine.balanceSatoshis),
            theme: GameSettingsStore.getCurrentTheme()// black || white
        };
    }

    return React.createClass({
        displayName: 'TopBar',
        count: 0,

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired
        },

        getInitialState: function () {
            var state = getState();
            state.username = Engine.username;
            state.fullScreen = false;
            return state;
        },

        componentDidMount: function () {
            Engine.on({
                game_started: this._onChange,
                game_crash: this._onChange,
                cashed_out: this._onChange,
                add_satoshis: this._onChange,
                got_first_deposit_fee: this.updateNotification,
                got_login_bonus: this.updateNotification
            });
            GameSettingsStore.on('all', this._onChange);
        },

        componentWillUnmount: function () {
            Engine.off({
                game_started: this._onChange,
                game_crash: this._onChange,
                cashed_out: this._onChange,
                add_satoshis: this._onChange,
                got_first_deposit_fee: this.updateNotification,
                got_login_bonus: this.updateNotification
            });
            GameSettingsStore.off('all', this._onChange);
        },

        _onChange: function () {
            this.setState(getState());
        },

        _toggleFullScreen: function () {
        	window.screenfull.toggle();
            this.setState({ fullScreen: !this.state.fullScreen });
        },

        updateNotification: function (fdf) {
            var count = parseInt($('.badge.badge-danger').text());
            if (count === undefined || count <= 0) {
                count = 1;
            } else {
                count++;
            }
            this.count = count;
            $('.badge-danger.badge').text(this.count);
            this.render();
            /* if (count === 1) window.location = ''; */
        },

        render: function () {
            var strTopbarElement_1 = null;
            var strTopbarElement_2 = null;
            var strTopbarNotification = null;
            var satoshiElementForMobileView = null;
            var depositElement = null;
            var withdrawElement = null;
            var logoutButton = null;
            var muteElement1 = null;
            var muteElement2 = null;
            var muteElement3 = null;
            var gamingPoolElement = null;
            var totalPlayerElement = null;
            var totalBetElement = null;
            var fullScreenElement = null;


            var nGamingPool = Engine.bankroll + Engine.fakepool;
            var nTotalPlayers = 0;
            var nTotalBets = 0;

            var ghost_handheld_detect = window.getComputedStyle(document.getElementById('ghost-handheld-detection'), null).display == 'none';

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            muteElement1 = D.li({className: 'dropdown class_satoshi_panel topbar_info_panel class_speaker class_speaker_background', style: {marginTop: '12px !important'},},
                D.div({style: {textAlign: 'center', marginBottom: '0', marginRight: '20px'}},
                    D.span({style: {fontSize: '12px'}}, languageFlag ? 'Background' : '背景音乐'),
                    D.br(null),
                    D.img({src: '/img/speaker_on.svg', width: '21px', height: '21px', style: {marginTop:'3px', opacity:'0.7'}})
                )
            );

            muteElement2 = D.li({className: 'dropdown class_satoshi_panel topbar_info_panel class_speaker class_speaker_chat', style: {marginTop: '12px !important'}},
                D.div({style: {textAlign: 'center', marginBottom: '0', marginRight: '20px'}},
                    D.span({style: {fontSize: '12px'}}, languageFlag ? 'Chat' : '聊天提示音'),
                    D.br(null),
                    D.img({src: '/img/speaker_on.svg', width: '21px', height: '21px', style: {marginTop:'3px', opacity:'0.7'}})
                )
            );

            muteElement3 = D.li({className: 'dropdown class_satoshi_panel topbar_info_panel class_speaker class_speaker_etc', style: {marginTop: '12px !important'}},
                D.div({style: {textAlign: 'center', marginBottom: '0', marginRight: '20px'}},
                    D.span({style: {fontSize: '12px'}}, languageFlag ? 'Etcetera' : '音效'),
                    D.br(null),
                    D.img({src: '/img/speaker_on.svg', width: '21px', height: '21px', style: {marginTop:'3px', opacity:'0.7'}})
                )
            );

            for (var userInfo in Engine.playerInfo) {
                nTotalPlayers++;
                nTotalBets += parseInt(Engine.playerInfo[userInfo].bet) / 100;
                nTotalBets += parseInt(Engine.playerInfo[userInfo].extraBet) / 100;
                var rangeBets = Engine.playerInfo[userInfo].rangeBet;
                if (rangeBets.length > 0) {
                    for (var i = 0; i < rangeBets.length; i++) {
                        nTotalBets += parseInt(rangeBets[i].amount) / 100;
                    }
                }
            }

            gamingPoolElement = D.li({className: 'dropdown class_satoshi_panel topbar_info_panel', style: {marginTop: '12px !important'}},
                D.div({style: {textAlign: 'center', marginBottom: '0', marginRight: '20px'}},
                    D.span({style: {fontSize: '12px'}}, languageFlag ? 'Gaming Pool' : '算力资源池总数'),
                    D.hr({style: {margin: '3px 0', borderTop: '1px dashed #5f5f5f'}}),
                    D.span({style: {fontSize: '12px', color: '#E93036', fontWeight: '800'}}, nGamingPool),
                    D.span({style: {fontSize: '12px', fontWeight: '400'}}, languageFlag ? ' bits' : ' 点数')
                )
            );
            totalPlayerElement = D.li({className: 'dropdown class_satoshi_panel topbar_info_panel', style: {marginTop: '12px !important'}},
                D.div({style: {textAlign: 'center', marginBottom: '0', marginRight: '20px'}},
                    D.span({style: {fontSize: '12px'}}, languageFlag ? 'Total Players' : '总参与人数'),
                    D.hr({style: {margin: '3px 0', borderTop: '1px dashed #5f5f5f'}}),
                    D.span({style: {fontSize: '12px', color: '#E93036', fontWeight: '800'}}, nTotalPlayers)
                )
            );
            totalBetElement = D.li({className: 'dropdown class_satoshi_panel topbar_info_panel', style: {marginTop: '12px !important'}},
                D.div({style: {textAlign: 'center', marginBottom: '0', marginRight: '20px'}},
                    D.span({style: {fontSize: '12px'}}, languageFlag ? 'Total Bets' : '总投入算力量'),
                    D.hr({style: {margin: '3px 0', borderTop: '1px dashed #5f5f5f'}}),
                    D.span({style: {fontSize: '12px', color: '#E93036', fontWeight: '800'}}, nTotalBets),
                    D.span({style: {fontSize: '12px', fontWeight: '400'}}, languageFlag ? ' bits' : ' 点数')
                )
            );

            fullScreenElement = D.li({className: 'dropdown', id: 'id_liFullscreen'},
                D.a({ className: 'dropdown-toggle', onClick: this._toggleFullScreen },
                    this.state.fullScreen ? D.i({ className: 'fas fa-compress fa-lg' }) : D.i({ className: 'fas fa-expand-arrows-alt fa-lg' })
                )
            );

            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode === 'en');

            if (this.state.username) { // logged already
                if (!Engine.admin) {
                    strTopbarElement_1 = D.li({ className: 'dropdown class_satoshi_panel'},
                        D.a({ className: 'dropdown-toggle custom-bitcoin-amount', style: { cursor: 'default' } }, this.state.balanceBitsFormatted + ' bits')
                    );

                    satoshiElementForMobileView = D.a({ className: 'dropdown-toggle custom-bitcoin-amount-mobile' }, this.state.balanceBitsFormatted + ' bits');

                    if (Engine.demo == false) {
                        // depositElement = D.li({className: 'dropdown', title: languageFlag ? 'Deposit' : '存入算力'},
                        //     D.a({href: '/deposit/?clang=' + languageCode, className: 'dropdown-toggle'},
                        //         D.i({className: 'fab fa-btc fa-lg'})
                        //     )
                        // );
                        // withdrawElement = D.li({className: 'dropdown', title: languageFlag ? 'Withdraw' : '兑换算力'},
                        //     D.a({href: '/withdraw-request/?clang' + languageCode, className: 'dropdown-toggle'},
                        //         D.i({className: 'fas fa-dollar-sign fa-lg'})
                        //     )
                        // );
                        depositElement = D.li({ className: 'dropdown', style: { marginTop: '15px', marginRight: '20px'}},
                            D.a({ href: '/deposit/?clang=' + languageCode,
                                className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run custom-login-register-btn',
                                // style: {'background': '0 0 ', width: '100px', 'border': '1px solid #f1353d', paddingTop: '10px', paddingBottom: '10px' }
                                style: { color: '#fff',
                                    backgroundColor: '#b92525',
                                    width: '100px',
                                    height: '35px',
                                    verticalAlign: 'middle',
                                    borderRadius: '8px !important',
                                    border: '0',
                                    fontSize: '18px !important',
                                    lineHeight: '4px',
                                    marginTop: '3px',
                                    marginLeft: '10px',
                                    outline: 'none',
                                    'WebkitBoxShadow': '0 0 6px 0px white',
                                    'MozBoxShadow': '0 0 6px 0px white',
                                    'boxShadow': '0 0 6px 0px white'
                                }},
                            languageFlag ? 'Deposit' : '存入算力')
                        );
                        withdrawElement = null;
                    }
                }
                var current_time = new Date();
                var appendStr = current_time.getFullYear() + current_time.getMonth() + current_time.getDate() + current_time.getHours() + current_time.getMinutes();
                var strUserImagePath = '/img/photos/' + this.state.username + '.jpg?v=' + appendStr;
                strTopbarElement_2 = D.li({className: 'dropdown dropdown-user'},
                    D.a({id: 'id_linkChangeAvatar', className: 'dropdown-toggle', 'data-toggle': 'dropdown', 'data-hover': 'dropdown', 'data-close-others': 'true', style: { cursor: 'default' }},
                        D.img({alt: '', className: 'img-circle', src: strUserImagePath, id: 'id_imgAvatar'}),
                        D.span({className: 'username username-hide-on-mobile', style: { fontWeight: 800, color: '#eee' }}, this.state.username)
                    )
                );

                // if ( user.reply && user.reply.length > 0 ){
                //     disp = 'inline';
                //     /*user.reply.forEach(function(row){
                //         var rowElement = D.li(
                //                             D.input( { type: 'hidden', value: row.id } ),
                //                             D.a( { style: { float: 'left', width: '90%' } },
                //                                 D.span( { className: 'message' }, row.message_to_user ) ),
                //                             D.a( { className: 'delete', style: { float: 'left', 'padding-left': '0px', 'padding-right': '5px', 'vertical-align': 'middle' } },
                //                                 D.i( { className: 'fas fa-trash-alt' } ) ) );
                //         replyElementList.push(rowElement);
                //     });*/
                // }

                if (this.count === 0 && user.reply) this.count = user.reply.length;
                var disp = 'inline';
                if (this.count <= 0) disp = 'none';
                strTopbarNotification =
                    D.li({ className: 'dropdown dropdown-extended dropdown-inbox dropdown-dark', id: 'header_inbox_bar', style: {display: disp} },
                        D.a({ className: 'dropdown-toggle', 'data-toggle': 'dropdown', 'data-close-others': true, 'aria-expanded': false, style: { width: '50px' } },
                            D.i({ className: 'fas fa-envelope fa-lg'}),
                            D.span({ className: 'badge badge-danger' }, user.reply.length)),
                        D.ul({className: 'reply dropdown-menu', style: { width: '250px' } }));

                logoutButton =
                    D.li({className: 'dropdown'},
                        D.form({'action': '/logout', 'method': 'post', id: 'logout'}),
                        D.a({ className: 'dropdown-toggle', 'alt': 'Logout', id: 'id_linkLogout'},
                            D.i({ className: 'fas fa-power-off fa-lg' })));
            } else { // unregisted user
                strTopbarElement_1 = D.li({ className: 'dropdown', style: { marginTop: '15px', marginRight: '20px'}},
                    D.a({ href: '/?clang=' + languageCode,
                        className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run custom-login-register-btn',
                        // style: {'background': '0 0 ', width: '100px', 'border': '1px solid #f1353d', paddingTop: '10px', paddingBottom: '10px' }
                        style: { color: '#fff',
                            backgroundColor: '#b92525',
                            width: '100px',
                            height: '40px',
                            verticalAlign: 'middle',
                            borderRadius: '8px !important',
                            border: '0',
                            fontSize: '18px !important',
                            lineHeight: '9px',
                            outline: 'none',
                            'WebkitBoxShadow': '0 0 6px 0px white',
                            'MozBoxShadow': '0 0 6px 0px white',
                            'boxShadow': '0 0 6px 0px white'
                        }},
                    languageFlag ? 'Login' : '登陆')
                );

                strTopbarElement_2 = D.li({ className: 'dropdown', style: { marginTop: '15px', marginRight: '20px'}},
                    D.a({ href: '/register/?clang=' + languageCode,
                        className: 'btn btn-circle-3 btn-circle-custom btn-danger btn-small-run custom-login-register-btn',
                        // style: {'background': '0 0', width: '100px', 'border': '1px solid #f1353d', paddingTop: '10px', paddingBottom: '10px' } },
                        style: { color: '#fff',
                            backgroundColor: '#b92525',
                            width: '100px',
                            height: '40px',
                            verticalAlign: 'middle',
                            borderRadius: '8px !important',
                            border: '0',
                            fontSize: '18px !important',
                            lineHeight: '9px',
                            outline: 'none',
                            display: 'none',
                            'WebkitBoxShadow': '0 0 6px 0px white',
                            'MozBoxShadow': '0 0 6px 0px white',
                            'boxShadow': '0 0 6px 0px white'
                        }},
                    languageFlag ? 'Register' : '注册')
                );
            }

            var setLanguageForMobileView = D.a(
                {
                    style: {display: (this.props.isMobileOrSmall) ? 'inline-block' : 'none',
                        textDecoration: 'none',
                        fontWeight: '600',
                        margin: '8px 0 0 6px',
                        float: 'right'},
                    id: 'id_btnLanguageSwitch2'
                },
                D.img(
                    {
                        src: '/img/24x24-icon_' + (languageFlag ? 'english' : 'chinese') + '.svg',
                        style: {verticalAlign: 'top', width: '20px'}
                    }),
                D.span(null, languageFlag ? 'EN' : 'CN')
            );

            if (ghost_handheld_detect) {
                logoutButton = null;
                // strTopbarElement_1 = null;
                strTopbarElement_2 = null;
                strTopbarNotification = null;
                fullScreenElement = null;
            }

            return D.div({className: 'page-header navbar navbar-fixed-top'},
                D.div({className: 'page-header-inner'},
                    D.div({className: 'page-logo'},
                        D.a({href: '/?clang=' + languageCode},
                            D.img({src: '/img/logo.png', 'alt': 'logo', className: 'logo-default'})
                        )
                    ),
                    D.a({className: 'menu-toggler responsive-toggler', 'data-toggle': 'collapse', 'data-target': '.navbar-collapse'}),
                    satoshiElementForMobileView,
                    setLanguageForMobileView,
                    D.div({className: 'page-top'},
                        D.div({className: 'top-menu custom-top-menu', style: {marginLeft: '25px'}},
                            D.ul({className: 'nav navbar-nav'},
                                D.li({ className: 'dropdown dropdown-language', id: 'id_liLanguage' },
                                    D.a({ className: 'dropdown-toggle', 'data-toggle': 'dropdown', 'data-hover': 'dropdown', 'data-close-others': 'true' },
                                        D.img({ alt: '', src: '/img/24x24-icon_' + (languageFlag ? 'english' : 'chinese') + '.svg', width: '20px' }),
                                        D.span({ className: 'langname', style: {marginLeft: '7px', marginRight: '5px'} }, languageFlag ? 'English' : '中文'),
                                        D.i({ className: 'fa fa-angle-down'})
                                    ),
                                    D.ul({ className: 'dropdown-menu', style: {marginLeft: '60px'}},
                                        D.li({className: 'class_liLanguage', 'languageCode': 'en'},
                                            D.a(null, D.span({style: { marginLeft: '3px'}}, languageFlag ? 'English' : 'English'))
                                        ),
                                        D.li({className: 'class_liLanguage', 'languageCode': 'zh'},
                                            D.a(null, D.span({style: { marginLeft: '3px'}}, languageFlag ? '中文' : '中文'))
                                        ),
                                        D.form({'action': '/setLanguage', 'method': 'post', id: 'id_formSetLanguage', 'hidden': 'true'},
                                            D.input({'type': 'hidden', 'name': 'current_url', 'value': ''}),
                                            D.input({'type': 'hidden', 'name': 'language_code', 'value': ''})
                                        )
                                    )
                                ),
                                depositElement,
                                withdrawElement
                            )
                        ),
                        D.div({className: 'top-menu custom-top-menu', style: {float: 'right'}},
                            D.ul({className: 'nav navbar-nav', style: {marginRight: '-16px'}},
                                muteElement1,
                                muteElement2,
                                muteElement3,
                                gamingPoolElement,
                                totalPlayerElement,
                                totalBetElement,
                                strTopbarElement_1,
                                strTopbarNotification,
                                strTopbarElement_2,
                                logoutButton,
                                fullScreenElement
                            )
                        )
                    )
                )
            );
        }
    });
});
