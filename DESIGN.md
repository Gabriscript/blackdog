# Black Dog — Design System

## Theme
Dark. Scene: a band deciding if this room is legit by checking the website on their phone at 10pm after seeing a flyer. The darkness is not aesthetic choice — it's the physical environment of rehearsal rooms. Light theme would feel wrong, like a dentist's office.

## Color strategy: Committed
One saturated color (red) carries 30–40% of surface weight. Everything else is near-black neutrals. Red is functional, not decorative — CTAs, active state, brand mark, status indicators.

## Colors
```
Background:   #0a0a0a   (near-black, barely warm)
Surface:      #171717   (form sections, cards where truly needed)
Border:       #333333   (primary), #1e1e1e (ghost/dividers)
Text primary: #F3F4F6
Text muted:   #A1A1AA
Red accent:   #D92D20   (CTAs, active, brand mark)
Red hover:    #B91C1C
Red error:    #DC2626   (conflict/no-show states)
Green:        #16A34A   (available slots, success states)
Ghost text:   #222222   (decorative large numbers)
```

## Typography
Three tiers — never mix order or use one tier for another's role:

1. **Display** (`font-display`): Cabinet Grotesk 900, uppercase, -0.02em tracking. H1, H2, brand mark, section titles. Never body text.
2. **Mono-tech** (`font-mono-tech`): IBM Plex Mono, uppercase, 0.12em tracking, 0.75rem. Step labels, field labels, meta indicators, status badges. Never body copy.
3. **Body** (default): Manrope 400/500/600. Descriptions, instructions, error messages, table content.

Scale: display can go 7xl on desktop. Hierarchy ratio between tiers should be at least 1.5×.

## Geometry
`--radius: 0rem`. Zero rounding everywhere. Sharp corners on all interactive elements, dialogs, inputs. No exceptions.

## Form sections
Three-section booking form:
- Each section: `border border-[#333333] bg-[#171717]`
- Padding varies: first section `p-6 sm:p-8`, subsequent `p-6` — vary for rhythm
- Step ghost numbers: `font-display text-4xl sm:text-5xl text-[#222] leading-none select-none` — visual anchors, not information

## Status colors
- confirmed: `text-[#F3F4F6]` (default white — confirmed is the expected state)
- cancelled: `text-[#A1A1AA]` (muted)
- no-show: `text-[#DC2626]` (red error)
- paid: `text-[#06B6D4]` (cyan — admin only)

## Wave divider
CSS-animated sound-wave motif. Brand characteristic, sits between hero and content. 39 positioned elements with red animation. Do not remove or replace.

## Component defaults
- **Buttons**: no rounding, `font-bold uppercase tracking-wider`, py-3 or py-4
- **Inputs**: `bg-transparent border border-[#333333] focus:border-[#D92D20] focus:outline-none px-4 py-3`
- **Dialogs**: `rounded-none` forced via CSS on all Radix components
- **Error/warning boxes**: always use `border + bg-opacity tint` — never bare text with emoji
