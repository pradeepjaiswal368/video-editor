# Future Implementations

Backlog for the Edith video editor, informed by hands-on research of Opus Clip
(our stated model) and the 2026 AI clipping/editing landscape — Vizard,
Submagic, Klap, Descript, CapCut, VEED, Munch, Reap. Items are grouped by
theme and roughly ordered by priority within each group.

Legend: `[ ]` open · `[x]` done

## Opus Clip & AI-editor landscape (2026 research)

The features the category leaders ship that we don't yet. Highest-leverage
differentiators first.

- [ ] **Multi-segment stitching** — Opus's signature move: build each short
      from non-contiguous "gold nuggets" stitched into one coherent clip
      (currently a short is a single contiguous range). Requires extending
      `ViralShort` to carry multiple segments and the player/timeline to play
      them in sequence.
- [ ] **Auto subject framing** — keep the speaker centered while the 9:16
      crop follows them, instead of a static pan (Opus's auto-reframe). Start
      with a lightweight face/motion heuristic on the canvas; MediaPipe
      upgrade later.
- [ ] **Transition effects** — smooth jump-cuts between clips (crossfade,
      dip-to-black, flash) instead of hard cuts, rendered in the preview and
      export (pairs with the existing whoosh SFX cues).
- [ ] **AI dubbing & multi-language audio** — translate the spoken track to
      50+ languages (VEED / Descript class), with subtitle translation as the
      text-only first step.
- [ ] **Social publishing / scheduler** — one-click export + post queue for
      TikTok, YouTube Shorts, Instagram Reels (Opus's share step).
- [ ] **Brand kits** — reusable logo + color + font kit applied consistently
      to captions, grades, and overlays (Opus's "brand kits").
- [ ] **Audio cleanup** — noise reduction, de-esser, and loudness
      normalization (Descript's audio polish).
- [ ] **More clips per video** — raise curation beyond the current 1-3 shorts
      toward Opus's "1 long video → 10 clips", with an auto-preview of every
      candidate.
- [ ] **Chat with your footage** — conversational multi-modal editing beyond
      the current copilot command set (Opus's stated future).
- [ ] **API / agent access** — expose clipping as a documented API or MCP
      surface so the editor can be driven programmatically.

## Finish flagged "Soon" features (biggest credibility wins)

- [ ] **Music beds** — synthesize lo-fi / drive / ambient beds with WebAudio
      following the `src/data/sfx.ts` pattern (render → cache → schedule),
      duck them under the voice track, mix them into the export, and
      re-enable the three Background Music presets in the skills palette.
- [ ] **B-roll from a second source** — let users import cutaway footage and
      insert it as timeline clips; re-enable the three Auto B-Roll presets.

## Captions (the core product)

- [ ] **Caption translation** — one LLaMA call to translate the transcript to
      English / other languages while keeping word timings.
- [ ] **Caption entrance animations** — slide-up, typewriter, and fade word
      entrances tied to the active word (in the shared caption renderer).
- [ ] **Persist captions language** — save the chosen Hinglish / Hindi /
      English picker value to localStorage so it survives refreshes.
- [ ] **More caption styles** — a kinetic style pack beyond the current 17
      presets (gradient fills need a canvas gradient-fill path first).
- [ ] **Live custom thumbnails** — show a custom preset's actual transcript
      words in the skills palette thumbnail instead of the generic "Aa".

## Templates & workflow

- [ ] **Templates system** — wire up the disabled "Templates" nav: save a
      combo of caption style + grade + motion overlays as a reusable
      template (natural extension of the caption style builder).
- [ ] **Save / load projects** — persist the full timeline to localStorage
      and export/import JSON (API key excluded), so work survives refresh.
- [ ] **Share style packs** — import/export custom caption presets as JSON so
      users can share style packs between projects and machines.
- [ ] **Favorite & reorder presets** — pin go-to caption styles to the top of
      the skills palette.

## Export

- [ ] **Export options** — aspect ratio (9:16 / 16:9 / 1:1) with per-platform
      safe-zone presets, resolution, bitrate, plus a progress bar with cancel.
- [ ] **Batch export** — export all curated shorts in one pass.

## Polish

- [ ] **Waveform on the timeline** — the silence-detection code already
      computes audio regions; paint a waveform strip to make trimming feel pro.
- [ ] **Keyboard shortcuts** — space to play/pause, J/K/L scrub, arrow-frame
      stepping (undo/redo already exists via Ctrl+Z / Ctrl+Shift+Z).
- [ ] **Transliterator unit tests** — lock in the Devanagari → Hinglish word
      fixtures (`src/utils/hinglish.ts`) with a test suite.

## Done

- [x] Monochrome "Graphite" premium redesign with self-hosted variable fonts
- [x] Skills overhaul: real comment-card / arrow / emoji overlays, animated
      camera drift, working Remove Filler, honest "Soon" flags
- [x] Hinglish caption pipeline: romanization prompt + deterministic
      Devanagari transliterator guaranteeing Latin-script captions
- [x] Caption language picker (Hinglish / Hindi script / English)
- [x] Re-transcribe button
- [x] Custom caption style builder with live preview + savable palette presets
- [x] Vercel Analytics + Speed Insights

## Research reference

- **OpusClip** — opus.pro (chapter-based curation, auto-reframe, animated
  captions, b-roll, templates/brand kits, one-click publishing)
- **Vizard** — auto-translate, avatars, social repurposing
- **Submagic** — trending caption styles, emoji packs
- **Klap** — fast multi-platform clipping
- **Descript** — edit video by editing text, audio cleanup, dubbing
- **CapCut** — mobile-first editing, templates, auto-cut
- **VEED** — browser editor, 50+ subtitle languages, AI dubbing
- **Munch / Reap** — platform-specific repurposing, benchmarking
