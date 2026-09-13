import { EWindDevice } from '../eWindDevice';

/**
 * An Enervent unit with EDA automation, reached over Modbus TCP, normally
 * through a Freeway WEB bus adapter, which presents the unit on slave ID 1.
 *
 * EDA and the MD automation used by eWind share the register addresses this
 * app reads, so the behaviour is inherited; only the slave ID and the Modbus
 * function codes used for writing differ.
 */
class EdaDevice extends EWindDevice {
    protected get defaultUnitId(): number {
        return 1;
    }

    protected get logLabel(): string {
        return 'eda';
    }

    // Freeway WEB acknowledges function codes 5 and 6 but never passes the
    // write on to the unit. Codes 15 and 16 go through.
    protected get useMultipleWrites(): boolean {
        return true;
    }
}

module.exports = EdaDevice;
