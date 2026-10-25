# DashyKit

Swift-port van Dashy voor iPhone en Mac.

| Product | Inhoud | Platform |
|---|---|---|
| `DashyCore` | `Dashy` (port van `src/core.ts`), `smallGeometry` (port van `src/small.ts`), de state driver (port van `src/driver.ts`) | alles waar Swift draait, alleen Foundation |
| `DashyUI` | `DashyView`: SwiftUI `Canvas`-weergave | iOS 16+, macOS 13+ |

```swift
import DashyUI

DashyView(state: .working, shape: .circle)   // variant .auto: vanaf 32 pt en kleiner de eenvoudige tekening
    .frame(width: 96, height: 96)
```

`DashyView` respecteert "Verminder beweging", pauzeert als de app niet actief of de view niet zichtbaar is, en geeft schermlezers een tekstlabel per toestand (Nederlands, aan te passen met `labels:`).

## Tests

```bash
swift test                  # of vanuit de repo-root: npm run swift:test
```

- `SimTests`: de scenario's uit `tests/sim.test.ts`, assertie voor assertie.
- `GoldenTests`: speelt dezelfde invoer af als de TypeScript-simulatie en eist dezelfde getallen (frame voor frame, ook de kleine variant en de driver). De opname staat in `Tests/DashyKitTests/Resources/reference.json`.
- `SmallVariantTests`, `DriverTests`: eigen tests voor de kleine variant en de prioriteitsregels.

Verandert `core.ts`, `small.ts` of `driver.ts`? Draai dan `npm run swift:reference` en daarna `swift test`. Een test in de TypeScript-suite faalt als de opname verouderd is.

## Wat hier niet is getest

`DashyView` (SwiftUI) wordt op Linux niet gecompileerd: SwiftUI bestaat daar niet, en de hele file staat achter `#if canImport(SwiftUI)`. Alleen de syntaxis is gecontroleerd. De tekening, het live gevoel, "Verminder beweging" en pauzeren moeten in Xcode op een echt apparaat worden bekeken.
