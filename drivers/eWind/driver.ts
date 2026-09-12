import { EWindDriver } from '../eWindDriver';

class MyeWindDriver extends EWindDriver {
    async onInit() {
        await super.onInit();
        this.log('MyeWindDriver has been initialized');
    }
}

module.exports = MyeWindDriver;
