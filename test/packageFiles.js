'use strict';
const path = require('node:path');
const { tests } = require('@iobroker/testing');

// Run package file tests
tests.packageFiles(path.join(__dirname, '..'));
