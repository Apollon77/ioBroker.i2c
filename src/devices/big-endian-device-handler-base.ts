import { I2CDeviceConfig, ImplementationConfigBase } from '../lib/adapter-config';
import { I2cAdapter } from '../main';
import { DeviceHandlerBase } from './device-handler-base';

function swapWord(value: number): number {
    return ((value >> 8) & 0xff) | ((value << 8) & 0xff00);
}

export abstract class BigEndianDeviceHandlerBase<T extends ImplementationConfigBase> extends DeviceHandlerBase<T> {
    private address: number;

    constructor(deviceConfig: I2CDeviceConfig, adapter: I2cAdapter) {
        super(deviceConfig, adapter);

        this.address = deviceConfig.address;
    }

    protected async readWord(command: number): Promise<number> {
        const word = await this.adapter.i2cBus.readWord(this.address, command);
        return swapWord(word);
    }

    protected async writeWord(command: number, word: number): Promise<void> {
        word = swapWord(word);
        return await this.adapter.i2cBus.writeWord(this.address, command, word);
    }
}
