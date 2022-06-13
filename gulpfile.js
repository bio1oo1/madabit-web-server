var gulp = require('gulp');
var requirejs = require('requirejs');
var vinylPaths = require('vinyl-paths');
var del = require('del');
var runSequence = require('run-sequence');
var merge = require('merge-stream');
var es = require('event-stream');
var hash = require('gulp-hash');
var extend = require('gulp-extend');

var production = process.env.NODE_ENV === 'production';
var configJsonPath = './config/build-config.json';

gulp.task('build', function(callback) {
    runSequence(
        'clean:build',

        ['minify-js-main', 'copy:assets'],
        'hash-files',

        callback
    );
});

/** Delete build folder and config file if exist **/
gulp.task('clean:build', function () {
    var buildStream = gulp.src('build')
        .pipe(vinylPaths(del));

    var configStream = gulp.src('config/build-config.json')
        .pipe(vinylPaths(del));

    return merge(buildStream, configStream);
});

/** RequireJS Optimizer options **/
var mainClientOptions = {
    baseUrl: './theme/scripts',
    out: './build/scripts/main.min.js',
    name: '../../node_modules/almond/almond',
    mainConfigFile: './theme/scripts/main.js',
    include: 'main',
    insertRequire: ['main'],
    removeCombined: true,
    optimize: 'uglify2',
    generateSourceMaps: false,
    preserveLicenseComments: false
};

gulp.task('minify-js-main', function(callback)
{
    requirejs.optimize(mainClientOptions, function (buildResponse) {
        callback();
    }, function(err) {
        callback(err);
        console.error('[Error on require optimization]: ', err);
    });
});

/** Copy the files to prod folder **/
gulp.task('copy:assets', function() {
    return gulp.src('theme/**/*.*')
        .pipe(gulp.dest('build/'));
});

/** Hash the config.js and the app.css files  **/
var hashOptions = {
    template: '<%= name %>-<%= hash %><%= ext %>'
};

gulp.task('hash-files', function(callback) {
    runSequence('hash-js-main', callback);
});

gulp.task('hash-js-main', function() {
    return addToManifest(
        gulp.src('./build/scripts/main.min.js')
            .pipe(hash(hashOptions))
            .pipe(gulp.dest('build/scripts'))
    );
});

/** ======================================== Functions ========================================= **/
/** ============================================================================================ **/

// Adds the files in `srcStream` to the manifest file, extending the manifest's current contents.
function addToManifest(srcStream) {
    return es.concat(
        gulp.src(configJsonPath),
        srcStream
            .pipe(hash.manifest(configJsonPath))
    )
        .pipe(extend(configJsonPath, false, 4))
        .pipe(gulp.dest('.'));
}