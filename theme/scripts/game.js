define([
    'react',
    'components/Game',
    'mousetrap'
], function (
    React,
    GameClass,
    Mousetrap
) {
    var Game = React.createFactory(GameClass);

    // Mousetrap.bind('backspace', function (e) {
    //     if (!confirm('{{=it.translation.gameplay_alert7}}')) {
    //         if (e.preventDefault) {
    //             e.preventDefault();
    //         } else {
    //             // internet explorer
    //             e.returnValue = false;
    //         }
    //     }
    // });

    React.render(
        Game(),
        document.getElementById('game-container')
    );
});
