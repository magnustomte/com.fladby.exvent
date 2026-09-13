import Homey from 'homey';

/** What a driver's units support beyond the register map they all share. */
export interface DriverFeatures {
    /** Eco mode, coil 40. Exists on MD automation; the coil is reserved on EDA. */
    ecoMode: boolean;
    /** Overpressure duration as a device setting, holding register 57. */
    overpressureTiming: boolean;
    /**
     * Heating and cooling allowed (coils 54 and 52) and the outdoor temperatures
     * that block them (holding registers 196 and 164), as device settings.
     */
    seasonControl: boolean;
    /**
     * What the unit overrides on its own, which matters on heat pump units: the
     * fan level set on the panel next to the level in effect, defrosting, and
     * cooling in operation.
     */
    heatPumpStatus: boolean;
    /** Service reminder on or off (coil 49) and its interval (holding register 538), as device settings. */
    serviceReminder: boolean;
}

/**
 * Shared driver for Enervent units that use the eWind register map.
 *
 * Flow cards are app-global objects that accept a single run listener, so they
 * are registered once here rather than by every device. Each listener acts on
 * the device the Flow selected, `args.device`.
 */
export class EWindDriver extends Homey.Driver {
    /** Suffix distinguishing this driver's flow card ids from the other drivers'. */
    protected get flowSuffix(): string {
        return '';
    }

    get features(): DriverFeatures {
        return {
            ecoMode: true,
            overpressureTiming: false,
            seasonControl: false,
            heatPumpStatus: false,
            serviceReminder: false,
        };
    }

    async onInit() {
        this.registerFlowCards();
    }

    /**
     * Fires one of this driver's device trigger cards. `state` is compared with
     * the arguments the user picked on the card, so pass the new value.
     */
    async triggerFlow(device: Homey.Device, card: string, state: Record<string, unknown> = {}) {
        await this.homey.flow.getDeviceTriggerCard(this.cardId(card)).trigger(device, {}, state);
    }

    async onPairListDevices() {
        return [];
    }

    private cardId(card: string): string {
        return `${card}${this.flowSuffix}`;
    }

    private registerFlowCards() {
        const { flow } = this.homey;

        if (this.features.ecoMode) {
            flow.getActionCard(this.cardId('ecomode')).registerRunListener(async (args: any) => {
                if (!args.device.isUsable()) return false;
                await args.device.setMode('ecomode_mode', args.ecomode);
                await args.device.sendCoilRequest(40, args.ecomode === '1');
            });
        }

        flow.getActionCard(this.cardId('heatingcoil')).registerRunListener(async (args: any) => {
            if (!args.device.isUsable()) return false;
            await args.device.setMode('heating_coil_state', args.heatingcoil);
            if (this.features.seasonControl) {
                // Also updates the "heating allowed" device setting straight away
                await args.device.setUnitSetting('heating_allowed', args.heatingcoil === '1');
            } else {
                await args.device.sendCoilRequest(54, args.heatingcoil === '1');
            }
        });

        flow.getActionCard(this.cardId('status-mode')).registerRunListener(async (args: any) => {
            if (!args.device.isUsable()) return false;
            await args.device.setMode('eWindstatus_mode', args.mode);
            await args.device.setEWindValue(args.mode);
        });

        flow.getActionCard(this.cardId('set-temperature')).registerRunListener(async (args: any) => {
            if (!args.device.isUsable()) return false;
            await args.device.setCapabilityValue('target_temperature.step', args.temperature);
            await args.device.sendHoldingRequest(135, args.temperature * 10);
        });

        if (this.features.overpressureTiming) {
            flow.getActionCard(this.cardId('set-overpressure-duration')).registerRunListener(async (args: any) => {
                if (!args.device.isUsable()) return false;
                await args.device.setUnitSetting('overpressure_duration', args.minutes);
            });
        }

        if (this.features.seasonControl) {
            flow.getActionCard(this.cardId('set-cooling')).registerRunListener(async (args: any) => {
                if (!args.device.isUsable()) return false;
                await args.device.setUnitSetting('cooling_allowed', args.allowed === '1');
            });
            flow.getActionCard(this.cardId('set-heating-block-temperature')).registerRunListener(async (args: any) => {
                if (!args.device.isUsable()) return false;
                await args.device.setUnitSetting('heating_block_temperature', args.temperature);
            });
            flow.getActionCard(this.cardId('set-cooling-block-temperature')).registerRunListener(async (args: any) => {
                if (!args.device.isUsable()) return false;
                await args.device.setUnitSetting('cooling_block_temperature', args.temperature);
            });
        }

        if (this.features.heatPumpStatus) {
            flow.getConditionCard(this.cardId('defrosting_is')).registerRunListener(async (args: any) => {
                return args.device.getCapabilityValue('defrosting') === true;
            });
            flow.getConditionCard(this.cardId('cooling_active_is')).registerRunListener(async (args: any) => {
                return args.device.getCapabilityValue('cooling_active') === true;
            });
        }

        const conditions: Record<string, string> = {
            eWindstatus_mode_is: 'eWindstatus_mode',
            heat_exchanger_mode_is: 'heat_exchanger_mode',
            heater_mode_is: 'heater_mode',
        };
        for (const [card, capability] of Object.entries(conditions)) {
            flow.getConditionCard(this.cardId(card)).registerRunListener(async (args: any) => {
                return args.device.getCapabilityValue(capability) === args.mode;
            });
        }

        // Without a run listener every Flow using these cards would run on any
        // change, whichever value the user picked in the card's dropdown.
        for (const card of ['eWindstatus_mode_changed', 'heat_exchanger_mode_changed', 'heater_mode_changed']) {
            flow.getDeviceTriggerCard(this.cardId(card)).registerRunListener(async (args: any, state: any) => {
                return args.mode_title === state.mode;
            });
        }
    }
}
