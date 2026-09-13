import Homey from 'homey';

export interface Measurement {
    value: string;
    scale: string;
    label: string;
}

export class eWind extends Homey.Device {
    registers: Object = {
        "air_outside": [6, 1, 'INT16', "Fresh air"],
        "air_supply_HRC": [7, 1, 'INT16', "Supply air after HRC"],
        "air_supply": [8, 1, 'INT16', "Supply air"], 
        "air_exhaust": [9, 1, 'INT16', "Exhaust air"], 
        "air_extract": [10, 1, 'INT16', "Extract air temperature"], 
        "air_humidity": [13, 1, 'UINT16', "Air humidity extract"], 
        "air_supply_eff": [29, 1, 'UINT16', "Heat recovery efficiency, supply air"], 
        "air_extract_eff": [30, 1, 'UINT16', "Heat recovery efficiency, exhaust air"], 
        "temperature_setpoint": [135, 1, 'INT16', "Temperature setpoint"], 
        "fan_speed_level": [50, 1, 'UINT16', "Fan speed level"], 
        "fan_speed_panel": [53, 1, 'UINT16', "Fan speed level set on the panel"],
        "status": [45, 1, 'INT16', "status"], 
        "status_mode": [44, 1, 'INT16', "statusMode"],
    };

    coilRegisters: Object = {
        "eco_mode": [40, 1, 'UINT32', "eco Mode"], 
        "alarm_b_desc": [42, 1, 'UINT32', "Alarm B description"], 
        "heater_status": [32, 1, 'UINT32', "After-heater On/Off"], 
        "heat_exchanger_state": [30, 1, 'UINT32', "State of Heat exchanger On/Off"], 
        "heating_coil": [54, 1, 'UINT32', "State of Heater coil On/Off"], 
        "cooling_status": [28, 1, 'UINT32', "Cooling in operation"],
        "cooling_allowed": [52, 1, 'UINT32', "Cooling allowed"],
    };

    /**
     * Called after a poll changes a capability's value. The unit also changes
     * state on its own and from its control panel, which capability listeners
     * never see, so this is where Flow triggers belong.
     */
    protected async onCapabilityChanged(capabilityId: string, value: any): Promise<void> {}

    private async setIfChanged(capabilityId: string, value: any) {
        try {
            const current = this.getCapabilityValue(capabilityId);
            if (current === value) return;
            await this.setCapabilityValue(capabilityId, value);
            // No previous value means the device was just added or the app just
            // started; that is not a change worth triggering Flows for.
            if (current !== null && current !== undefined) {
                await this.onCapabilityChanged(capabilityId, value);
            }
        } catch (_) {
            // Ignore capability errors (e.g., device deleted)
        }
    }

    async processResult(result: Record<string, Measurement>) {
        if (!result) {
            return;
        }

        if (result['air_outside'] && result['air_outside'].value !== 'xxx') {
            let air_outside = ((Number(result['air_outside'].value) / 10));
            await this.setIfChanged('measure_temperature.outsideAir', air_outside);
        }

        if (result['air_extract'] && result['air_extract'].value !== 'xxx') {
            let extractair = ((Number(result['air_extract'].value) / 10));
            await this.setIfChanged('measure_temperature.extractAir', extractair);
        }

        if (result['air_supply'] && result['air_supply'].value !== 'xxx') {
            let airsupply = ((Number(result['air_supply'].value) / 10));
            await this.setIfChanged('measure_temperature.step', airsupply);
        }
        
        if (result['air_supply_HRC'] && result['air_supply_HRC'].value !== 'xxx') {
            let temperature = ((Number(result['air_supply_HRC'].value) / 10));
            await this.setIfChanged('measure_temperature.supplyAirHRC', temperature);
            
        }

        if (result['air_exhaust'] && result['air_exhaust'].value !== 'xxx') {
            let temperature = ((Number(result['air_exhaust'].value) / 10));
            await this.setIfChanged('measure_temperature.exhaustAir', temperature);
        }

        if (result['temperature_setpoint'] && result['temperature_setpoint'].value !== 'xxx') {
            let temperature = ((Number(result['temperature_setpoint'].value) / 10));
            // Must match the capability's min/max, which Homey enforces
            if (temperature >= 10 && temperature <= 30) {
                await this.setIfChanged('target_temperature.step',temperature);
            }
        }

        if (result['air_humidity'] && result['air_humidity'].value !== 'xxx') {
            let humidity = ((Number(result['air_humidity'].value)));
            await this.setIfChanged('measure_humidity.extractAir', humidity);
        }

        if (result['air_supply_eff'] && result['air_supply_eff'].value !== 'xxx') {
            let humidity = ((Number(result['air_supply_eff'].value)));
            await this.setIfChanged('efficiency.supplyEff', humidity);
        }

        if (result['air_extract_eff'] && result['air_extract_eff'].value !== 'xxx') {
            let humidity = ((Number(result['air_extract_eff'].value)));
            await this.setIfChanged('efficiency.extractEff', humidity);
        }

        if (result['fan_speed_level'] && result['fan_speed_level'].value !== 'xxx') {
            let humidity = ((Number(result['fan_speed_level'].value)));
            await this.setIfChanged('fanspeed_level', humidity);
        }

        if (result['status'] && result['status'].value !== 'xxx') {
            let statusValue = result['status'].value;
            if (statusValue === '0') { 
                await this.setIfChanged('eWindstatus', '0');
            } else if (statusValue === '1' ) {
                await this.setIfChanged('eWindstatus', '1');
            } else if (statusValue === '2') {
                await this.setIfChanged('eWindstatus', '2');
            } else if (statusValue === '4') {
                await this.setIfChanged('eWindstatus', '3');
            } else if (statusValue === '7') {
                await this.setIfChanged('eWindstatus', '4');
            } else if (statusValue === '8') {
                await this.setIfChanged('eWindstatus', '5');
            }
        }

        if (result['status_mode'] && result['status_mode'].value !== 'xxx') {
            // A bit field: several states can be active at once and the register
            // holds their sum. It is read as a signed 16-bit value, so the top bit
            // (defrosting) arrives negative until masked.
            const state = Number(result['status_mode'].value) & 0xffff;
            let mode = '0';
            if (state & (4 | 8)) {
                mode = '4'; // emergency stop, stop
            } else if (state & 1024) {
                mode = '2'; // overpressure
            } else if (state & 512) {
                mode = '3'; // manual boost
            } else if (state & (16 | 32)) {
                mode = '1'; // away, long away
            }
            await this.setIfChanged('eWindstatus_mode', mode);
            if (this.hasCapability('defrosting')) {
                await this.setIfChanged('defrosting', Boolean(state & 32768));
            }
            if (this.hasCapability('overpressure')) {
                await this.setIfChanged('overpressure', Boolean(state & 1024));
            }
        }

        if (result['fan_speed_panel'] && result['fan_speed_panel'].value !== 'xxx') {
            await this.setIfChanged('fanspeed_level.panel', Number(result['fan_speed_panel'].value));
        }

        if (result['cooling_status'] && result['cooling_status'].value !== 'xxx') {
            await this.setIfChanged('cooling_active', result['cooling_status'].value === '1');
        }

        if (result['cooling_allowed'] && result['cooling_allowed'].value !== 'xxx') {
            await this.setIfChanged('cooling_allowed', result['cooling_allowed'].value === '1' ? '1' : '0');
        }

        if (result['eco_mode'] && result['eco_mode'].value !== 'xxx') {
                let ecomode_value = result['eco_mode'].value;
            if (ecomode_value === "0") {
                await this.setIfChanged('ecomode_mode', '0');
            } else if (ecomode_value === "1") {
                await this.setIfChanged('ecomode_mode', '1');
            }
        }  
        if (result['heater_status'] && result['heater_status'].value !== 'xxx') {
            let statusValue = result['heater_status'].value;
            if (statusValue === "0") { 
                await this.setIfChanged('heater_mode', "0");
            } else if (statusValue === "1" ) {
                await this.setIfChanged('heater_mode', "1");
            }
        }
        if (result['heat_exchanger_state'] && result['heat_exchanger_state'].value !== 'xxx') {
            let statusValue = result['heat_exchanger_state'].value;
            if (statusValue === "0") { 
                await this.setIfChanged('heat_exchanger_mode', "0");
            } else if (statusValue === "1" ) {
                await this.setIfChanged('heat_exchanger_mode', "1");
            }
        }
        if (result['heating_coil'] && result['heating_coil'].value !== 'xxx') {
            let statusValue = result['heating_coil'].value;
            if (statusValue === "0") { 
                await this.setIfChanged('heating_coil_state', '0');
            } else if (statusValue === "1" ) {
                await this.setIfChanged('heating_coil_state', '1');
            }
        }
        if (result['alarm_b_desc'] && result['alarm_b_desc'].value !== 'xxx') {
            let statusValue = result['alarm_b_desc'].value;
            if (statusValue === "0") { 
                await this.setIfChanged('alarm_b.desc', false);
            } else if (statusValue === "1" ) {
                await this.setIfChanged('alarm_b.desc', true);
            }
        }
    }
}