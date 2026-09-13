# Exvent

Homey app for Exvent ventilation units, over Modbus TCP.

## Supported devices

| Device | Connection |
| --- | --- |
| Exvent eWind | Modbus TCP, turned on in the Exvent app |
| Exvent eAir | Modbus TCP, turned on in the Exvent app |
| Exvent units with EDA automation | Freeway WEB bus adapter |

The app polls the unit about once a minute.

## What it does

- Reads temperatures, humidity, fan level, heat recovery efficiency, and whether the unit is heating, cooling or recovering heat.
- Sets the mode (home, away, overpressure, boost, off) and the target temperature, from the device or from Flows.
- For EDA units also:
  - overpressure as the device's quick action
  - device settings for overpressure duration, season control (heating and cooling allowed, outdoor temperature limits) and the service reminder, all stored on the unit
  - readings for defrosting, cooling in operation, and the fan level set on the panel next to the level in effect

## Before pairing

**eWind and eAir:** turn on Modbus TCP in the Exvent app.

**EDA:** open the Freeway WEB adapter's web interface, go to Configuration → Access control configuration, enter your Homey's IP address as the Modbus/TCP client and save. The adapter accepts Modbus connections from that one address only.

Give the unit or adapter a fixed IP address in your router, and give Homey one too when using Freeway WEB.

## Development

Requires Node.js 24 or later and the Homey CLI (`npm install --global homey`).

```bash
npm install
npm run build
homey app validate --level publish
homey app run --remote
```

Use `--remote` with an EDA unit. Without it the app runs in Docker on your computer, and the Freeway WEB adapter refuses the connection because it only accepts Homey's IP address. Stopping `homey app run` uninstalls the app from Homey; use `homey app install` to keep it installed.

## Documentation

[docs/README.md](docs/README.md) describes the Modbus register maps and what has been verified against real hardware.
