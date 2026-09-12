Styr og overvåk ventilasjonsaggregatet ditt fra Exvent eller Enervent med Homey. Appen leser temperaturer, luftfuktighet, viftenivå, virkningsgrad for varmegjenvinningen og om aggregatet varmer, kjøler eller gjenvinner varme, og lar deg sette modus og ønsket temperatur fra Flyter.

Støttede enheter
- Exvent eWind
- Exvent eAir
- Enervent-aggregater med EDA-automatikk, via en Freeway WEB-bussadapter

Før du legger til en eWind eller eAir, slår du på Modbus TCP i Exvent-appen.

Før du legger til en Freeway WEB, åpner du Freeway sitt webgrensesnitt, skriver inn IP-adressen til Homey som Modbus/TCP-klient under Access control configuration, og lagrer. Adapteren godtar Modbus-tilkoblinger bare fra den ene adressen.

Gi aggregatet eller adapteren en fast IP-adresse i ruteren, og gi også Homey en fast adresse når du bruker Freeway WEB.
