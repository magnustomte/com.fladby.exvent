import Homey from 'homey';

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

        flow.getActionCard(this.cardId('ecomode')).registerRunListener(async (args: any) => {
            if (!args.device.isUsable()) return false;
            await args.device.setMode('ecomode_mode', args.ecomode);
            await args.device.sendCoilRequest(40, args.ecomode === '1');
        });

        flow.getActionCard(this.cardId('heatingcoil')).registerRunListener(async (args: any) => {
            if (!args.device.isUsable()) return false;
            await args.device.setMode('heating_coil_state', args.heatingcoil);
            await args.device.sendCoilRequest(54, args.heatingcoil === '1');
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
