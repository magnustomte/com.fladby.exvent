# Modbus reference

Reference material for the Modbus register maps this app talks to.

## Automation platforms

Enervent ventilation units ship with one of two automation families, and they do **not**
share a register map:

| Platform | Used by | Register list |
| --- | --- | --- |
| **MD** | eAir, eWind | `eAirMD-modbus-register-list-public.xlsx`, `eWind-modbus-register-list-public.xlsx` |
| **EDA** | Older units reached through a Freeway WEB bus adapter | `EDA_Modbus_Registers_2011_09_14.pdf` (in this folder) |

The MD lists are published on the [Enervent document
server](https://doc.enervent.com/out/out.ViewFolder.php?folderid=16&showtree=1) and are not
duplicated here — download them from the source so they stay current.

A unit reports its own platform in holding register **599** (software version):

| Value | Platform |
| --- | --- |
| `< 190` | MD |
| `190`–`201` | Legacy EDA |
| `> 201` | EDA |

## EDA_Modbus_Registers_2011_09_14.pdf

The English EDA register list, authored by Mikael Karlsson and edited 14 September 2011.

Enervent published it at `http://enervent.fi/data/freeway/EDA_Modbus_Registers_2011_09_14.pdf`.
That URL now returns 404 and the document is no longer on Enervent's current document server,
so the copy here is preserved from the [Internet Archive snapshot of
2015-03-22](https://web.archive.org/web/20150322001720/http://enervent.fi/data/freeway/EDA_Modbus_Registers_2011_09_14.pdf).

```
sha256  1d95e4232a2316c095f5d961a3fe4dee315b4ede8c4daa3df74199637377c090
```

This supersedes the older Finnish edition (`eda_modbus_rekisterilista_2011-02-16.pdf`, 17
February 2011), which circulates on forums and covers the same registers in less detail. Use
this file instead.

## Register numbering

The PDF writes coils as `1xNNNN` and holding registers as `3xNNNN`. **`NNNN` is the Modbus data
address used on the wire** — there is no ±1 offset, despite what the `1x`/`3x` convention
normally implies.

Verified against a live unit by reading the real-time clock block, which is unambiguous:

| Register | Meaning | Read | Actual |
| --- | --- | --- | --- |
| 40 | Day | 12 | 12 |
| 41 | Month | 9 | September |
| 42 | Year (+2000) | 26 | 2026 |

## Holding register 44 — status bit field

Several states can be active at once; the register holds their sum. The Freeway WEB interface
renders the same bits under **Status**, with slightly different wording:

| Bit | Register list | Freeway WEB label |
| --- | --- | --- |
| 1 | Max cooling | Max cooling |
| 2 | Max heating | Max heating |
| 4 | Emergency stop | Emergency stop |
| 8 | Stop | Fans are stopped |
| 16 | Away | Away |
| 32 | Long away | Away long |
| 64 | Temperature boost | Temperature boost |
| 128 | CO2 boost | CO2 boost |
| 256 | Rh boost | Relative humidity |
| 512 | Boost | Manual boost |
| 1024 | Overpressure | Overpressure |
| 2048 | Cooker hood | — |
| 4096 | Central vacuum cleaner | CVC mode |
| 8192 | ELH cooling | SLP cooling |
| 16384 | Summernight cooling | Summer night cooling |
| 32768 | EDX defrosting | EXT melting |

## Defrosting

Bit 32768 is named after the EDX product line, which uses an outdoor unit, but it is **also**
how a unit with an *integrated* heat pump reports that it is defrosting. Holding register 639
distinguishes the two (`1` = outdoor pump unit fitted, `0` = not fitted); coil 46 carries the
defrost signal from an outdoor unit and stays 0 on integrated units.

Do not confuse this with coil 55, "defrosting function of heat recovery". That governs
anti-icing of the heat exchanger via the pressure switch (limits in registers 168–170) and is a
separate mechanism that may well be switched off on a unit that still defrosts its heat pump.
Register 644 sets how long the heat pump stays off after a defrost cycle.

## Notes for this app

- **Holding register 50 is a ventilation level in percent (20–100) on EC/DC fans, not a 1–4
  step.** Register 53 holds the level selected on the panel; register 50 holds the level
  actually in effect after boost, overpressure and heat-pump overrides. Expose both — otherwise
  a user who sets 40% and sees 70% will think the app is broken.
- **Holding register 44 is a bit field**, not an enumeration. Several states can be active at
  once and the register is their sum.
- **Coil 52 is "cooling allowed" and coil 54 is "heating allowed."** They are configuration
  bits that persist across power cycles, not momentary commands.
- **Coil 40 (eco mode) exists on MD only.** On EDA that address is reserved.
- Holding register 135 (temperature setpoint) accepts 10–30 °C, scaled ×10.
- Heat-pump units force the fans to at least 70% whenever the heat pump runs, regardless of the
  level set on the panel. Expect register 50 to jump to 70 on its own; that is the unit, not a
  bug. For the same reason the manual advises against Away and Long away on these units — they
  drop the fans to 30% and 20%, and save no energy.
- Decoding register 44 as a bit field is what makes defrost, stop and combined states visible
  at all. Matching the register against single values silently loses them.

## Credits

The register semantics here were cross-checked against
[Jalle19/eda-modbus-bridge](https://github.com/Jalle19/eda-modbus-bridge) (GPL-3.0), an
HTTP/MQTT bridge for Enervent units with EDA or MD automation. It is a well-tested independent
implementation of the same register maps and a useful reference when extending this app.
