import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SKILLS, Skill, SkillPreset, searchPresets } from '../data/skills';
import { PresetPreview } from './PresetPreview';
import { CornerDownLeft } from 'lucide-react';

interface SkillsMenuProps {
  /** Text typed after the `/` in the composer, used to filter. */
  query: string;
  /** Composer element the menu is positioned above. */
  anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (skill: Skill, preset: SkillPreset) => void;
  onClose: () => void;
  /** Lets the composer drive the menu with its own keydown events. */
  registerKeyHandler: (handler: (e: React.KeyboardEvent) => boolean) => void;
}

export const SkillsMenu: React.FC<SkillsMenuProps> = ({
  query,
  anchorRef,
  onPick,
  onClose,
  registerKeyHandler
}) => {
  const [cursor, setCursor] = useState({ q: query, skill: 0, preset: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // The composer sits inside overflow:hidden panels, so the menu is portalled
  // to the body and positioned against the composer rect instead.
  const [box, setBox] = useState<{ left: number; width: number; bottom: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 10;
      setBox({
        left: r.left,
        width: r.width,
        bottom: window.innerHeight - r.top + gap,
        maxH: Math.max(200, r.top - gap - 12)
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef]);

  // Skills that still have a matching preset under the current query.
  const visibleSkills = useMemo(() => {
    if (!query.trim()) return SKILLS;
    const hits = SKILLS.filter((s) => searchPresets(s, query).length > 0);
    return hits.length ? hits : SKILLS;
  }, [query]);

  // The cursor is stored alongside the query it was chosen under, so a changed
  // filter derives back to the first result rather than resetting in an effect.
  const fresh = cursor.q === query ? cursor : { q: query, skill: 0, preset: 0 };
  const skillIdx = Math.min(fresh.skill, visibleSkills.length - 1);

  const skill = visibleSkills[skillIdx];
  const presets = useMemo(() => searchPresets(skill, query), [skill, query]);
  const presetIdx = Math.min(fresh.preset, Math.max(0, presets.length - 1));
  const preset = presets[presetIdx];

  const resolve = (next: number | ((i: number) => number), cur: number) =>
    typeof next === 'function' ? next(cur) : next;

  /** Moving skills always re-homes the preset cursor. */
  const setSkillIdx = (next: number | ((i: number) => number)) =>
    setCursor({ q: query, skill: resolve(next, skillIdx), preset: 0 });
  const setPresetIdx = (next: number | ((i: number) => number)) =>
    setCursor({ q: query, skill: skillIdx, preset: resolve(next, presetIdx) });

  /* Keyboard and pointer both drive the cursor, so they have to be kept from
     fighting. Scrolling a row under a stationary cursor fires mouseenter but
     NOT mousemove, so hover is driven by mousemove with a coordinate check —
     the pointer only takes over once it has genuinely moved. */
  const lastPointer = useRef({ x: -1, y: -1 });
  const keyboardMode = useRef(false);

  const pointerMoved = (e: React.MouseEvent) => {
    const p = lastPointer.current;
    if (e.clientX === p.x && e.clientY === p.y) return false;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    keyboardMode.current = false;
    return true;
  };

  const hoverSkill = (i: number) => (e: React.MouseEvent) => {
    if (pointerMoved(e) && i !== skillIdx) setSkillIdx(i);
  };
  const hoverPreset = (i: number) => (e: React.MouseEvent) => {
    if (pointerMoved(e) && i !== presetIdx) setPresetIdx(i);
  };

  // Only chase the selection when the keyboard moved it; scrolling on hover
  // would yank the list out from under the pointer.
  useEffect(() => {
    if (!keyboardMode.current) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [skillIdx]);

  useEffect(() => {
    if (!keyboardMode.current) return;
    gridRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [presetIdx, skillIdx]);

  // The composer owns the input, so it forwards keys here and we report
  // whether we consumed them. Re-registered every render (it is just a ref
  // write) so the handler never closes over a stale cursor.
  useEffect(() => {
    registerKeyHandler((e: React.KeyboardEvent) => {
      // Measured, not assumed: the grid auto-fills 3-4 columns by width.
      const cols = Math.max(
        1,
        getComputedStyle(gridRef.current ?? document.body)
          .gridTemplateColumns.split(' ')
          .filter(Boolean).length
      );
      const NAV = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Tab'];
      if (NAV.includes(e.key)) keyboardMode.current = true;

      switch (e.key) {
        case 'Escape':
          onClose();
          return true;

        case 'ArrowDown':
          setSkillIdx((i) => (i + 1) % visibleSkills.length);
          return true;

        case 'ArrowUp':
          setSkillIdx((i) => (i - 1 + visibleSkills.length) % visibleSkills.length);
          return true;

        case 'ArrowRight':
          setPresetIdx((i) => Math.min(i + 1, presets.length - 1));
          return true;

        case 'ArrowLeft':
          setPresetIdx((i) => Math.max(i - 1, 0));
          return true;

        case 'PageDown':
          setPresetIdx((i) => Math.min(i + cols, presets.length - 1));
          return true;

        case 'PageUp':
          setPresetIdx((i) => Math.max(i - cols, 0));
          return true;

        case 'Tab':
          setPresetIdx((i) => (i + (e.shiftKey ? -1 : 1) + presets.length) % presets.length);
          return true;

        case 'Enter':
          if (preset) {
            onPick(skill, preset);
            return true;
          }
          return false;

        default:
          return false;
      }
    });
  });

  if (!box) return null;

  return createPortal(
    <div
      className="skills-menu"
      role="dialog"
      aria-label="Skills"
      style={{
        left: box.left,
        width: box.width,
        bottom: box.bottom,
        maxHeight: Math.min(420, box.maxH)
      }}
    >
      <div className="skills-body">
        {/* Skill categories */}
        <div className="skills-rail" ref={listRef} role="listbox" aria-label="Skill categories">
          {visibleSkills.map((s, i) => {
            const Icon = s.icon;
            const active = s === skill;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={active}
                data-active={active}
                className={`skill-row ${active ? 'active' : ''}`}
                onMouseMove={hoverSkill(i)}
                onClick={() => setSkillIdx(i)}
              >
                <span className="skill-icon" style={{ color: s.tint }}>
                  <Icon size={13} />
                </span>
                <span className="skill-row-name">{s.name}</span>
              </button>
            );
          })}
        </div>

        {/* Presets for the highlighted skill */}
        <div className="skills-presets">
          <div className="presets-head">
            <span>Pick a preset</span>
            <span className="presets-blurb">{skill.blurb}</span>
          </div>

          <div className="presets-scroll" ref={gridRef}>
            {presets.length === 0 ? (
              <div className="presets-empty">No preset matches “{query}”.</div>
            ) : (
              presets.map((p, i) => {
                const active = i === Math.min(presetIdx, presets.length - 1);
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-active={active}
                    className={`preset-tile ${active ? 'active' : ''}`}
                    onMouseMove={hoverPreset(i)}
                    onClick={() => onPick(skill, p)}
                    title={p.description}
                  >
                    <PresetPreview spec={p.preview} />
                    <span className="preset-tile-name">{p.id}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer mirrors the highlighted preset's slash command */}
      <div className="skills-foot">
        {preset ? (
          <span className="skills-foot-hint">
            Use <code>/{preset.id}</code> in your video
          </span>
        ) : (
          <span className="skills-foot-hint">Type to filter presets</span>
        )}

        <span className="skills-foot-keys">
          <span className="key-word">Enter</span>
          <kbd>
            <CornerDownLeft size={11} />
          </kbd>
        </span>
      </div>
    </div>,
    document.body
  );
};
