# FJORDWING

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/LoganZ2/fjordwing-flight/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/LoganZ2/fjordwing-flight/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**FJORDWING** is an original, zero-dependency 3D WebGL2 desktop flight simulator set over the **Skjold Fjord Archipelago**. Pilot the sculpted **VX-9 Kestrel** through golden-hour alpine canyons, illuminated glass-cockpit avionics, glowing aerial checkpoints, and ILS glideslope landings onto Coastal Island Runway 09/27.

## Highlights

- **Custom WebGL2 Atmospheric Engine**: Physically inspired Rayleigh/Mie golden-hour sky scattering, sunlit volumetric cloud banks, multi-biome Nordic fjord terrain (reef, shoreline, spruce forest, granite cliffs, glacier snow), Fresnel specular ocean water, and detailed Runway 09/27 with control tower, hangars, coastal lighthouse, and live 4-lamp PAPI glideslope bar.
- **Illuminated Glass Cockpit & Collimated HUD**: Seamless toggle between Chase, 3D Glass Cockpit (brushed-carbon glareshield, collimated HUD combiner glass, Garmin-inspired PFD artificial horizon + engine telemetry, and Tactical MFD radar + ILS glideslope indicators), and Wingman camera views.
- **Aerodynamic Flight Physics**: 6-DOF quaternion flight model with lift/AoA/stall buffeting, induced & parasitic drag, flaps, retractable landing gear, speedbrake, afterburner vs. cruise fuel economy, hull integrity, crosswinds, and graded runway touchdowns.
- **3 Distinct Missions + Free Flight**: *Fjord Ring Rally*, *Alpine Fuel Run*, *Storm ILS Approach*, and *Free Flight*.
- **100% Offline & Procedural Audio**: Plain static ES modules with zero external requests and a procedural Web Audio jet turbine, afterburner, wind, stall warble, and avionics chime synthesizer.

## Controls

| Action | Input |
| :--- | :--- |
| Pitch & Roll | `W`/`S` & `A`/`D` or Arrow Keys (or Mouse Yoke `Y`) |
| Yaw Rudder | `Q` / `E` |
| Throttle Up / Down | `Shift` / `Ctrl` |
| Afterburner Boost | `Space` |
| Flaps / Landing Gear / Speedbrake | `V` / `G` / `B` |
| Camera (Chase / Cockpit / Wingman) | `C` |
| Quick Select Mission 1 / 2 / 3 | `1` / `2` / `3` |
| Pause / Restart / Audio Mute | `P` / `R` / `M` |

## Play Locally

```sh
node serve.ts
# Open http://127.0.0.1:8080 in desktop Chrome
```

## Package Dossier

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=m9c4qk0v&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
