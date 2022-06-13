/**
 * The code that renders the canvas, its life cycle is managed by Chart.js
 */

define([
    'game-logic/clib',
    'game-logic/stateLib',
    'lodash',
    'game-logic/engine'
], function (
    Clib,
    StateLib,
    _,
    Engine
) {
    var g_objChart = null;

    var g_objDivPayout = null;
    var g_objDivRoundNote = null;

    var g_roundAudioPlaying = false;
    var g_objAudioRoundStart = new Audio('/sounds/roundstart.mp3');

    var aryPitch = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 4000, 8000, 16000];
    var g_nCurPitch = 0;

    var g_prevPayout = null;

    // threshould
    var g_nBezierX = 50;
    var g_nBezierY = 100;
    var g_nMSDiff = 300;

    var g_nMSPre = 0;

    function Graph () {
        this.rendering = false;
        this.animRequest = null;
    }

    Graph.prototype.startRendering = function () {
        this.rendering = true;

        this.animRequest = window.requestAnimationFrame(this.render.bind(this));

        g_objDivPayout = document.getElementById('id_divPayout');
        g_objDivRoundNote = document.getElementById('id_divRoundNote');
        var languageCode = document.getElementById('id_hiddenLanguageCode').value;
        var languageFlag = (languageCode === 'en');

        var options = {
            'type': 'serial',
            'theme': 'dark',
            'marginRight': 80,
            'marginTop': 17,
            'autoMarginOffset': 20,
            'graphs': [{
                'id': 'g1',
                'title': 'Graph title',
                'type': 'smoothedLine',
                'bezierX': g_nBezierX,
                'bezierY': g_nBezierY,
                'lineThickness': 2,
                'title': 'Price',
                'useLineColorForBulletBorder': true,
                'valueField': 'value',
                'lineColor': '#FF671E'
            }],
            'valueAxes': [
                {
                    'title': 'Multiplier',
                    'gridColor': '#FFFFFF',
                    'gridAlpha': 0.2,
                    'dashLength': 0,
                    'axisThickness': 2,
                    'axisColor': '#FFF',
                    'minimum': 1,
                    'includeGuidesInMinMax': true,
                    'includeAllValues': true,
                    'strictMinMax': true
                }
            ],
            'CategoryAxes': [
                {
                    'axisThickness': 2,
                    'axisColor': '#000',
                    'minimum': 0,
                    'strictMinMax': true,
                    'includeAllValues': true,
                    'includeGuidesInMinMax': true
                }
            ],
            'categoryField': 'time'
        };
        if (!languageFlag) options.valueAxes[0].title = '倍数';
        g_objChart = AmCharts.makeChart('id_divChart', options);
    };

    Graph.prototype.stopRendering = function () {
        this.rendering = false;

        window.removeEventListener('resize', this.onWindowResizeBinded);
    };

    Graph.prototype.render = function () {
        if (!this.rendering) { return; }

        this.drawGameData();
        this.animRequest = window.requestAnimationFrame(this.render.bind(this));
    };

    Graph.prototype.drawGameData = function () {
        var languageCode = document.getElementById('id_hiddenLanguageCode').value;
        var languageFlag = (languageCode === 'en');

        // var beijing_time_array = (new Date()).toLocaleString('en-US', {timeZone: 'Asia/Shanghai'}).split(' ');
        // var beijing_time_hour = parseInt(beijing_time_array[1].split(':')[0]);

        if (Engine.gameState === 'IN_PROGRESS') {
            // console.log('GraphicDisplay - Getting Game State IN PROGRESS');
            this.currentTime = Clib.getElapsedTimeWithLag(Engine);
            this.currentGamePayout = Clib.calcGamePayout(this.currentTime);

            // play round-start audio
            if (g_roundAudioPlaying === false && this.currentTime < 100 && enableEtc === true) {
                g_objAudioRoundStart.play();
                g_roundAudioPlaying = true;
            }

            var fCurPayout = parseFloat(this.currentGamePayout);
            var strCurPayout = fCurPayout.toFixed(2);

            if (enableEtc === true) {
                var nPitchCount = aryPitch.length;
                for (var nPitch = g_nCurPitch; nPitch < nPitchCount; nPitch++) {
                    var nCurPitch = aryPitch[nPitch];
                    if (fCurPayout >= nCurPitch && fCurPayout < nCurPitch + 0.05) {
                        var objPitch = new Audio('/sounds/pitch.mp3');
                        objPitch.play();
                        g_nCurPitch = nPitch + 1;
                        break;
                    }
                }
            }

            if (strCurPayout !== g_prevPayout) {
                g_prevPayout = strCurPayout;

                var screen_width = window.innerWidth;
                if (screen_width <= 480) {
                    if (strCurPayout >= 10000) {
                        g_objDivPayout.style.right = '0';
                        var payoutLeft = (screen_width - 240) / 2 + 20;
                        g_objDivPayout.style.left = payoutLeft + 'px';
                    } else if (strCurPayout >= 1000) {
                        g_objDivPayout.style.right = '0';
                        var payoutLeft = (screen_width - 210) / 2 + 20;
                        g_objDivPayout.style.left = payoutLeft + 'px';
                    } else if (strCurPayout >= 100) {
                        g_objDivPayout.style.right = '0';
                        var payoutLeft = (screen_width - 180) / 2 + 20;
                        g_objDivPayout.style.left = payoutLeft + 'px';
                    }
                } else {
                    if (strCurPayout >= 10000) {
                        var payoutHeight = parseFloat(window.getComputedStyle(g_objDivPayout, null).getPropertyValue('height'));
                        var payoutFont = payoutHeight / 17 * 3;
                        var payoutPadding = (payoutHeight - payoutFont) / 9 * 4;
                        g_objDivPayout.style.fontSize = payoutFont + 'px';
                        g_objDivPayout.style.padding = payoutPadding + 'px 1px';
                    } else if (strCurPayout >= 1000) {
                        var payoutHeight = parseFloat(window.getComputedStyle(g_objDivPayout, null).getPropertyValue('height'));
                        var payoutFont = payoutHeight / 14 * 3;
                        var payoutPadding = (payoutHeight - payoutFont) / 10 * 4;
                        g_objDivPayout.style.fontSize = payoutFont + 'px';
                        g_objDivPayout.style.padding = payoutPadding + 'px 1px';
                    } else if (strCurPayout >= 100) {
                        var payoutHeight = parseFloat(window.getComputedStyle(g_objDivPayout, null).getPropertyValue('height'));
                        var payoutFont = payoutHeight / 12 * 3;
                        var payoutPadding = (payoutHeight - payoutFont) / 10 * 4;
                        g_objDivPayout.style.fontSize = payoutFont + 'px';
                        g_objDivPayout.style.padding = payoutPadding + 'px 1px';
                    } else {
                        var payoutHeight = parseFloat(window.getComputedStyle(g_objDivPayout, null).getPropertyValue('height'));
                        var payoutFont = payoutHeight / 10 * 3;
                        var payoutPadding = (payoutHeight - payoutFont) / 8 * 3;
                        g_objDivPayout.style.fontSize = payoutFont + 'px';
                        g_objDivPayout.style.padding = payoutPadding + 'px 1px';
                    }
                }

                if (StateLib.currentlyPlaying(Engine)) { // when user betted
                    g_objDivPayout.style.color = '#7cba00';
                } else {
                    g_objDivPayout.style.color = '#f8f6f6';
                }
                g_objDivPayout.innerHTML = strCurPayout + 'x';

                // console.log('current pay : ', strCurPayout + 'x', '   history : ', Engine.tableHistory[0].game_crash);

                g_objDivRoundNote.innerText = '';

                if (this.currentTime - g_nMSPre < g_nMSDiff) {
                    return;// game server : multiplyer change time
                }
                g_nMSPre = this.currentTime;

                var fStep = this.currentTime / 2500;

                // Graph
                var aryChartData = [];
                var prex = -1, prey = -1;
                g_objChart.dataProvider = aryChartData;

                // var nCntStep = 0;
                for (var t = 0; t <= this.currentTime; t += fStep) {
                    var x = t / 1000;
                    x = x.toFixed(2);
                    var y = Clib.calcGamePayout(t);
                    y = y.toFixed(2);

                    if (x != prex && y != prey) {
                        var aryPos = { time: x, value: y };
                        g_objChart.dataProvider.push(aryPos);

                        prex = x;
                        prey = y;
                        /// ///////////////////////////////////
                        // console.log("Step count : " + nCntStep);
                        // nCntStep = 0;
                    }
                    // else
                    // {
                    //     nCntStep ++;
                    // }
                }

                g_objChart.validateData();
                aryChartData = null;
            }
        }

        // If the engine enters in the room @ ENDED it doesn't have the crash value, so we don't display it
        if (Engine.gameState === 'ENDED') {
            // console.log('GraphicDisplay - Getting Game State ENDED');
            var screen_width = window.innerWidth;
            if (screen_width <= 480) {
                g_objDivPayout.style.right = '0';
                var str_width = 120;
                while (strCrashValue) {
                    strCrashValue /= 10;
                    str_width += 30;
                }
                var payoutLeft = (screen_width - str_width) / 2 + 20;
                g_objDivPayout.style.left = payoutLeft + 'px';
            }

            var strCrashValue = '';
            if (Engine.tableHistory.length != 0) { strCrashValue = Clib.formatDecimals(Engine.tableHistory[0].game_crash / 100, 2); }

            g_objDivPayout.style.color = '#3b3a4d';
            g_objDivPayout.innerHTML = strCrashValue + 'x';

            g_objDivRoundNote.style.color = '#ff5200';

            var strNote = '';
            if (Engine.tableHistory.length != 0) { strNote = languageFlag ? ('Busted @ ' + strCrashValue + 'x') : (' 爆点 @ ' + strCrashValue + 'x'); }

            // if (beijing_time_array[2] == 'AM' && beijing_time_hour >= 2 && beijing_time_hour <= 6)
            if (Engine.maintenance) {
                strNote = languageFlag ? 'Maintenance\n(2 AM-6 AM)' : '维护时间\n（2 AM-6 AM)';
            }

            g_objDivRoundNote.innerText = strNote;

            // audio round-start
            g_roundAudioPlaying = false;
            g_nCurPitch = 0;
            if (g_objAudioRoundStart !== null && enableEtc === true) {
                g_objAudioRoundStart.pause();
                g_objAudioRoundStart.currentTime = 0.0;
            }
        }

        if (Engine.gameState === 'STARTING') {
            // console.log('GraphicDisplay - Getting Game State STARTING');
            g_objDivRoundNote.style.color = '#ff7100';

            var timeLeft = ((Engine.startTime - Date.now()) / 1000).toFixed(1);

            timeLeft = parseFloat(timeLeft);
            if (timeLeft < 0.00) timeLeft = 0.00;
            timeLeft = timeLeft.toFixed(1);

            var strNote = languageFlag ? ('Next round in ' + timeLeft + 's') : ('下一轮进入 ' + timeLeft + '');

            if (Engine.maintenance) {
                strNote = languageFlag ? 'Maintenance\n(2 AM-6 AM)' : '维护时间\n（2 AM-6 AM)';
            }

            g_objDivRoundNote.innerText = strNote;

            g_nMSPre = 0;
            g_objChart.clear();
            g_objChart = null;
            var options = {
                'type': 'serial',
                'theme': 'dark',
                'marginRight': 80,
                'marginTop': 17,
                'autoMarginOffset': 20,
                'graphs': [{
                    'id': 'g1',
                    'type': 'smoothedLine',
                    'lineThickness': 2,
                    'bezierX': g_nBezierX,
                    'bezierY': g_nBezierY,
                    'title': 'Price',
                    'useLineColorForBulletBorder': true,
                    'valueField': 'value',
                    'lineColor': '#FF671E'
                }],
                'valueAxes': [
                    {
                        'title': 'Multiplier',
                        'gridColor': '#FFFFFF',
                        'gridAlpha': 0.2,
                        'dashLength': 0,
                        'axisThickness': 2,
                        'axisColor': '#FFF',
                        'minimum': 1,
                        'includeAllValues': true,
                        'includeGuidesInMinMax': true,
                        'strictMinMax': true
                    }
                ],
                'CategoryAxes': [
                    {
                        'axisThickness': 2,
                        'axisColor': '#FFF',
                        'minimum': 0,
                        'includeAllValues': true,
                        'includeGuidesInMinMax': true,
                        'strictMinMax': true
                    }
                ],
                'categoryField': 'time'
            };
            if (!languageFlag) options.valueAxes[0].title = '倍数';
            g_objChart = AmCharts.makeChart('id_divChart', options);
            /// ///////////////

            var screen_width = window.innerWidth;
            if (screen_width <= 480) {
                g_objDivPayout.style.right = '0';
                var payoutLeft = (screen_width - 120) / 2 + 20;
                g_objDivPayout.style.left = payoutLeft + 'px';
            }

            g_objDivPayout.style.color = '#3b3a4d';
            g_objDivPayout.innerHTML = '1.00x';
        }
    };

    return Graph;
});
