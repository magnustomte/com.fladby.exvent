import { DriverFeatures, EWindDriver } from '../eWindDriver';

class MyEdaDriver extends EWindDriver {
    protected get flowSuffix(): string {
        return '_eda';
    }

    get features(): DriverFeatures {
        return {
            ...super.features,
            ecoMode: false,
            overpressureTiming: true,
            seasonControl: true,
            heatPumpStatus: true,
            serviceReminder: true,
            overpressureSwitch: true,
        };
    }

    async onInit() {
        await super.onInit();
        this.log('MyEdaDriver has been initialized');
    }
}

module.exports = MyEdaDriver;
