﻿/* jshint -W097 */ // no "use strict" warnings
/* jshint -W061 */ // no "eval" warnings
/* jslint node: true */
"use strict";

// always required: utils
var utils = require('@iobroker/adapter-core');

// other dependencies:
var i2c = require('i2c-bus');

function I2CAdapter()
{
    var that = this;

    // private fields
    that._deviceHandlers = {};
    that._stateChangeListeners = {};
    that._foreignStateChangeListeners = {};
    that._currentStateValues = {};
    that._deviceFactories = {};

    // public fields
    that.bus = null;
    that.adapter = utils.Adapter('i2c'); // create the adapter object

    // register event handlers
    that.adapter.on('ready', function () {
        that.onReady();
    });
    that.adapter.on('stateChange', function (id, state) {
        that.onStateChange(id, state);
    });
    that.adapter.on('message', function (obj) {
        that.onMessage(obj);
    });
    that.adapter.on('unload', function (callback) {
        that.onUnload(callback);
    });
}

I2CAdapter.prototype.main = function () {
    var that = this;
    that.bus = i2c.openSync(that.adapter.config.busNumber);

    if (!that.adapter.config.devices || that.adapter.config.devices.length === 0) {
        // no devices configured, nothing to do in this adapter
        return;
    }

    for (var i = 0; i < that.adapter.config.devices.length; i++) {
        var deviceConfig = that.adapter.config.devices[i];
        if (!deviceConfig.type || (!deviceConfig.address && deviceConfig.address !== 0)) {
            continue;
        }

        try {
            if (!that._deviceFactories[deviceConfig.type]) {
                that._deviceFactories[deviceConfig.type] = require(__dirname + '/devices/' + deviceConfig.type);
            }
            that._deviceHandlers[deviceConfig.address] = that._deviceFactories[deviceConfig.type].create(deviceConfig, that);
            that.adapter.log.info('Created ' + deviceConfig.type + ' for address ' + that.toHexString(deviceConfig.address));
        } catch (e) {
            that.adapter.log.warn("Couldn't create " + deviceConfig.type + ' for address ' + that.toHexString(deviceConfig.address) + ': ' + e);
        }
    }

    for (var address in that._deviceHandlers) {
        that._deviceHandlers[address].start();
    }

    that.adapter.subscribeStates('*');
};

I2CAdapter.prototype.searchDevices = function (busNumber, callback) {
    var that = this;
    busNumber = parseInt(busNumber);

    if (busNumber == that.adapter.config.busNumber) {
        that.adapter.log.debug('Searching on current bus ' + busNumber);
        that.bus.scan(callback);
    } else {
        that.adapter.log.debug('Searching on new bus ' + busNumber);
        var searchBus = i2c.open(busNumber, function (err) {
            if (err) {
                callback(err);
            } else {
                searchBus.scan(function (err, result) {
                    searchBus.close(function () {
                        callback(err, result);
                    });
                });
            }
        });
    }
};

I2CAdapter.prototype.addStateChangeListener = function (id, listener) {
    this._stateChangeListeners[this.adapter.namespace + '.' + id] = listener;
};

I2CAdapter.prototype.addForeignStateChangeListener = function (id, listener) {
    this._foreignStateChangeListeners[id] = listener;
};

I2CAdapter.prototype.setStateAck = function (id, value) {
    this._currentStateValues[this.adapter.namespace + '.' + id] = value;
    this.adapter.setState(id, {val: value, ack: true});
};

I2CAdapter.prototype.getStateValue = function (id) {
    return this._currentStateValues[this.adapter.namespace + '.' + id];
};

I2CAdapter.prototype.toHexString = function (value, length) {
    length = length || 2;
    var str = parseInt(value).toString(16).toUpperCase();
    while (str.length < length) {
        str = '0' + str;
    }
    return '0x' + str;
};

// startup
I2CAdapter.prototype.onReady = function () {
    var that = this;
    that.adapter.getStates('*', function (err, states) {
        for (var id in states) {
            if (states[id] && states[id].ack) {
                that._currentStateValues[id] = states[id].val;
            }
        }

        that.main();
    });
};

// is called if a subscribed state changes
I2CAdapter.prototype.onStateChange = function (id, state) {
    // Warning: state can be null if it was deleted!
    if (!id || !state) {
        return;
    }

    this.adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    // foreign states
    if (this._foreignStateChangeListeners.hasOwnProperty(id)) {
      this._foreignStateChangeListeners[id](state.val);
      return;
    }

    if (state.ack) {
        return;
    }

    if (!this._stateChangeListeners.hasOwnProperty(id)) {
        this.adapter.log.error('Unsupported state change: ' + id);
        return;
    }

    this._stateChangeListeners[id](this._currentStateValues[id], state.val);
};

// New message arrived. obj is array with current messages
I2CAdapter.prototype.onMessage = function (obj) {
    var that = this;
    var wait = false;
    if (obj) {
        switch (obj.command) {
            case 'search':
                that.searchDevices(obj.message, function (err, res) {
                    var result = JSON.stringify(res || []);
                    if (err) {
                        that.adapter.log.error('Search failed: ' + err);
                    } else {
                        that.adapter.log.info('Search found: ' + result);
                    }
                    if (obj.callback) {
                        that.adapter.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                });
                wait = true;
                break;

            case 'read':
                if (typeof obj.message !== 'object' || typeof obj.message.address !== 'number') {
                    that.adapter.log.error('Invalid read message');
                    return false;
                }
                var buf = Buffer.alloc(obj.message.bytes || 1);
                try {
                    if (typeof obj.message.register === 'number') {
                        that.bus.readI2cBlockSync(obj.message.address, obj.message.register, buf.length, buf);
                    } else {
                        that.bus.i2cReadSync(obj.message.address, buf.length, buf);
                    }
                    if (obj.callback) {
                        that.adapter.sendTo(obj.from, obj.command, buf, obj.callback);
                    }
                    wait = true;
                } catch (e) {
                  that.adapter.log.error('Error reading from ' + that.toHexString(obj.message.address));
                }
                break;

            case 'write':
                if (typeof obj.message !== 'object' || typeof obj.message.address !== 'number' || !Buffer.isBuffer(obj.message.data)) {
                    that.adapter.log.error('Invalid write message');
                    return false;
                }
                try {
                    if (typeof obj.message.register === 'number') {
                        that.bus.writeI2cBlockSync(obj.message.address, obj.message.register, obj.message.data.length, obj.message.data);
                    } else {
                        that.bus.i2cWriteSync(obj.message.address, obj.message.data.length, obj.message.data);
                    }
                    if (obj.callback) {
                        that.adapter.sendTo(obj.from, obj.command, obj.message.data, obj.callback);
                    }
                    wait = true;
                } catch (e) {
                  that.adapter.log.error('Error writing to ' + that.toHexString(obj.message.address));
                }
                break;
            default:
                that.adapter.log.warn("Unknown command: " + obj.command);
                break;
        }
    }
    if (!wait && obj.callback) {
        that.adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
    }
    return true;
};

// unloading
I2CAdapter.prototype.onUnload = function (callback) {
    for (var address in this._deviceHandlers) {
        this._deviceHandlers[address].stop();
    }

    if (this.bus) {
        this.bus.close(callback);
    } else {
        callback();
    }
};

new I2CAdapter();
