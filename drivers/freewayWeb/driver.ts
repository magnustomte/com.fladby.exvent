import { EWindDriver } from '../eWindDriver';

class MyFreewayWebDriver extends EWindDriver {
    protected get flowSuffix(): string {
        return '_freeway';
    }

    get supportsEcoMode(): boolean {
        return false;
    }

    async onInit() {
        await super.onInit();
        this.log('MyFreewayWebDriver has been initialized');
    }
}

module.exports = MyFreewayWebDriver;
