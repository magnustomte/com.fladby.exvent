Monitor and control your Exvent ventilation unit from Homey. See temperatures, humidity, fan level and heat recovery, set the mode and target temperature, and automate them with Flows.

Supported devices
- Exvent eWind
- Exvent eAir
- Exvent units with EDA automation, connected through a Freeway WEB adapter

Before adding an eWind or eAir, turn on Modbus TCP in the Exvent app.

Before adding an EDA unit, open the Freeway WEB adapter's web interface, enter your Homey's IP address as the Modbus/TCP client under Access control configuration, and save. The adapter accepts Modbus connections from that one address only.

Give the unit or adapter a fixed IP address in your router, and give Homey one too when using Freeway WEB.
