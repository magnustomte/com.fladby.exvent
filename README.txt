Control and monitor your Exvent and Enervent ventilation unit from Homey. The app reads temperatures, humidity, fan level, heat recovery efficiency and whether the unit is heating, cooling or recovering heat, and lets you set the mode and target temperature from Flows.

Supported devices
- Exvent eWind
- Exvent eAir
- Enervent units with EDA automation, through a Freeway WEB bus adapter

Before adding an eWind or eAir, turn on Modbus TCP in the Exvent app.

Before adding an EDA unit, open the web interface of its Freeway WEB adapter, enter your Homey's IP address as the Modbus/TCP client under Access control configuration, and save. The adapter accepts Modbus connections from that one address only.

Give the unit or adapter a fixed IP address in your router, and give Homey one too when using Freeway WEB.
