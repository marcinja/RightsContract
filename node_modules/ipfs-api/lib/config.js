'use strict';

var pkg = require('../package.json');

exports = module.exports = function () {
  return {
    'api-path': '/api/v0/',
    'user-agent': '/node-' + pkg.name + '/' + pkg.version + '/',
    host: 'localhost',
    port: '5001',
    protocol: 'http'
  };
};