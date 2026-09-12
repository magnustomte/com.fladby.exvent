import { DriverFeatures, EWindDriver } from '../eWindDriver';

class MyFreewayWebDriver extends EWindDriver {
    protected get flowSuffix(): string {
        return '_freeway';
    }

    get features(): DriverFeatures {
        return {
            ...super.features,
            ecoMode: false,
        };
    }

    async onInit() {
        await super.onInit();
        this.log('MyFreewayWebDriver has been initialized');
    }
}

module.exports = MyFreewayWebDriver;
