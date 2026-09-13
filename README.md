# Exvent

Homey app for Exvent and Enervent ventilation units over Modbus TCP.

## Supported devices

- Exvent eWind
- Exvent eAir
- Enervent units with EDA automation, through a Freeway WEB bus adapter

The app polls the unit about every 60 seconds.

## Before pairing

**eWind and eAir:** turn on Modbus TCP in the Exvent app.

**EDA:** in the web interface of the Freeway WEB adapter, open Configuration → Access control configuration, enter your Homey's IP address as the Modbus/TCP client and save. The adapter only accepts Modbus connections from that address, so give Homey a fixed IP address.

Give the unit or adapter a fixed IP address in your router.

## Documentation

The Modbus register maps and what has been verified against real hardware are described in [docs/README.md](docs/README.md).
