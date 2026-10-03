# CLI refresh and layout plan

## Objective

Remove intermittent flicker during long-running CLI sessions and make the layout
stable at 80×24 and larger sizes. Keep the current Midnight Commander palette,
recent-server selector and connection/audio behavior. Update Escape navigation
as specified below; preserve the other keyboard shortcuts.

The reported flicker appears after a while, without an obvious action triggering
it. Treat sustained playback, changing server metadata and occasional dialog
transitions as the primary reproduction cases.

## Findings

- `src/cli.jsx` uses Ink's default renderer. In installed Ink 7.1.1,
  `incrementalRendering` and `alternateScreen` default to false; the normal
  renderer erases and rewrites the output when it changes.
- A small renderer probe changing one audio row in a 23-row frame wrote 2,024
  bytes and erased 24 lines in standard mode. Incremental mode wrote 151 bytes
  without erasing the frame. This confirms a redraw contributor, not every cause
  of the user's intermittent flicker.
- Audio sample updates and the separate 100 ms decay timer update state in the
  root App, while control and advanced RDS messages update it independently.
- The root consumes every terminal row. Ink has full-clear fallbacks for
  overflowing frames, shrinking out of fullscreen output and Windows fullscreen
  frames. These paths need tests, not assumptions that enabling incremental
  rendering alone solves everything.
- Header/footer text can wrap. RDS and station fields conditionally add/remove
  rows, moving nearby content. Reception and VU bar widths are not calculated
  from the actual panel width.
- Modal positioning uses estimated heights without enforcing them. Dialogs
  have their own hardcoded widths, and advanced RDS content has a variable height.
- Configuration write errors go directly to stderr during the active UI.
- Current UI tests use Ink debug mode, which bypasses normal terminal updates;
  they check content and navigation but do not validate erase/cursor behavior.

## Proposed layout

Use a 23-row canvas at 80×24, reserving the last terminal row to avoid bottom-row
scroll and fullscreen fallback behavior. Allocate every region explicitly:

| Region | Rows | Content |
| --- | ---: | --- |
| Header | 1 | Server name, connection state, users and ping |
| Receiver | 5 | Prominent frequency, signal/stereo, bandwidth, antenna, iMS/EQ |
| RDS and station | 8 | Two stable columns with fixed field positions |
| RadioText | 6 | Title, RT-A, RT-B and a reserved RT+ row |
| Audio | 2 | Left/right meters, playback state and volume |
| Footer | 1 | Short keyboard hints or a transient status message |

```text
Matrix · connected                          Users 2   Ping 53 ms
┌ Receiver ────────────────────────────────────────────────────┐
│ 98.500 MHz          Signal 62.4 dBf  ███████░░░  Stereo       │
│ BW Auto   Ant Default   iMS off   EQ off                      │
└──────────────────────────────────────────────────────────────┘
┌ RDS ────────────────────────┬ Station ───────────────────────┐
│ PI / PS                     │ Name / location                │
│ PTY / flags                 │ Distance / bearing             │
│ Long PS / PTYN / AF          │ ERP / polarization             │
└─────────────────────────────┴────────────────────────────────┘
┌ RadioText ───────────────────────────────────────────────────┐
│ RT-A                                                         │
│ RT-B                                                         │
│ RT+ title / artist                                           │
└──────────────────────────────────────────────────────────────┘
L ██████░░░░   R █████░░░░░                  Playing   Vol 100%
t tune  m servers  b bandwidth  a details  h help  Esc servers
```

This sketch illustrates information placement; the row budget above is the
implementation specification. Preserve rows for unavailable data using placeholders.
At 120 columns and wider, expand station/RDS details; at greater heights expand
metadata space. Core tuning and audio controls stay in the same regions.
Keep 80×24 as the initial minimum and retain the existing too-small screen below it.

## Escape navigation

- **Tuner screen:** Esc opens the same recent-server selector shown at startup.
  The m shortcut remains an alias for opening that selector.
- **Tuner dialogs:** Esc closes the dialog and returns to the tuner screen.
- **Public directory or manual URL entry:** Esc returns to the recent-server selector.
- **Recent-server selector:** Esc quits, whether reached at startup or from the tuner.
- **Ctrl+C:** Quits from every screen and restores terminal state.

Opening the selector preserves the active connection and audio until another
server is selected or the app exits. Highlight the current server when returning
from the tuner. Update footer hints, help text and keyboard tests to match these
transitions, including after resizing below the minimum terminal size.

## Implementation sequence

1. **Measure the current render path.** Add optional diagnostics that write to
   a file, recording frame dimensions, render rate, output bytes, full-clear
   sequences and the update source. Replay changing metadata and audio with
   bursts and long idle periods. Capture a baseline before changing layout.
2. **Fix terminal rendering.** Enable Ink incremental rendering and alternate
   screen for interactive sessions, start with a 15 FPS render cap, and use Ink's
   automatic synchronized-output support where available. Reserve the final row,
   bound all text and keep ordinary telemetry updates out of full-clear paths.
   Preserve non-TTY behavior and screen-reader compatibility. Route active-UI
   errors to a status area and debug output to a file.
3. **Separate update responsibilities.** Move VU samples, peak hold and decay
   into a small audio component/store with one 10 Hz UI clock. Coalesce telemetry
   into display snapshots at up to 10 Hz; compare displayed values before
   committing them. Memoize stable panels with narrow props. Preserve complete
   decoder data and process every command; only presentation updates are coalesced.
   Tune/reset actions must appear promptly, not wait for the next network tick.
4. **Implement bounded layout and dialogs.** Centralize region geometry, panel
   widths and terminal-size changes. Keep stable labels and reserved rows, size
   meters to their available columns and truncate long headers/URLs. Give dialogs
   explicit bounds and real centering; scroll selectors/details that exceed those
   bounds. Keep a frozen display snapshot behind a dialog while the connection
   continues processing incoming data. Closing it displays the latest state.
   Implement the Escape navigation above through shared screen navigation so
   individual input handlers do not give Escape conflicting meanings.
5. **Verify sustained use.** Add tests using normal interactive rendering and
   an ANSI terminal emulator, alongside existing content/navigation tests. Cover
   80×24, 100×30, 120×40, long names/URLs, full RDS metadata, Unicode, field removal,
   dialog transitions, reconnects, server changes and repeated resize cycles.
   Use Matrix for a live session without tuning changes; use recorded/synthetic
   data for populated RDS fields when the live frequency has no decoded RDS.

## Acceptance criteria

- No scrolling or whole-screen erase during steady telemetry/audio updates after
  initial display; deliberate resize, screen transitions and teardown are measured
  separately and may require a full repaint.
- Visible output fits within terminal width and rows minus one; no truncated
  essential controls or moving field labels as data appears/disappears.
- Idle unchanged data produces no repeated frame writes. Audio updates remain
  bounded to the configured cadence and chiefly change the audio rows.
- Opening/closing every dialog leaves no stale text or visible intermediate blank
  frame. Lists and advanced details remain navigable at the minimum size.
- Escape follows the specified back-to-selector flow; Ctrl+C exits immediately
  from every screen, with no duplicate handlers or accidental tuning commands.
- Input remains responsive during bursts, playback continues through dialogs,
  and exiting restores cursor visibility and the original terminal screen.
- A 30-minute live/replay soak has no growing render queue or redraw rate. Confirm
  visual behavior on the user's terminal plus macOS, Linux and Windows terminals;
  CI output assertions alone cannot prove the absence of visible flicker.

Implementation should proceed in two reviewable stages: refresh fixes with the
existing layout, then the new layout and bounded dialogs. Keep this CLI-only.
