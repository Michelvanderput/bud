# Dashy avatar

Een levende avatar: twee pilvormige ogen op een wit lijf. Eigen veerfysica, 44 toestanden, ambient leven (micro-saccades, zweving), kopdraai, een gezicht-laag (mond, blosjes, ooglichtjes, schaduw, 24 effecten), sequenties, één JSON-definitie en statische en geanimeerde exports. Geen dependencies in de kern.

## Dashy Studio

Een scherm om Dashy in elke toestand te zien, alles aan hem in te stellen en het resultaat te exporteren voor je project.

```bash
npm run studio        # http://localhost:5174/dashy-studio.html, bouwt opnieuw bij elke wijziging
npm run build:studio  # studio/dist/dashy-studio.html: één bestand, zo te openen of te delen
```

- **Toestanden**: alle 44, met live stills in je eigen stijl. Eigen expressies verschijnen erbij.
- **Vorm**: hoekronding (vierkant tot rond), omlijning, schaduw; ogen: breedte, hoogte, afstand, rondheid, glans.
- **Kleur**: 42 stijlen in zes groepen (Klassiek, Pastel, Donker, Fel, Natuur, Figuren zoals Robot, Pixel, Uil, Kikker en Mochi) en zes losse kleuren (lijf, ogen, omlijning, mond, blosjes, effecten).
- **Gezicht**: mond aan/uit, blosjes per toestand/altijd/uit, effecten aan/uit. Knop "Praten" laat de mond bewegen.
- **Beweging**: snelheid, verende, ademhaling, kopdraai, ogen volgen de muis, knipperritme.
- **Expressie**: maak je eigen gezicht met dezelfde schuiven die de toestanden gebruiken (ogen, mond, blos, effect) op het lijf van een toestand, en bewaar het onder een naam.
- **Sequentie**: een dope sheet: stappen met houd- en overgangstijd en gevoel (verend, zacht, kordaat), eenmalig, herhalen of heen en weer.
- **Export**: alles-in-één `.zip` (definitie, runtime, `embed.html`, van elke toestand SVG, PNG 128/512, 32 px icoon en animatie), de definitie (`.json`), still en PNG van het podium, geanimeerde SVG, spritesheet, losse webpagina, code voor JavaScript en React, en importeren van een eerdere `dashy.json`.

Je instellingen blijven bewaard in je browser.

## Wat zit erin

| Map | Wat |
|---|---|
| `src/core.ts` | De simulatie. Geen DOM, geen timers: jij geeft de tijd mee (`step(now)`) en krijgt geometrie terug. Dit is het deel dat je naar andere platforms overzet. |
| `src/svg.ts` | Tekent die geometrie als SVG (`mountDashy`), volgt de muis, respecteert "minder beweging", leesbare tekst voor schermlezers. Stijl, beweging, snelheid en praten zijn live aan te passen. |
| `src/decor.ts` | Mond, blosjes, ooglichtjes, schaduw en effecten (zzz, hartjes, sterretjes, sterren, vraagteken, uitroepteken, zweetdruppel, traan, tranenstroom, muzieknoten, stoom, puntjes, denkwolkje, confetti, geluidsgolven, sneeuw, vlammen, regenwolk, lampje, laadcirkel, vinkje, kruis, belletjes, bliksem). Zuiver en deterministisch, net als de kern. |
| `studio/` | Dashy Studio (zie boven). |
| `scripts/` | `export.ts` maakt `exports/` opnieuw (`npm run export`, gebruikt Playwright), `build-studio.mjs` bouwt de studio, `swift-reference.ts` neemt de simulaties op voor de Swift-tests (`npm run swift:reference`). |
| `src/react/` | `<Dashy state="working" />`, `<DashyBody>` (lichaam zonder gezicht), `useDashyBody`, `useStateDriver`. |
| `src/driver.ts` | Optioneel: regels die uit gebeurtenissen (taak erbij, taak klaar, deadline dichtbij) een toestand kiezen. Zuiver, geen timers. |
| `src/ambient.ts`, `perspective.ts`, `timeline.ts`, `definition.ts` | Ambient leven, kopdraai, sequenties, JSON-definitie met validatie. |
| `src/static.ts`, `small.ts`, `photo.ts` | Statische SVG/PNG, kleine formaten (vereenvoudigd onder 64 px), photo mode. |
| `swift/DashyKit` | Dezelfde kern in Swift (SwiftUI), met dezelfde scenario's als tests. |
| `exports/` | Kant-en-klare SVG's en PNG's van alle toestanden, favicons, app-iconen, en nieuw: `expressive/` (met mond en effecten) en `animated/` (geanimeerde SVG, ook met gezicht). |
| `tests/` | De scenario's. Ze dienen tegelijk als specificatie voor een port. |

## Gebruik

```bash
npm install
npm test        # 100+ tests: grenzen, soepelheid, scenario's, ambient, sequenties, definitie, React
npm run build   # dist/dashy.js, dist/react.js en types
```

Vanilla:

```ts
import { mountDashy } from 'dashy-avatar';

const dashy = mountDashy(document.getElementById('avatar')!, { shape: 'circle' });
dashy.setState('working');   // idle, received, working, thinking, waiting, blocked, done
dashy.setState('happy');     // happy, sad, angry, strict, dancing, sleepy
dashy.setState('love');      // surprised, love, confused, excited, scared, curious, proud, dizzy, bored, wink, talking, listening, shy
dashy.poke();                // schrikken (4x snel = boos)
dashy.setStyle({ roundness: 1, mouth: true, shine: .6, shadow: true });
dashy.setMotion({ speed: 1.5, bounce: 1.8 });
dashy.setTalking(true);      // mond beweegt, bv. tijdens spraak
dashy.setLook({ cover: .45, lidA: -6 }, { mouth: .5, fx: 'sparkles' }); // eigen expressie
dashy.destroy();
```

React:

```tsx
import { Dashy } from 'dashy-avatar/react';   // of: from './src/react'

<div style={{ width: 240 }}><Dashy size="100%" state="thinking" ambient={1.5} perspective={1.4} /></div>
<Dashy state="love" definition={definitionUitDeStudio} talking={isSpeaking} />
<Dashy state="excited" appearance={{ mouth: true, shine: .5 }} motion={{ speed: 1.2 }} />
```

Het element waar je Dashy in zet bepaalt de grootte (vierkant, schaalt mee). Standaard zijn de ogen 34 x 55; voor 34 x 66: `createDashy({ eyeScale: 1 })`.

Zonder bundler of eigen bouw: kopieer `src/` naar je project. Alles is TypeScript zonder runtime-afhankelijkheden (React alleen voor `src/react`).

## Toestanden

Werk: `idle`, `received`, `working`, `thinking`, `waiting`, `blocked`, `done`.
Gevoel: `happy`, `sad`, `angry`, `strict`, `dancing`, `sleepy`, en nieuw: `surprised`, `love`, `confused`, `excited`, `scared`, `curious`, `proud`, `dizzy`, `bored`, `wink`, `talking`, `listening`, `shy`, `laughing`, `crying`, `sick`, `cool`, `mischief`, `determined`, `relieved`, `nervous`, `cold`, `hot`, `starstruck`, `gloomy`.
App-momenten: `nodding`, `searching`, `loading`, `success`, `error`, `idea`.

De oorspronkelijke 13 toestanden zijn ongewijzigd (de exports zijn byte voor byte gelijk gebleven). De Swift-port in `swift/DashyKit` kent alle 44 toestanden en komt frame voor frame overeen met TypeScript (golden tests). De gezicht-laag, stijlen en definitie v2 zijn er (nog) alleen voor web.

## Definitie v2

De studio exporteert `schemaVersion: 2`. Versie 1 blijft geldig. Erbij in v2: `style` (roundness, outlineWidth, eyeWidth, eyeSpacing, eyeScale, eyeRoundness, shine, mouth, blush, effects, shadow), `motion` (ambient, perspective, speed, bounce, followPointer, blink), kleuren `blush`, `mouth`, `accent`, en per expressie een `decor` (blush, mouth, open, mouthWidth, fx).

## Licentie en herkomst

Alle code hier is eigen werk voor Dashy. Voor uitdrukkingen, tijdlijnen en de JSON-definitie is gelet op de ideeën van [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab) (AGPL-3.0), maar er is **geen code of dependency van overgenomen**: alles is opnieuw gebouwd. Het pakket heeft nog geen licentie (`UNLICENSED`): voeg er zelf een toe voordat je het publiceert.
