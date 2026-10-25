# Dashy avatar

Een levende avatar: twee pilvormige ogen op een wit lijf. Eigen veerfysica, 13 toestanden, ambient leven (micro-saccades, zweving), kopdraai, sequenties, één JSON-definitie en statische exports. Geen dependencies in de kern.

## Wat zit erin

| Map | Wat |
|---|---|
| `src/core.ts` | De simulatie. Geen DOM, geen timers: jij geeft de tijd mee (`step(now)`) en krijgt geometrie terug. Dit is het deel dat je naar andere platforms overzet. |
| `src/svg.ts` | Tekent die geometrie als SVG (`mountDashy`), volgt de muis, respecteert "minder beweging", leesbare tekst voor schermlezers. |
| `src/react/` | `<Dashy state="working" />`, `<DashyBody>` (lichaam zonder gezicht), `useDashyBody`, `useStateDriver`. |
| `src/driver.ts` | Optioneel: regels die uit gebeurtenissen (taak erbij, taak klaar, deadline dichtbij) een toestand kiezen. Zuiver, geen timers. |
| `src/ambient.ts`, `perspective.ts`, `timeline.ts`, `definition.ts` | Ambient leven, kopdraai, sequenties, JSON-definitie met validatie. |
| `src/static.ts`, `small.ts`, `photo.ts` | Statische SVG/PNG, kleine formaten (vereenvoudigd onder 64 px), photo mode. |
| `swift/DashyKit` | Dezelfde kern in Swift (SwiftUI), met dezelfde scenario's als tests. |
| `exports/` | Kant-en-klare SVG's en PNG's van alle toestanden, en favicons. |
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
dashy.poke();                // schrikken (4x snel = boos)
dashy.destroy();
```

React:

```tsx
import { Dashy } from 'dashy-avatar/react';   // of: from './src/react'

<div style={{ width: 240 }}><Dashy size="100%" state="thinking" ambient={1.5} perspective={1.4} /></div>
```

Het element waar je Dashy in zet bepaalt de grootte (vierkant, schaalt mee). Standaard zijn de ogen 34 x 55; voor 34 x 66: `createDashy({ eyeScale: 1 })`.

Zonder bundler of eigen bouw: kopieer `src/` naar je project. Alles is TypeScript zonder runtime-afhankelijkheden (React alleen voor `src/react`).

## Toestanden

`idle`, `received`, `working`, `thinking`, `waiting`, `blocked`, `done`, `happy`, `sad`, `angry`, `strict`, `dancing`, `sleepy`.

## Licentie en herkomst

Alle code hier is eigen werk voor Dashy. Voor uitdrukkingen, tijdlijnen en de JSON-definitie is gelet op de ideeën van [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab) (AGPL-3.0), maar er is **geen code of dependency van overgenomen**: alles is opnieuw gebouwd. Het pakket heeft nog geen licentie (`UNLICENSED`): voeg er zelf een toe voordat je het publiceert.
