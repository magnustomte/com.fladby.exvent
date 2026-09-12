import { EWindDevice } from '../eWindDevice';

/**
 * An Enervent unit with EDA automation, reached through a Freeway WEB bus
 * adapter. The adapter bridges Modbus TCP to the unit's RS-485 bus and always
 * presents it on slave ID 1.
 *
 * EDA and the MD automation used by eWind share the register addresses this
 * app reads, so the behaviour is inherited unchanged; only the slave ID and the
 * flow card ids differ.
 */
class FreewayWebDevice extends EWindDevice {
    protected get defaultUnitId(): number {
        return 1;
    }

    protected get logLabel(): string {
        return 'freewayWeb';
    }

    protected get flowSuffix(): string {
        return '_freeway';
    }
}

module.exports = FreewayWebDevice;
