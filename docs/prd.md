# Blue Dog Scratch
## Product Requirements Document

**Status:** Concept / V1  
**Platform:** Web browser  
**Technology:** HTML5 / CSS / JavaScript  
**Input:** Webcam-based hand tracking  
**Target player:** Approximately 5 years old  
**Reference projects:** `codesoda/balloon-pop`, `codesoda/coin-quest`, `codesoda/skater-dudes`

---

# 1. Overview

**Blue Dog Scratch** is a simple webcam-controlled game for young children.

The player stands or sits in front of a webcam and uses their real index finger as an on-screen pointer. A familiar blue cartoon dog hides around colourful suburban environments. The player finds the dog, points at it, and physically moves their finger back and forth to "scratch" it.

The interaction should feel immediate and magical:

> Move your real finger → the game responds.

There are no conventional keyboard, mouse, touchscreen, controller, or menu interactions required during normal gameplay.

The core experience is deliberately simple, wholesome, forgiving, funny, and replayable.

The main loop is:

**Find Blue Dog → point → scratch → funny reaction → Blue Dog hides again.**

Occasionally, the orange younger dog appears briefly as a surprise. The player must quickly point at her before she disappears.

Parent characters occasionally appear subtly in the background as non-interactive Easter eggs.

The game should feel like a small interactive cartoon rather than a traditional score-driven video game.

---

# 2. Product Principles

Every design decision should favour the following principles.

## 2.1 Playable by a five-year-old

A child should be able to understand the game without reading instructions.

The game should primarily teach through:

- animation
- movement
- sound
- character reactions
- visual affordances

Avoid text wherever possible.

---

## 2.2 No computer touching

After initial browser/camera permission and game start, the entire game should be controllable through the webcam.

The child should not need:

- keyboard
- mouse
- trackpad
- touchscreen
- controller

Menus should use large dwell-based targets where necessary.

---

## 2.3 No meaningful failure

Blue Dog should never disappear because the player is too slow.

The player cannot:

- lose a life
- die
- get a Game Over
- fail a level
- lose progress

If the player has difficulty finding Blue Dog, the game gradually makes the answer easier.

The player's experience should be:

> "I'm really good at this."

---

## 2.4 Immediate physical feedback

The relationship between the player's hand and the game should be extremely obvious.

The fingertip should control an on-screen pointer with low perceived latency.

Interactive objects should react immediately.

---

## 2.5 Delight over complexity

Character animation and reactions are more important than elaborate game systems.

A funny Blue Dog reaction is more valuable than another scoring mechanic.

---

## 2.6 Replay through randomness

A short session should be fun to play repeatedly because:

- hiding locations change
- scenes change
- character reactions change
- younger-dog appearances are unpredictable
- parent cameos are unpredictable
- environmental animations change
- very rare events occasionally occur

The child should not see everything in one session.

---

# 3. Branding and Art Direction

The game is called:

# BLUE DOG SCRATCH

The game does not display the Bluey name, logo, wordmark, title treatment, or other show branding.

Within the intended private/family prototype, the principal characters should nevertheless be immediately recognisable as the familiar blue and orange dogs and their parents.

The game UI itself should have its own identity.

## Art direction

Visual characteristics:

- hand-drawn 2D appearance
- thick or slightly imperfect outlines
- flat colours
- warm palette
- simple shading
- rounded geometry
- exaggerated expressions
- Australian suburban environments
- oversized readable props
- playful squash-and-stretch animation
- uncluttered foreground gameplay areas

Backgrounds should contain enough detail to reward looking around but should never make Blue Dog difficult to distinguish.

---

# 4. Target Experience

A complete play session should last approximately:

**2–4 minutes**

A session should require roughly:

**6 successful Blue Dog scratches**

before reaching a celebration.

The player can then immediately continue into another randomly selected scene.

The game should support repeated continuous play without requiring an adult to intervene.

---

# 5. Core Input System

Use webcam hand tracking based on the approach in `balloon-pop`.

## 5.1 Finger pointer

Track the player's index fingertip.

The MediaPipe hand landmark for the index fingertip is:

**Landmark 8**

Convert its coordinates into game-space coordinates.

Because the camera preview is mirrored, the game-space pointer must feel like looking into a mirror:

- move hand left → pointer moves left
- move hand right → pointer moves right

Apply smoothing to reduce jitter while preserving responsiveness.

---

# 6. Pointer Presentation

The raw webcam feed does not need to dominate the screen.

The player's fingertip position should be represented by a playful cursor such as:

- glowing paw
- small sparkle
- glowing star
- soft circular highlight

The cursor should be large enough that the child can easily see it.

Example approximate visual size:

**30–60 px**, depending on resolution.

The webcam may optionally be shown as a small debug/configuration view for development but should not be visually important during normal gameplay.

---

# 7. Interaction Primitives

The game should establish a reusable interaction system.

V1 requires:

1. point
2. hover
3. dwell
4. scratch/rub

Future versions may add:

5. pinch
6. drag
7. release

---

# 8. Point / Hover

Interactive objects have intentionally generous invisible hitboxes.

The visual object might occupy one rectangle, while its interaction target extends substantially beyond it.

Example:

```text
       invisible target
┌──────────────────────────┐
│                          │
│       ┌──────────┐       │
│       │ BLUE DOG │       │
│       └──────────┘       │
│                          │
└──────────────────────────┘
```

Young children should not need pixel-perfect pointing.

---

# 9. Dwell Input

Menus and large UI controls should activate by hovering over them.

Example:

1. fingertip enters target
2. progress ring begins filling
3. fingertip remains for approximately 600–900 ms
4. action activates

Leaving the target resets the dwell timer.

Dwell replaces clicking.

---

# 10. Scratch Gesture

Scratching should not require a separate hand gesture.

When the fingertip is inside Blue Dog's scratch region, track accumulated movement.

For example:

```text
distance += distance(previousFingerPosition, currentFingerPosition)
```

A successful scratch occurs after a configurable amount of movement, e.g.:

**200–400 px accumulated travel**

depending on viewport scale.

Movement can be:

- left/right
- up/down
- circular
- messy

The child should simply be able to wiggle their hand over the dog.

During scratching:

- character reacts progressively
- tail moves
- ears move
- leg may kick
- hearts/sparkles appear
- scratch sounds may play
- visual scratch meter fills

The action should feel responsive before completion.

---

# 11. Optional Future Pinch Input

Pinch detection is not required for V1.

Future detection can use:

- thumb tip: landmark 4
- index fingertip: landmark 8

Rather than absolute distance, calculate distance relative to hand size.

Example:

```text
pinchRatio =
  distance(thumbTip, indexTip) /
  distance(indexMCP, pinkyMCP)
```

A sufficiently small ratio means:

**pinching**

This can later support:

- grab
- drag
- carry
- drop
- throwing

Pinch should not become a dependency of the V1 gameplay.

---

# 12. Game Loop

Each scene follows this loop:

```text
SCENE START
    ↓
Blue Dog chooses hiding location
    ↓
Blue Dog peeks out
    ↓
Player finds Blue Dog
    ↓
Player points at Blue Dog
    ↓
Blue Dog fully reveals
    ↓
Player scratches Blue Dog
    ↓
Blue Dog performs reaction
    ↓
Progress paw awarded
    ↓
Possible younger-dog event
    ↓
Possible background cameo
    ↓
Blue Dog chooses another hiding spot
    ↓
Repeat
```

After the target number of scratches:

```text
celebration
    ↓
new scene
```

---

# 13. Blue Dog Behaviour

Blue Dog is the primary gameplay character.

Each appearance consists of three states.

## Hidden

Only a small clue may be visible:

- ears
- nose
- eyes
- feet
- tail
- top of head

## Found

Once the player's fingertip enters the reveal target:

- Blue Dog pops out
- looks toward the player
- makes a happy sound
- presents a scratchable area

## Scratched

The player rubs the pointer over Blue Dog.

Upon completion:

- funny animation
- happy sound
- hearts / particles
- paw progress awarded

Blue Dog then leaves and hides somewhere else.

---

# 14. Blue Dog Must Not Time Out

There is no time limit for normal Blue Dog appearances.

If the player does nothing, Blue Dog waits.

This allows:

- distraction
- poor tracking
- young-player hesitation
- experimentation with the environment

without punishment.

---

# 15. Hint Escalation

If Blue Dog has not been found, progressively reveal the hiding place.

Suggested sequence:

### 0–4 seconds

Normal hiding state.

### 4 seconds

Small environmental movement:

- bush rustles
- curtain moves
- box wiggles

### 7 seconds

More of Blue Dog appears:

- tail
- ears
- paws

### 10 seconds

Blue Dog makes a small sound.

### 13+ seconds

The hiding object visibly jiggles or Blue Dog peeks out prominently.

The system should ultimately make discovery nearly unavoidable.

---

# 16. Younger-Dog Surprise Mechanic

The younger orange dog acts as a rare, fast bonus target.

This introduces the only meaningful reaction-time mechanic in the game.

She should appear approximately every:

**2–5 Blue Dog encounters**

but using controlled randomness rather than a fixed schedule.

Example:

- base probability: ~20–25%
- minimum two Blue Dog encounters between appearances
- force an appearance after a sufficiently long absence

The timing should feel unpredictable.

---

# 17. Younger-Dog Gameplay

When the orange dog appears:

- distinctive animation or sound draws attention
- she remains visible briefly
- the player only needs to touch her with the fingertip
- scratching is not required

Initial duration:

**approximately 1.25–1.75 seconds**

Tune based on five-year-old testing.

Her hitbox should be extremely forgiving.

Successful interaction triggers:

- big visual effect
- happy reaction
- special sound
- rainbow/special paw reward

If she is missed:

- she giggles
- disappears
- nothing is removed
- no negative sound
- no failure message

Missing her should be funny rather than disappointing.

---

# 18. Mid-Scratch Surprise

Occasionally the younger dog may appear while Blue Dog is currently being scratched.

Example:

```text
Player scratching Blue Dog
        ↓
Orange Dog suddenly appears behind flowerpot
        ↓
Player notices and quickly moves pointer
        ↓
Orange Dog bonus
        ↓
Return to Blue Dog
```

Blue Dog can visually look towards her when this occurs.

Use sparingly.

---

# 19. Progress System

Do not emphasise numerical scores.

Primary session progress is represented by large visual paw marks.

Example:

```text
🐾 🐾 ○ ○ ○ ○
```

A normal successful scratch fills one paw.

A special orange-dog interaction may create a distinctive paw:

```text
🐾 ⭐ 🐾 ○ ○ ○
```

Target:

**5–7 Blue Dog scratches per session**

Default V1:

**6**

---

# 20. Celebration

When all session paws are filled:

- Blue Dog runs into foreground
- orange dog may join
- parents may join occasionally
- characters dance / bounce / celebrate
- confetti, stars, bubbles or hearts appear
- upbeat audio plays

The celebration should be relatively short:

**approximately 4–8 seconds**

Then the game automatically transitions to another scene.

Optionally show a huge dwell-operated:

**AGAIN**

paw/button, but preferably continuous play should require no action.

---

# 21. Scenes

V1 should implement four visually distinct environments.

All environments use the same mechanics.

## Scene 1 — Backyard

Potential hiding locations:

- tree
- bush
- trampoline
- cubby
- paddling pool
- washing line
- garden table
- cardboard box
- fence
- shed

Interactive props:

- flower
- ball
- sprinkler
- wind chime
- puddle

Ambient objects:

- butterfly
- bird
- leaves
- cloud shadows

---

## Scene 2 — Bedroom

Potential hiding locations:

- under bed
- behind bed
- under blanket
- behind curtain
- toy box
- wardrobe
- giant stuffed toy
- pillow
- door

Interactive props:

- lamp
- toy xylophone
- bouncing ball
- wind-up toy

Ambient:

- curtain movement
- floating balloon
- toy movement

---

## Scene 3 — Lounge Room

Potential hiding locations:

- behind couch
- beneath couch
- armchair
- curtain
- blanket fort
- cushions
- coffee table
- cabinet
- behind parent character

Interactive props:

- cushion
- lamp
- toy
- hanging decoration

---

## Scene 4 — Playground / Park

Potential hiding locations:

- slide
- tunnel
- tree
- picnic table
- playhouse
- climbing frame
- bushes
- hill
- park bench

Blue Dog can sometimes enter dynamically:

- slide down slide
- poke head through tunnel
- run behind play equipment

Interactive props:

- puddle
- butterfly
- ball
- flowers
- leaves

---

# 22. Future Scene Ideas

Not required for V1:

- beach
- kitchen
- creek
- camping
- rainy backyard
- nighttime bedroom
- picnic
- front yard
- playground at sunset

Scene variants can reuse underlying geometry.

For example:

**Backyard Day** and **Backyard Rain** can share hiding coordinates while using different art and environmental effects.

---

# 23. Interactive Environment

Each scene should contain approximately:

**3–5 optional interactive objects**

These exist purely for discovery.

Examples:

Touch flower:

→ butterfly emerges

Touch ball:

→ ball rolls

Touch puddle:

→ splash

Touch lamp:

→ toggles light

Touch xylophone:

→ plays note

Touch bubbles:

→ pop

These interactions should not:

- award required progress
- interfere with Blue Dog
- punish the player
- require explanation

They make the world feel responsive.

---

# 24. Parent Cameos

Parent characters appear as rare background events.

They are not required targets.

The player receives no score for touching them.

Their purpose is:

- humour
- world-building
- replayability
- Easter eggs

Examples:

### Backyard

- Dad rakes leaves
- Dad carries an oversized object
- Mum hangs washing
- Mum appears at window
- Dad peers over fence
- parents walk across background together

### Bedroom

- parent walks past doorway
- Dad pokes head around doorway
- Mum carries washing

### Lounge

- Dad sits reading
- Mum passes behind sofa
- parent briefly looks toward Blue Dog

### Park

- parent walks along distant path
- Dad carries picnic equipment
- Mum sits at picnic table

---

# 25. Cameo Probability

Do not show a cameo every encounter.

Example event distribution:

```text
70% no parent cameo
15% Dad cameo
10% Mum cameo
4% parent interaction
1% rare/silly event
```

Values should be configurable.

Rare events might include:

- Dad carrying huge inflatable flamingo
- parent chased through background
- absurdly large object
- both parents noticing the camera/player
- unexpected costume

Rare events should remain genuinely rare across repeated sessions.

---

# 26. Character Awareness of Pointer

When visible, Blue Dog should visually react to the player's pointer.

At minimum:

- eyes follow fingertip horizontally
- slight head direction follows pointer

Potential reactions:

Pointer approaches tummy:

→ anticipatory expression

Pointer leaves:

→ watches it go

Pointer circles head:

→ follows movement

This gives the illusion that the character can see the player's real hand.

Parent cameo characters may occasionally also notice the pointer.

Example:

1. Dad walks through background.
2. Player follows him with pointer.
3. Dad stops.
4. Dad looks at pointer.
5. Dad looks toward camera.
6. Dad continues walking.

This is optional for initial V1 but highly desirable.

---

# 27. Hand Loss Behaviour

The game must handle unreliable webcam input gracefully.

If the player's hand disappears:

- freeze interaction
- do not penalise
- Blue Dog remains visible
- optionally show a subtle animated hand hint

When tracking resumes:

- game continues immediately

Do not reset the encounter.

---

# 28. Multiple Hands

V1 can support either:

### Option A

Track the most stable / first detected hand.

### Option B

Support both hands simultaneously.

Since `balloon-pop` already supports multiple hands, supporting two pointers may be straightforward.

However, gameplay logic should never require two hands.

Two hands should simply mean:

**two possible pointers**

---

# 29. Tracking Smoothing

Raw hand-tracking coordinates will jitter.

Apply smoothing such as:

```text
smoothed =
    previous * smoothingFactor +
    current * (1 - smoothingFactor)
```

Potential starting factor:

**0.6–0.8**

Tune visually.

Excessive smoothing creates lag, which is worse than small amounts of jitter.

Low perceived latency is the priority.

---

# 30. Game State Architecture

Suggested top-level states:

```text
BOOT
CAMERA_PERMISSION
HAND_WAIT
SCENE_INTRO
HIDING
REVEALED
SCRATCHING
REACTION
BONUS_EVENT
CELEBRATION
SCENE_TRANSITION
```

Avoid overly complex state logic.

---

# 31. Scene Data Format

Scenes should be data-driven rather than hard-coded.

Example conceptual structure:

```js
const scenes = {
  backyard: {
    background: "...",
    hidingSpots: [
      {
        id: "tree",
        x: 0.72,
        y: 0.44,
        blueDogPose: "peek-right",
        revealAnimation: "jump-out"
      }
    ],
    interactiveProps: [],
    ambientEvents: [],
    cameos: []
  }
};
```

Coordinates should preferably be normalised:

```text
0.0–1.0
```

rather than raw pixels.

This makes scenes responsive.

---

# 32. Character Animation System

Character animations should be modular.

Blue Dog animation categories:

## Hide animations

- peek left
- peek right
- ears only
- tail only
- upside-down peek
- under-object peek

## Reveal animations

- jump out
- pop up
- crawl out
- slide in
- roll in

## Scratch reactions

- leg kick
- tail wag
- roll over
- happy bounce
- tongue out
- shake
- laugh

## Exit animations

- run left
- run right
- dive behind object
- duck down
- bounce away

The combination should be randomised where compatible.

---

# 33. Audio

Audio should reinforce actions rather than instruct the player verbally.

Useful categories:

- ambient scene audio
- dog giggles
- barks
- scratch sound
- sparkle sound
- surprise cue
- celebration music
- object interaction sounds
- splash
- rustle
- toy sounds

Avoid constant noisy music if it competes with interactions.

Background music should be:

- light
- cheerful
- repetitive without becoming irritating
- lower volume than gameplay effects

Provide global sound mute for adults, accessible outside normal child gameplay.

---

# 34. Start Experience

First launch may require browser camera permission and an explicit user action due to browser restrictions.

After permission is granted, minimise adult interaction.

Proposed start:

```text
BLUE DOG SCRATCH

[animated hand graphic]

SHOW ME YOUR HAND
```

Once a hand is detected:

```text
3
2
1
```

Then begin.

The countdown can be purely visual.

No difficulty selector is required.

No character selector is required.

No level selector is required.

---

# 35. Scene Selection

Scenes should normally be randomly selected.

Avoid repeating the same scene twice consecutively where possible.

Potential future hidden adult/debug option:

```text
?scene=backyard
```

Useful query parameters:

```text
?scene=backyard
?debug=true
?camera=true
?bonusRate=1
?cameoRate=1
```

These will make testing significantly easier.

---

# 36. Debug Mode

Development mode should expose:

- camera feed
- detected landmarks
- fingertip coordinates
- smoothed fingertip coordinates
- hitboxes
- current game state
- current hiding spot
- scratch distance
- scratch threshold
- bonus timer
- event probabilities
- FPS

Debug UI must be completely absent from normal gameplay.

---

# 37. Responsive Layout

Primary target:

**16:9 desktop/laptop webcam display**

Likely resolutions:

- 1920×1080
- 1440×900
- 1366×768
- 1280×720

Scene composition should survive different aspect ratios.

Prefer:

- fixed virtual game coordinates
- scale-to-fit rendering
- normalised interaction coordinates

Do not position important hiding locations at extreme edges where cropping may occur.

---

# 38. Rendering Technology

V1 should remain simple.

Preferred options:

### DOM/CSS

Suitable if characters/background objects are primarily PNG/WebP/SVG elements.

Advantages:

- easy positioning
- easy animation
- easy hitboxes
- straightforward development

### HTML5 Canvas

Suitable if:

- particle effects become extensive
- sprite sheets are heavily used
- large numbers of animated objects appear

Either is acceptable.

Avoid introducing a full game framework unless clearly justified.

The reference games demonstrate that this class of project can remain lightweight vanilla HTML5/JavaScript.

---

# 39. Recommended Project Structure

Example:

```text
/
├── index.html
├── css/
│   └── game.css
├── js/
│   ├── main.js
│   ├── game.js
│   ├── hand-tracking.js
│   ├── pointer.js
│   ├── scratch.js
│   ├── scenes.js
│   ├── characters.js
│   ├── events.js
│   ├── audio.js
│   └── debug.js
│
├── assets/
│   ├── characters/
│   │   ├── blue-dog/
│   │   ├── orange-dog/
│   │   ├── mum/
│   │   └── dad/
│   │
│   ├── scenes/
│   │   ├── backyard/
│   │   ├── bedroom/
│   │   ├── lounge/
│   │   └── playground/
│   │
│   ├── props/
│   ├── effects/
│   ├── ui/
│   └── audio/
│
└── README.md
```

Do not over-engineer the architecture.

---

# 40. Asset Requirements

Each scene requires:

## Background

1 main environment image.

## Foreground occluders

Individual foreground elements that Blue Dog can appear behind.

Examples:

- bush
- couch
- curtain
- table
- toy box

These may need separate layers from the background.

Typical rendering order:

```text
BACKGROUND

ambient characters

Blue Dog hidden layer

foreground occluder

effects

pointer

UI
```

This enables the character to convincingly appear behind objects.

---

# 41. Sprite Requirements

V1 should prioritise expressive animation over large sprite counts.

Approximate initial requirement:

### Blue Dog

- 5–8 peek poses
- 2–4 reveal poses/animations
- 5–8 scratch reactions
- 3–4 exit animations
- celebration animation

### Orange Dog

- 5–8 surprise poses
- success reaction
- missed/giggle exit

### Dad

- 5–10 cameo poses/events

### Mum

- 5–10 cameo poses/events

The same sprites can be reused across scenes where sensible.

---

# 42. Particle Effects

Reusable lightweight effects:

- hearts
- stars
- sparkles
- dust
- leaves
- bubbles
- confetti
- splash

Effects should be short and visually readable.

Particles should never obscure the next target for long.

---

# 43. Randomness Rules

Pure randomness can create bad experiences.

Use constrained randomness.

## Hiding positions

Do not select the same hiding position twice consecutively.

Prefer avoiding any of the previous two positions.

## Scratch reaction

Avoid repeating the previous reaction.

## Orange-dog appearances

Use probability plus cooldown and drought protection.

## Cameos

Use low independent probability but prevent excessive consecutive cameos.

## Scenes

Do not repeat the previous scene when alternatives exist.

---

# 44. Difficulty

There should be no explicit child-facing difficulty settings.

Adaptive difficulty may happen invisibly.

Examples:

If tracking is poor:

- enlarge hitboxes

If Blue Dog repeatedly takes a long time to find:

- show hints earlier

If orange dog is consistently missed:

- increase visible duration

If the player consistently catches her:

- slightly shorten duration, within safe limits

Adaptation should be subtle.

Never announce:

**EASY MODE**

or:

**YOU MISSED TOO MANY**

---

# 45. Accessibility / Child Safety

The experience should not require rapid or forceful movement.

Avoid interactions requiring:

- jumping
- ducking physically
- large arm swings
- repetitive high-speed motion

The pointer should work while seated.

Avoid:

- flashing visual effects
- startling audio spikes
- dark/scary failure screens
- frustrating countdowns

---

# 46. Privacy

Webcam video should remain local to the browser.

The game should not:

- upload video
- record video
- save screenshots
- transmit hand imagery

If analytics are later added, they should contain game events only.

Examples:

```text
scene_started
blue_dog_found
scratch_completed
bonus_seen
bonus_hit
session_completed
```

No webcam frames or biometric data should leave the device.

---

# 47. Performance Goals

Target:

**60 FPS rendering**

Hand tracking should remain responsive enough to feel direct.

Acceptable degraded rendering:

**30 FPS minimum**

Performance is more important than extremely high-resolution artwork.

Preload assets for the current scene before beginning the session.

Other scenes can preload during play.

---

# 48. MVP Scope

The first playable MVP should deliberately be smaller than the full V1.

## MVP

One scene:

**Backyard**

Characters:

- Blue Dog

Features:

- webcam initialization
- fingertip tracking
- smoothing
- pointer rendering
- 6+ hiding locations
- find/reveal mechanic
- scratch detection
- 3+ scratch reactions
- paw progress
- 6 scratches → celebration
- restart automatically

No orange dog.

No parents.

No interactive props.

No sound required beyond basic feedback.

The objective of MVP is to prove:

> Is pointing at and scratching the character with your real finger fun for a five-year-old?

---

# 49. V0.2 — Surprise

Add:

- orange dog
- brief surprise appearances
- special success reaction
- missed reaction
- controlled random spawning

Validate:

> Does the surprise mechanic create excitement without frustration?

---

# 50. V0.3 — Living World

Add:

- Dad cameos
- Mum cameos
- interactive environment props
- ambient animations
- pointer-following eyes

Validate:

> Does the world feel alive even though the underlying game is simple?

---

# 51. V0.4 — Multiple Scenes

Add:

- bedroom
- lounge
- playground

Plus scene transitions and random selection.

At this point the game represents the intended V1 experience.

---

# 52. V1 Success Criteria

The game is ready for V1 when a five-year-old can:

1. stand or sit in front of the webcam
2. discover that their finger controls the pointer
3. locate Blue Dog without verbal adult instruction
4. understand that rubbing the dog scratches it
5. complete an entire scene without touching the computer
6. react to at least some orange-dog appearances
7. play another scene without adult intervention
8. voluntarily replay the game

Qualitative success is more important than traditional game metrics.

The strongest signal is:

> The child immediately asks to play again.

---

# 53. Technical Acceptance Criteria

## Webcam

- camera permission requested successfully
- game handles missing/rejected camera permission gracefully
- front camera selected where applicable

## Tracking

- index fingertip reliably tracks player
- horizontal orientation is correctly mirrored
- jitter is smoothed
- temporary tracking loss does not reset gameplay

## Blue Dog

- hiding spot randomisation works
- no immediate hiding-position repetition
- reveal activates using generous hitbox
- Blue Dog does not time out
- hint escalation activates

## Scratching

- accumulated fingertip movement recognised
- ordinary pointer jitter cannot accidentally complete a full scratch
- rough child movement still succeeds
- progressive character reaction occurs

## Progress

- successful scratch increments paw progress once
- duplicate collision cannot award multiple paws
- completion triggers celebration

## Orange Dog

- appears according to constrained randomness
- hit is instantaneous
- miss has no penalty
- event does not break Blue Dog state

## Cameos

- purely decorative
- do not obstruct required gameplay
- rate limits prevent repetition

## Scenes

- scene assets load before play
- interactive coordinates scale correctly
- scenes transition without page reload

---

# 54. Out of Scope for V1

Do not add yet:

- account system
- multiplayer
- online leaderboard
- conventional score leaderboard
- keyboard gameplay
- controller gameplay
- complex story campaign
- inventory
- character upgrades
- achievements system
- level map
- lives
- Game Over
- combat
- enemy characters
- advertisements
- purchases
- backend service

Keep the game almost entirely client-side.

---

# 55. Future Mini-Games

Once the hand interaction system is proven, Blue Dog Scratch can expand into other webcam games.

## Muddy Dog

Blue Dog arrives covered in mud.

Player rubs finger across body to clean it.

The mud is progressively erased.

At the end:

Blue Dog shakes and splatters mud again.

---

## Dig Here

Player rubs dirt patches.

Hidden items emerge:

- bone
- rubber duck
- toy
- sock
- dinosaur
- slipper
- silly objects

Curiosity is the reward.

---

## Toy Tidy

Requires pinch.

Player pinches toys and drags them into toy box.

---

## Fetch

Requires pinch/release.

Player grabs a ball and performs a throwing motion.

Blue Dog chases it.

---

## Butterfly Chase

The player's pointer becomes a butterfly.

Blue Dog follows it through the environment.

This could eventually become a side-scrolling exploration game without requiring conventional controls.

---

# 56. Key Design Rule

Whenever there is a choice between:

**more game mechanics**

and:

**a better character reaction**

choose the character reaction.

The core technology is simple.

The product succeeds if the player believes:

> Blue Dog can see my finger, knows I'm there, and wants to play with me.

That illusion is the heart of **Blue Dog Scratch**.
