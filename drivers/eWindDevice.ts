import * as net from 'net';
import * as Modbus from 'jsmodbus';
import { eWind } from './eWind';
import { checkRegister } from './response';
import { checkCoils } from './response_coil';
import type { DriverFeatures } from './eWindDriver';

const RETRY_INTERVAL = 60 * 1000;
const CONNECTION_RETRY_MIN = 5000;
const CONNECTION_RETRY_MAX = 30000;
const WAIT_FOR_CONNECT_TIMEOUT = 10000;
const SOCKET_IDLE_TIMEOUT = 0;

const activeDevices = new Set<EWindDevice>();

/** Unit configuration exposed as a device setting. */
interface UnitSetting {
    kind: 'holding' | 'coil';
    address: number;
    /** Register value per unit of the setting, e.g. 10 for tenths of a degree. */
    scale?: number;
    /** The driver feature that enables the setting. */
    feature: keyof DriverFeatures;
}

/** Keyed by device setting id. The values live on the unit, not in Homey. */
const UNIT_SETTINGS: Record<string, UnitSetting> = {
    overpressure_duration: { kind: 'holding', address: 57, feature: 'overpressureTiming' },
    heating_allowed: { kind: 'coil', address: 54, feature: 'seasonControl' },
    cooling_allowed: { kind: 'coil', address: 52, feature: 'seasonControl' },
    heating_block_temperature: { kind: 'holding', address: 196, scale: 10, feature: 'seasonControl' },
    cooling_block_temperature: { kind: 'holding', address: 164, scale: 10, feature: 'seasonControl' },
};

const CONNECTION_SETTINGS = ['address', 'port', 'unitId'];

/** Registers and coils polled only when their driver feature is on. */
const OPTIONAL_POLL_KEYS: Record<string, keyof DriverFeatures> = {
    eco_mode: 'ecoMode',
    fan_speed_panel: 'heatPumpStatus',
    cooling_status: 'heatPumpStatus',
};

/** Capabilities a device has only when their driver feature is on. */
const OPTIONAL_CAPABILITIES: Record<string, keyof DriverFeatures> = {
    ecomode_mode: 'ecoMode',
    'fanspeed_level.panel': 'heatPumpStatus',
    cooling_active: 'heatPumpStatus',
    defrosting: 'heatPumpStatus',
};

/** Turns a jsmodbus rejection into a reason a user can act on. */
const describeModbusError = (err: any): string => {
    const body = err?.response?.body;
    if (body?.isException) {
        return `Modbus exception ${body.code} (${body.message})`;
    }
    return err?.message ?? String(err);
};

const shutdown = () => {
    for (const device of activeDevices) {
        device.cleanup();
        if (device.socket) {
            device.socket.end();
        }
    }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Shared implementation for Enervent units reached over Modbus TCP.
 *
 * Subclasses supply the per-driver constants below. They are getters rather
 * than fields on purpose: subclass field initialisers run *after* the base
 * class ones, so a field would still be undefined when `modbusOptions` is
 * built.
 */
export class EWindDevice extends eWind {
    /** Modbus unit ID used when the device setting is unset. */
    protected get defaultUnitId(): number {
        return 255;
    }

    /** Label used in Modbus log output. */
    protected get logLabel(): string {
        return 'eWind';
    }

    /**
     * Whether writes must use the "multiple" function codes (15 and 16) instead
     * of the single ones (5 and 6).
     */
    protected get useMultipleWrites(): boolean {
        return false;
    }

    // Instance properties for socket and client
    socket: net.Socket | null = null;
    client: any = null;

    modbusOptions = {
        host: this.getSetting('address'),
        port: this.getSetting('port'),
        unitId: this.getSetting('unitId') || this.defaultUnitId,
        timeout: 5000, // 5000 ms timeout
        autoReconnect: true,
        logLabel: this.logLabel,
        logLevel: 'error',
        logEnabled: true,
    };

    private intervalId: NodeJS.Timeout | null = null;
    private connectionRetryId: NodeJS.Timeout | null = null;
    private capabilityListenersRegistered: boolean = false;
    private pollingInProgress: boolean = false;
    private isActive: boolean = true;
    private skipNextIntervalPoll: boolean = false;
    private pollDebounceTimeout: NodeJS.Timeout | null = null;
    private isConnected: boolean = false;
    private isConnecting: boolean = false;
    private connectingPromise: Promise<void> | null = null;
    private connectionRetryDelay: number = CONNECTION_RETRY_MIN;
    /** Pending writes, chained so they reach the unit one at a time and in order. */
    private writeQueue: Promise<unknown> = Promise.resolve();

    private async markNoConnection() {
        if (!this.isActive) return;
        try {
            await this.setCapabilityValue('lastPollTime', 'No connection');
        } catch (_) {
            // ignore capability write errors when device is unavailable
        }
    }

    /**
     * Guard against acting on stale/deleted devices; Homey returns 404 when a
     * flow or capability change targets a missing device entry.
     */
    isUsable(): boolean {
        return this.isActive && this.getAvailable();
    }

    async onInit() {
        activeDevices.add(this);
        this.isActive = true;
        this.connectSocket();
        this.setCapabilities();
        this.registerCapabilityListeners();

        await this.poll_eWind();
        if (!this.getData() || !this.getData().id) return;
        this.intervalId = setInterval(async () => {
            if (!this.isActive) return;
            if (this.skipNextIntervalPoll) {
                this.skipNextIntervalPoll = false;
                return;
            }
            await this.poll_eWind();
        }, RETRY_INTERVAL);
    }

    attachSocketListeners(socket: net.Socket) {
        socket.setKeepAlive(true);
        socket.setTimeout(SOCKET_IDLE_TIMEOUT);
        socket.on('end', () => {
            if (!this.isActive) return;
            this.isConnected = false;
            this.isConnecting = false;
            this.teardownSocket();
            this.markNoConnection();
            this.retryConnection();
        });
        socket.on('timeout', () => {
            if (!this.isActive) return;
            this.isConnected = false;
            this.isConnecting = false;
            this.teardownSocket();
            this.markNoConnection();
            this.retryConnection();
        });
        socket.on('error', (err: any) => {
            if (!this.isActive) return;
            this.isConnected = false;
            this.isConnecting = false;
            this.teardownSocket();
            this.markNoConnection();
            this.retryConnection();
        });
        socket.on('close', () => {
            if (!this.isActive) return;
            this.isConnected = false;
            this.isConnecting = false;
            this.teardownSocket();
            this.markNoConnection();
            this.retryConnection();
        });
        socket.on('connect', () => {
            if (!this.isActive) return;
            this.isConnected = true;
            this.isConnecting = false;
            this.connectionRetryDelay = CONNECTION_RETRY_MIN;
            this.clearRetryConnection();
        });
        // Only successful poll should update lastPollTime; raw socket data is ignored.
        socket.on('data', () => {});
    }

    connectSocket() {
        if (this.isConnecting && this.connectingPromise) return;
        this.isConnecting = true;
        this.teardownSocket();
        this.socket = new net.Socket();
        this.attachSocketListeners(this.socket);
        this.client = new Modbus.client.TCP(this.socket, this.modbusOptions.unitId);

        this.connectingPromise = new Promise<void>((resolve, reject) => {
            const onConnect = () => {
                resolve();
            };
            const onError = (err: any) => {
                reject(err);
            };
            if (!this.socket) {
                reject(new Error('Socket missing'));
                return;
            }
            this.socket.once('connect', onConnect);
            this.socket.once('error', onError);
            this.socket.connect({
                host: this.modbusOptions.host,
                port: this.modbusOptions.port,
            });
        })
            .catch(() => {
                // Error handled by socket listeners
            })
            .finally(() => {
                this.isConnecting = false;
                this.connectingPromise = null;
            });
    }

    retryConnection() {
        if (!this.isActive) return; // Do not retry if device has been deleted
        if (this.connectionRetryId || this.isConnecting) return;
        this.connectionRetryId = setTimeout(() => {
            if (!this.isActive) return;
            this.connectionRetryId = null;
            this.connectSocket();
            this.connectionRetryDelay = Math.min(CONNECTION_RETRY_MAX, this.connectionRetryDelay * 2 || CONNECTION_RETRY_MIN);
        }, this.connectionRetryDelay);
    }

    clearRetryConnection() {
        if (this.connectionRetryId) {
            clearTimeout(this.connectionRetryId);
            this.connectionRetryId = null;
        }
    }

    teardownSocket() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.end();
            this.socket.destroy();
        }
        this.socket = null;
        this.client = null;
    }

    async ensureConnected() {
        if (!this.isConnected && !this.isConnecting) {
            this.connectSocket();
        }

        if (this.connectingPromise) {
            // Settles whether or not the attempt succeeded
            await this.connectingPromise;
            if (!this.isConnected) {
                throw new Error('could not connect to the ventilation unit');
            }
            return;
        }

        return new Promise<void>((resolve, reject) => {
            const start = Date.now();
            const checkInterval = setInterval(() => {
                if (this.isConnected) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (!this.isActive || Date.now() - start > WAIT_FOR_CONNECT_TIMEOUT) {
                    clearInterval(checkInterval);
                    reject(new Error('Connection timeout'));
                }
            }, 500);
        });
    }

    async poll_eWind() {
        if (!this.isActive) return;
        if (this.pollingInProgress) return;
        this.pollingInProgress = true;

        if (!this.isActive) {
            this.pollingInProgress = false;
            return;
        }

        if (!this.isConnected) {
            this.connectSocket();
            try {
                await this.ensureConnected();
            } catch (err) {
                try {
                    if (this.getAvailable()) {
                        this.setCapabilityValue('lastPollTime', 'No connection');
                    }
                } catch (capErr) {
                    // Ignore capability errors
                }
                this.pollingInProgress = false;
                return;
            }
        }

        try {
            const checkRegisterRes = await checkRegister(this.withEnabledFeatures(this.registers), this.client);
            await this.processResult({ ...checkRegisterRes });
            const checkCoilsRes = await checkCoils(this.withEnabledFeatures(this.coilRegisters), this.client);
            await this.processResult({ ...checkCoilsRes });
            await this.syncUnitSettings();
            if (this.isActive) {
                try {
                    await this.setCapabilityValue(
                        'lastPollTime',
                        new Date().toLocaleString('no-nb', { timeZone: 'CET', hour12: false })
                    );
                } catch (err) {
                    // Ignore errors if device is deleted
                }
            }
        } catch (error) {
            this.isConnected = false;
            this.isConnecting = false;
            this.teardownSocket();
            await this.markNoConnection();
            this.retryConnection();
            if (this.getAvailable()) {
                try {
                    await this.setCapabilityValue('lastPollTime', 'No connection');
                } catch (err) {
                    // Ignore errors if device is deleted
                }
            } else {
                // Device unavailable, skip capability update
            }
        } finally {
            this.pollingInProgress = false;
            // device unavailable, skip capability update
        }
    }

    /** Drops the entries of a register map whose driver feature is off. */
    private withEnabledFeatures(registers: Object): Object {
        return Object.fromEntries(Object.entries(registers).filter(([key]) => {
            const feature = OPTIONAL_POLL_KEYS[key];
            return feature === undefined || this.driver.features[feature];
        }));
    }

    async setEWindValue(value: string) {
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        switch (value) {
            case "0":
                await this.sendCoilRequest(0, false);
                await delay(1000);
                await this.sendCoilRequest(1, false);
                await delay(1000);
                await this.sendCoilRequest(3, false);
                await delay(1000);
                await this.sendCoilRequest(10, false);
                break;
            case "1":
                await this.sendCoilRequest(0, false);
                await delay(1000);
                await this.sendCoilRequest(10, false);
                await delay(1000);
                await this.sendCoilRequest(1, true);
                break;
            case "2":
                await this.sendCoilRequest(0, false);
                await delay(1000);
                await this.sendCoilRequest(10, false);
                await delay(1000);
                await this.sendCoilRequest(3, true);
                break;
            case "3":
                await this.sendCoilRequest(0, false);
                await delay(1000);
                await this.sendCoilRequest(10, true);
                break;
            case "4":
                await this.sendCoilRequest(0, true);
                break;
            default:
                break;
        }
        if (this.isActive) {
            await this.setCapabilityValue('eWindstatus_mode', value);
        }
    }

    private unitSettings(): [string, UnitSetting][] {
        return Object.entries(UNIT_SETTINGS).filter(([, setting]) => this.driver.features[setting.feature]);
    }

    /**
     * Copies unit configuration into the device settings, so a change made on
     * the unit's own panel shows up in Homey. setSettings does not call
     * onSettings, so this never writes back to the unit.
     */
    private async syncUnitSettings() {
        const settings = this.getSettings();
        for (const [key, setting] of this.unitSettings()) {
            try {
                const value = await this.readUnitSetting(setting);
                if (settings[key] !== value) {
                    await this.setSettings({ [key]: value });
                }
            } catch (err) {
                this.error(`Syncing setting ${key} from the unit failed: ${describeModbusError(err)}`);
            }
        }
    }

    private async readUnitSetting(setting: UnitSetting): Promise<number | boolean> {
        if (setting.kind === 'coil') {
            const res = await this.client.readCoils(setting.address, 1);
            return Boolean(res.response.body.valuesAsArray[0]);
        }
        const res = await this.client.readHoldingRegisters(setting.address, 1);
        const raw = res.response.body.valuesAsBuffer.readInt16BE(0);
        return raw / (setting.scale ?? 1);
    }

    private async writeUnitSetting(setting: UnitSetting, value: number | boolean) {
        if (setting.kind === 'coil') {
            await this.sendCoilRequest(setting.address, Boolean(value));
            return;
        }
        // Registers are 16-bit; negative values go out as two's complement
        const raw = Math.round(Number(value) * (setting.scale ?? 1)) & 0xffff;
        await this.sendHoldingRequest(setting.address, raw);
    }

    async sendHoldingRequest(register: number, value: number) {
        await this.write(`holding register ${register}`, value, client => (this.useMultipleWrites
            ? client.writeMultipleRegisters(register, [value])
            : client.writeSingleRegister(register, value)));
    }

    async sendCoilRequest(register: number, value: boolean) {
        await this.write(`coil ${register}`, value, client => (this.useMultipleWrites
            ? client.writeMultipleCoils(register, [value])
            : client.writeSingleCoil(register, value)));
    }

    /**
     * Queues a write and waits for the unit to confirm it.
     *
     * Failures are rethrown so the capability listener or flow card that asked
     * for the change reports them, instead of the change silently reverting at
     * the next poll. A failed write does not hold up the ones queued behind it.
     */
    private write(target: string, value: unknown, send: (client: any) => Promise<unknown>): Promise<void> {
        const result = this.writeQueue.then(async () => {
            try {
                await this.ensureConnected();
                if (!this.client) {
                    throw new Error('no connection to the ventilation unit');
                }
                await send(this.client);
            } catch (err) {
                const reason = describeModbusError(err);
                this.error(`Writing ${value} to ${target} failed: ${reason}`);
                throw new Error(`The ventilation unit did not accept the change: ${reason}`);
            }
        });
        this.writeQueue = result.catch(() => undefined);
        return result;
    }

    async setCapabilities() {
        if (this.hasCapability('efficiency.supplyEff') === false) {
            await this.addCapability('efficiency.supplyEff');
        }
        if (this.hasCapability('efficiency.extractEff') === false) {
            await this.addCapability('efficiency.extractEff');
        }
        if (this.hasCapability('measure_temperature.step') === false) {
            await this.addCapability('measure_temperature.step');
        }
        if (this.hasCapability('measure_temperature.exhaustAir') === false) {
            await this.addCapability('measure_temperature.exhaustAir');
        }
        if (this.hasCapability('measure_temperature.supplyAir') === true) {
            await this.removeCapability('measure_temperature.supplyAir');
        }
        if (this.hasCapability('target_temperature') === true) {
            await this.removeCapability('target_temperature');
        }
        if (this.hasCapability('measure_temperature') === true) {
            await this.removeCapability('measure_temperature');
        }
        if (this.hasCapability('measure_temperature.extractAir') === false) {
            await this.addCapability('measure_temperature.extractAir');
        }
        if (this.hasCapability('measure_temperature.supplyAirHRC') === false) {
            await this.addCapability('measure_temperature.supplyAirHRC');
        }
        for (const [capability, feature] of Object.entries(OPTIONAL_CAPABILITIES)) {
            if (this.driver.features[feature]) {
                if (!this.hasCapability(capability)) await this.addCapability(capability);
            } else if (this.hasCapability(capability)) {
                await this.removeCapability(capability);
            }
        }
        if (this.hasCapability('heater_mode') === false) {
            await this.addCapability('heater_mode');
        }
        if (this.hasCapability('heating_coil_state') === false) {
            await this.addCapability('heating_coil_state');
        }
        if (this.hasCapability('heat_exchanger_mode') === false) {
            await this.addCapability('heat_exchanger_mode');
        }
        if (this.hasCapability('target_temperature.step') === false) {
            await this.addCapability('target_temperature.step');
        }
        if (this.hasCapability('alarm_b.desc') === false) {
            await this.addCapability('alarm_b.desc');
        }
        if (this.hasCapability('measure_humidity.extractAir') === false) {
            await this.addCapability('measure_humidity.extractAir');
        }
        if (this.hasCapability('fanspeed_level') === false) {
            await this.addCapability('fanspeed_level');
        }
        if (this.hasCapability('eWindstatus') === false) {
            await this.addCapability('eWindstatus');
        }
        if (this.hasCapability('eWindstatus_mode') === false) {
            await this.addCapability('eWindstatus_mode');
        }
        if (this.hasCapability('lastPollTime') === false) {
            await this.addCapability('lastPollTime');
        }
        if (this.hasCapability('remaining.filter_days') === true) {
            await this.removeCapability('remaining.filter_days');
        }
    }
    
    protected async onCapabilityChanged(capabilityId: string, value: any) {
        const trigger = (card: string, state: Record<string, unknown> = {}) => this.driver
            .triggerFlow(this, card, state)
            .catch((err: unknown) => this.error(err));

        switch (capabilityId) {
            case 'eWindstatus_mode':
            case 'heat_exchanger_mode':
            case 'heater_mode':
                await trigger(`${capabilityId}_changed`, { mode: value });
                break;
            case 'alarm_b.desc':
                if (value === true) await trigger('alarm_b_triggered');
                break;
            default:
                break;
        }
    }

    registerCapabilityListeners() {
        if (this.capabilityListenersRegistered) return;
    
        this.registerCapabilityListener('eWindstatus_mode', async (value) => {
            if (!this.isUsable()) return;
            await this.setEWindValue(value);
            await this.driver.triggerFlow(this, 'eWindstatus_mode_changed', { mode: value })
                .catch((err: unknown) => this.error(err));
        });
    
        this.registerCapabilityListener('target_temperature.step', async (value) => {
            if (!this.isUsable()) return;
            await this.sendHoldingRequest(135, value * 10);
        });
    
        if (this.driver.features.ecoMode) {
            this.registerCapabilityListener('ecomode_mode', async (value) => {
                if (!this.isUsable()) return;
                await this.sendCoilRequest(40, value === '1');
            });
        }
    
        this.registerCapabilityListener('heating_coil_state', async (value) => {
            if (!this.isUsable()) return;
            const coilValue = (value === true || value === '1' || value === 'true')
                ? true
                : (value === false || value === '0' || value === 'false')
                    ? false
                    : null;
            if (coilValue !== null) {
                await this.sendCoilRequest(54, coilValue);
            } else {
                // Invalid heater value; ignore
            }
        });
    
        this.capabilityListenersRegistered = true;
    }
    
    cleanup() {
        activeDevices.delete(this);
        this.isActive = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.pollDebounceTimeout) {
            clearTimeout(this.pollDebounceTimeout);
            this.pollDebounceTimeout = null;
        }
        if (this.connectionRetryId) {
            clearTimeout(this.connectionRetryId);
            this.connectionRetryId = null;
        }
        this.connectingPromise = null;
        this.capabilityListenersRegistered = false;
        this.teardownSocket();
    }
    
    async setMode(mode: string, value: string): Promise<void> {
        if (!this.getAvailable()) return;
        await this.setCapabilityValue(mode, value);
    }
    
    async onAdded() {
        setTimeout(async () => {
            if (this.isActive) await this.poll_eWind();
        }, 10000);
    }
    
    async onSettings({ newSettings, changedKeys }: { newSettings: Record<string, any>; changedKeys: string[] }) {
        if (changedKeys.some(key => CONNECTION_SETTINGS.includes(key))) {
            try {
                this.modbusOptions.host = newSettings.address;
                this.modbusOptions.port = newSettings.port;
                this.modbusOptions.unitId = newSettings.unitId || this.defaultUnitId;
                this.teardownSocket();
                this.connectionRetryDelay = CONNECTION_RETRY_MIN;
                await this.delay(1000);
                this.connectSocket();
                await this.ensureConnected();
                await this.poll_eWind();
            } catch (error: any) {
                // Ignore reconnect error
                if (this.isActive) {
                    await this.setCapabilityValue('lastPollTime', 'No connection');
                }
            }
        }

        // A failed write throws, and Homey then refuses to save the settings
        for (const [key, setting] of this.unitSettings()) {
            if (changedKeys.includes(key)) {
                await this.writeUnitSetting(setting, newSettings[key]);
            }
        }
    }
    
    async onUninit() {
        this.cleanup();
    }

    async onDeleted() {
        this.cleanup();
    }
    
    delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
