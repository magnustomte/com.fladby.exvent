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

    // Freeway WEB acknowledges function codes 5 and 6 but never passes the
    // write on to the unit. Codes 15 and 16 go through.
    protected get useMultipleWrites(): boolean {
        return true;
    }
}

module.exports = FreewayWebDevice;
