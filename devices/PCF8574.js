﻿"use strict";

function create(deviceConfig, i2cAdapter) {
    return new PCF8574(deviceConfig, i2cAdapter);
}

function PCF8574(deviceConfig, i2cAdapter) {
    this.address = deviceConfig.address;
    this.name = deviceConfig.name || 'PCF8574';
    this.hexAddress = i2cAdapter.toHexString(this.address);

    this.config = deviceConfig.PCF8574;

    this.i2cAdapter = i2cAdapter;
    this.adapter = this.i2cAdapter.adapter;

    this.readValue = 0;
    this.writeValue = 0;
}

PCF8574.prototype.start = function () {
    var that = this;
    that.debug('Starting');
    that.adapter.extendObject(that.hexAddress, {
        type: 'device',
        common: {
            name: this.hexAddress + ' (' + this.name + ')',
            role: 'sensor'
        },
        native: that.config
    });

    var hasInput = false;
    for (var i = 0; i < 8; i++) {
        var pinConfig = that.config.pins[i] || { dir: 'out' };
        var isInput = pinConfig.dir == 'in';
        if (isInput) {
            hasInput = true;
            that.writeValue |= 1 << i; // input pins must be set to high level
        } else {
            that.addOutputListener(i);
            var value = that.getStateValue(i);
            if (value === undefined) {
                value = pinConfig.inv === true;
                that.setStateAck(i, value);
            }
            if (pinConfig.inv) {
                value = !value;
            }
            if (!value) {
                that.writeValue |= 1 << i;
            }
        }
        that.adapter.extendObject(that.hexAddress + '.' + i, {
            type: 'state',
            common: {
                name: that.hexAddress + (isInput ? ' Input ' : ' Output ') + i,
                read: isInput,
                write: !isInput,
                type: 'boolean',
                role: isInput ? 'indicator' : 'switch'
            },
            native: pinConfig
        });
    }

    that.debug('Setting initial value to ' + that.i2cAdapter.toHexString(that.writeValue));
    that.sendCurrentValue();

    that.readCurrentValue(true);
    if (hasInput && that.config.pollingInterval && parseInt(that.config.pollingInterval) > 0) {
        that.pollingTimer = setInterval(
            function () { that.readCurrentValue(false); },
            Math.max(50, parseInt(that.config.pollingInterval)));
        that.debug('Polling enabled (' + parseInt(that.config.pollingInterval) + ' ms)');
    }

    if (hasInput && typeof that.config.interrupt === 'string' && that.config.interrupt.length > 0) {
        // check if interrupt object exists
        that.adapter.getObject(that.config.interrupt, function(err, obj) {
            if (err) {
                that.warn('Interrupt object ' + that.config.interrupt + ' not found!');
                return;
            }

            // subscribe to the object and add change listener
            that.adapter.subscribeForeignStates(that.config.interrupt);
            that.i2cAdapter.addForeignStateChangeListener(that.config.interrupt, function (state) {
                that.debug('Interrupt detected');
                that.readCurrentValue(false);
            });

            that.debug('Interrupt enabled');
        });
    }
};

PCF8574.prototype.stop = function () {
    this.debug('Stopping');
    clearInterval(this.pollingTimer);
};

PCF8574.prototype.sendCurrentValue = function () {
    this.debug('Sending ' + this.i2cAdapter.toHexString(this.writeValue));
    try {
        this.i2cAdapter.bus.sendByteSync(this.address, this.writeValue);
    } catch (e) {
        this.error("Couldn't send current value: " + e);
    }
};

PCF8574.prototype.readCurrentValue = function (force) {
    var oldValue = this.readValue;
    try {
        var retries = 3;
        do {
            // writing the current value before reading to make sure the "direction" of all pins is set correctly
            this.i2cAdapter.bus.sendByteSync(this.address, this.writeValue);
            this.readValue = this.i2cAdapter.bus.receiveByteSync(this.address);

            // reading all 1's (0xFF) could be because of a reset, let's try 3x
        } while (!force && this.readValue == 0xFF && --retries > 0);
    } catch (e) {
        this.error("Couldn't read current value: " + e);
        return;
    }

    if (oldValue == this.readValue && !force) {
        return;
    }

    this.debug('Read ' + this.i2cAdapter.toHexString(this.readValue));
    for (var i = 0; i < 8; i++) {
        var mask = 1 << i;
        if (((oldValue & mask) !== (this.readValue & mask) || force) && this.config.pins[i].dir == 'in') {
            var value = (this.readValue & mask) > 0;
            if (this.config.pins[i].inv) {
                value = !value;
            }
            this.setStateAck(i, value);
        }
    }
};

PCF8574.prototype.addOutputListener = function (pin) {
    var that = this;
    that.i2cAdapter.addStateChangeListener(that.hexAddress + '.' + pin, function (oldValue, newValue) { that.changeOutput(pin, newValue); })
};

PCF8574.prototype.changeOutput = function (pin, value) {
    var mask = 1 << pin;
    var oldValue = this.writeValue;
    var realValue = this.config.pins[pin].inv ? !value : value;
    if (realValue) {
        this.writeValue &= ~mask;
    } else {
        this.writeValue |= mask;
    }
    if (this.writeValue == oldValue) {
        return;
    }

    this.sendCurrentValue();
    this.setStateAck(pin, value);
};

PCF8574.prototype.debug = function (message) {
    this.adapter.log.debug('PCF8574 ' + this.address + ': ' + message);
};

PCF8574.prototype.error = function (message) {
    this.adapter.log.error('PCF8574 ' + this.address + ': ' + message);
};

PCF8574.prototype.setStateAck = function (pin, value) {
    return this.i2cAdapter.setStateAck(this.hexAddress + '.' + pin, value);
};

PCF8574.prototype.getStateValue = function (pin) {
    return this.i2cAdapter.getStateValue(this.hexAddress + '.' + pin);
};

module.exports.create = create;
