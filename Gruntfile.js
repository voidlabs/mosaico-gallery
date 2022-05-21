"use strict";
var path = require('path');

module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  var pkg = grunt.file.readJSON("package.json");

  grunt.initConfig({

    pkg: pkg,

    pkgVersion: "<%= pkg.version %>",

    watch: {
      web: {
        options: {
          livereload: 29008
        },
        files: ['*.html', '*.js', '*.css'],
      },
      express: {
        files: [ 'backend/*.js', '.env', 'package.json' ],
        tasks: [ 'express:dev' ],
        options: {
          spawn: false // for grunt-contrib-watch v0.5.0+, "nospawn: true" for lower versions. Without this option specified express won't be reloaded
        }
      }
    },

    express: {
      dev: {
        options: {
          script: 'backend/main.js',
          background: true,
          port: 9008,
        }
      }
    },

  });

  grunt.registerTask('default', ['express:dev', 'watch', 'keepalive']);

};