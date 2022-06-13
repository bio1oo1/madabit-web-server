define([
    'react',
    'game-logic/clib',
    'autolinker',
    'stores/ChatStore',
    'actions/ChatActions',
    'stores/GameSettingsStore',
    'game-logic/chat',
    'components/ChatChannelSelector'
], function (
    React,
    Clib,
    Autolinker,
    ChatStore,
    ChatActions,
    GameSettingsStore,
    ChatEngine,
    ChatChannelSelectorClass
) {
    // Overrides Autolinker.js' @username handler to instead link to
    // user profile page.
    var replaceUsernameMentions = function (autolinker, match) {
        // Use default handler for non-twitter links
        if (match.getType() !== 'twitter') return true;

        var username = match.getTwitterHandle();
        return '<a href="/user/' + username + '" target="_blank">@' + username + '</a>';
    };

    var escapeHTML = (function () {
        var entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return function (str) {
            return String(str).replace(/[&<>"']/g, function (s) {
                return entityMap[s];
            });
        };
    })();

    var D = React.DOM;

    var ChatChannelSelector = React.createFactory(ChatChannelSelectorClass);

    /* Constants */
    var SCROLL_OFFSET = 120;

    function getState (evName) {
        var state = ChatStore.getState();
        state.ignoredClientList = GameSettingsStore.getIgnoredClientList();
        state.evName = evName;
        return state;
    }

    return React.createClass({
        displayName: 'Chat',

        propTypes: {
            isMobileOrSmall: React.PropTypes.bool.isRequired
        },

        getInitialState: function () {
            /* Avoid scrolls down if a render is not caused by length chat change */
            this.listLength = ChatEngine.history.length;

            return getState();
        },

        componentDidMount: function () {
            ChatEngine.on('all', this._onChange); // Use all events
            ChatStore.addChangeListener(this._onChange); // Use all events
            GameSettingsStore.addChangeListener(this._onChange); // Not using all events but the store does not emits a lot

            // If messages are rendered scroll down to the bottom
            // var g_objDivChat = document.getElementById('id_divChatScroller');
            // g_objDivChat.scrollTop = g_objDivChat.scrollHeight;
            if (this.refs.messages) {
                var msgsNode = this.refs.messages.getDOMNode().parentElement;
                msgsNode.scrollTop = msgsNode.scrollHeight;
            }
        },

        componentWillUnmount: function () {
            ChatEngine.off('all', this._onChange);
            ChatStore.removeChangeListener(this._onChange);
            GameSettingsStore.removeChangeListener(this._onChange);

            var height = this.refs.messages.getDOMNode().style.height;
            ChatActions.setHeight(height);
        },

        /** If the length of the chat changed and the scroll position is near bottom scroll to the bottom **/
        componentDidUpdate: function (prevProps, prevState) {
            if (this.state.evName === 'joined') { // On join scroll to the bottom
                var msgsNode = this.refs.messages.getDOMNode().parentElement;
                msgsNode.scrollTop = msgsNode.scrollHeight;
            } else if (ChatEngine.history.length != this.listLength) { // If there is a new message scroll to the bottom if is near to it
                this.listLength = ChatEngine.history.length;

                // If messages are rendered scroll down
                if (this.refs.messages) {
                    var msgsBox = this.refs.messages.getDOMNode().parentElement;
                    // var scrollBottom = msgsBox.scrollHeight-msgsBox.offsetHeight-msgsBox.scrollTop; //Bio

                    // if(scrollBottom < SCROLL_OFFSET) //blocked by Bio
                    msgsBox.scrollTop = msgsBox.scrollHeight;
                    msgsBox.nextSibling.style.top = '270px';
                }
            }
        },

        _onChange: function (evName) {
            if (this.isMounted()) { this.setState(getState(evName)); }
        },

        _sendMessage: function (e) {
            if (e.keyCode == 13) {
                // var msg = this.state.inputText;
                var msg = e.target.value;
                msg = msg.trim();

                if (!this._doCommand(msg)) { // If not command was done is a message(or command) to the server
                    if (msg.length >= 1 && msg.length < 500) {
                        this._say(msg);
                        e.target.value = '';
                    }
                } else { // If a command was done erase the command text
                    e.target.value = '';
                }
            }
        },

        _clickSendButton: function () {
            e = document.getElementById('id_edtMsg');
            var msg = e.value;
            msg = msg.trim();

            if (!this._doCommand(msg)) { // If not command was done is a message(or command) to the server
                if (msg.length >= 1 && msg.length < 500) {
                    this._say(msg);
                    e.value = '';
                }
            } else { // If a command was done erase the command text
                e.value = '';
            }
        },

        // Returns true if a command was done, false if not
        _doCommand: function (msg) {
            // Check if is command
            var cmdReg = /^\/([a-zA-z]*)\s*(.*)$/;
            var cmdMatch = msg.match(cmdReg);

            if (!cmdMatch) { return; }

            var cmd = cmdMatch[1];
            var rest = cmdMatch[2];

            switch (cmd) {
                case 'ignore':

                    if (ChatEngine.username === rest) {
                        ChatActions.showClientMessage('Cant ignore yourself');
                    } else if (Clib.isInvalidUsername(rest)) {
                        ChatActions.showClientMessage('Invalid Username');
                    } else if (!this.state.ignoredClientList.hasOwnProperty(rest.toLowerCase())) {
                        ChatActions.ignoreUser(rest);
                        ChatActions.showClientMessage('User ' + rest + ' ignored');
                    } else { ChatActions.showClientMessage('User ' + rest + ' was already ignored'); }

                    return true;

                case 'unignore':

                    if (Clib.isInvalidUsername(rest)) {
                        ChatActions.showClientMessage('Invalid Username');
                    } else if (this.state.ignoredClientList.hasOwnProperty(rest.toLowerCase())) {
                        ChatActions.approveUser(rest);
                        ChatActions.showClientMessage('User ' + rest + ' approved');
                    } else { ChatActions.showClientMessage('User ' + rest + ' was already approved'); }

                    return true;

                case 'ignored':
                    ChatActions.listMutedUsers(this.state.ignoredClientList);
                    return true;

                default:
                    return false;
            }
        },

        _say: function (msg) {
            ChatActions.say(msg);
        },

        _selectChannel: function (channelName) {
            ChatActions.selectChannel(channelName);
        },

        render: function () {
            var languageCode = document.getElementById('id_hiddenLanguageCode').value;
            var languageFlag = (languageCode == 'en');

            /** If the chat is disconnected render a spinner **/
            if (ChatEngine.state === 'DISCONNECTED') {
                return D.div({ className: 'portlet light', style: {'padding': '0px', 'marginBottom': '0'}},
                    D.div({ className: 'portlet-body'},
                        D.div({id: 'id_divChatBox', className: 'scroller', style: {'height': '400px'}, 'data-always-visible': '1', 'data-rail-visible1': '1'},
                            D.div({ className: 'chat-form'},
                                D.div({ className: 'input-cont'},
                                    D.input({ className: 'form-control', 'disabled': true, 'type': 'text', 'placeholder': (languageCode === 'en' ? 'Disconnected' : '断线')})
                                ),
                                D.div({ className: 'btn-cont', 'disabled': true},
                                    D.span({ className: 'arrow', 'disabled': true}),
                                    D.a({className: 'btn blue icn-only', 'disabled': true, style:{boxShadow:'none'}},
                                        D.i({ className: 'far fa-comment', 'disabled': true})
                                    )
                                )
                            )
                        )
                    )
                );
            }

            /** If is joining a channel render a spinner inside the chat list **/
            var chatMessagesContainer;
            if (ChatEngine.state == 'JOINED') {
                var messages = [];
                for (var i = ChatEngine.history.length - 1; i >= 0; i--) {
                    messages.push(this._renderMessage(ChatEngine.history[i], i));
                }

                chatMessagesContainer = D.ul({ className: 'chats', ref: 'messages' }, messages);

            } else {
                chatMessagesContainer = 'Joinning';
            }

            /** Chat input is enabled when logged and joined **/
            var edtInput, btnSend;
            if (ChatEngine.username && ChatEngine.state == 'JOINED') {
                var options = {
                    id: 'id_edtMsg',
                    className: 'form-control',
                    onKeyDown: this._sendMessage,
                    // onChange: this._updateInputText,
                    // value: this.state.inputText,
                    maxLength: '500',
                    ref: 'input',
                    'type': 'text',
                    'placeholder': 'Type a message here...'
                };
                if (!languageFlag) options['placeholder'] = '正在输入中...';
                edtInput = D.input(options);

                btnSend = D.div({ className: 'btn-cont' },
                    D.span({ className: 'arrow'}),
                    D.a({className: 'btn blue icn-only', onClick: this._clickSendButton },
                        D.i({ className: 'fa fa-check icon-white'})
                    )
                );
            } else {
                edtInput = D.input(
                    {
                        id: 'id_edtMsg',
                        className: 'form-control',
                        ref: 'input',
                        placeholder: languageFlag ? 'Log in to chat...' : '登录聊天...',
                        disabled: true
                    });

                btnSend = D.div({ className: 'btn-cont', 'disabled': 'disabled' },
                    D.span({ className: 'arrow', 'disabled': 'disabled'}),
                    D.a({className: 'btn blue icn-only', 'disabled': 'disabled'},
                        D.i({ className: 'fa fa-check icon-white', 'disabled': 'disabled'})
                    )
                );
            }

            return D.div({ className: 'portlet light', style: {'padding': '0px', 'marginBottom': '0'}},
                D.div({ className: 'portlet-body', id: 'chats'},
                    D.div({id: "id_divChatBox", className: 'scroller', style: {'height': '300px'}, 'data-always-visible': '1', 'data-rail-visible1': '1'},
                        chatMessagesContainer
                    ),
                    D.div({ className: 'chat-form'},
                        D.div({ className: 'input-cont'},
                            edtInput
                        ),
                        btnSend
                    )
                )
            );
        },

        _renderMessage: function (message, index) {

            var current_time = new Date();
            var imgAppendStr = current_time.getFullYear()+current_time.getMonth()+current_time.getDate() + current_time.getHours() + current_time.getMinutes();

            switch (message.type) {
                case 'say':
                // If the user is in the ignored client list do not render the message
                    if (this.state.ignoredClientList.hasOwnProperty(message.username.toLowerCase())) { return; }

                    var username = ChatEngine.username;
                    var r = new RegExp('@' + username + '(?:$|[^a-z0-9_\-])', 'i');

                    var bIn = true;
                    if (message.username == username) {
                        bIn = false;
                    }

                    var strImagePath = '/img/photos/' + message.username + '.jpg?v=' + imgAppendStr;
                    var msgDate = new Date(message.date);
                    var timeString = '  ' + msgDate.getHours() + ':' + ((msgDate.getMinutes() < 10) ? ('0' + msgDate.getMinutes()) : msgDate.getMinutes()) + ' ';

                    if (bIn) {
                        return D.li({ className: 'in'},
                            D.img({ className: 'avatar', src: strImagePath }),
                            D.div({ className: 'message'},
                                D.span({ className: 'arrow'}),
                                D.a({className: 'name'}, message.username),
                                D.span({ className: 'datetime'}, timeString),
                                D.span({ className: 'body'}, message.message)
                            )
                        );
                    }

                    return D.li({ className: 'out'},
                        D.img({ className: 'avatar', 'src': strImagePath }),
                        D.div({ className: 'message'},
                            D.span({ className: 'arrow'}),
                            D.a({className: 'name'}, message.username),
                            D.span({ className: 'datetime'}, timeString),
                            D.span({ className: 'body'}, message.message)
                        )
                    );

                    // case 'mute':
                    //     pri = 'msg-mute-message';
                    //     return D.li({ className: pri , key: 'msg' + index },
                    //         D.a({ href: '/user/' + message.moderator,
                    //                 target: '_blank'
                    //             },
                    //             '*** <'+message.moderator+'>'),
                    //         message.shadow ? ' shadow muted ' : ' muted ',
                    //         D.a({ href: '/user/' + message.username,
                    //                 target: '_blank'
                    //             },
                    //             '<'+message.username+'>'),
                    //         ' for ' + message.timespec);
                    // case 'unmute':
                    //     pri = 'msg-mute-message';
                    //     return D.li({ className: pri , key: 'msg' + index },
                    //         D.a({ href: '/user/' + message.moderator,
                    //                 target: '_blank'
                    //             },
                    //             '*** <'+message.moderator+'>'),
                    //         message.shadow ? ' shadow unmuted ' : ' unmuted ',
                    //         D.a({ href: '/user/' + message.username,
                    //                 target: '_blank'
                    //             },
                    //             '<'+message.username+'>')
                    //     );

                case 'error':
                case 'info':
                case 'client_message':
                    if (this.state.ignoredClientList.hasOwnProperty(message.username.toLowerCase())) { return; }

                    var strImagePath = '/img/photos/admin.jpg?v=' + imgAppendStr;
                    var msgDate = new Date(message.date);
                    var timeString = '  ' + msgDate.getHours() + ':' + ((msgDate.getMinutes() < 10) ? ('0' + msgDate.getMinutes()) : msgDate.getMinutes()) + ' ';

                    return D.li({ className: 'in'},
                        D.img({ className: 'avatar', 'src': strImagePath }),
                        D.div({ className: 'message'},
                            D.span({ className: 'arrow'}),
                            D.a({className: 'name', style: {color: '#942d00'}}, '*** ADMINISTRATOR ***'),
                            D.span({ className: 'datetime'}, timeString),
                            D.span({ className: 'body'}, message.message)
                        )
                    );

                default:
                    break;
            }
        }
    });
});
