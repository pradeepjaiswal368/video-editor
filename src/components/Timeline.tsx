import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ProjectState } from '../types/video';
import { Scissors, Trash2, ZoomIn, ZoomOut, Maximize2, Undo2, Redo2 } from 'lucide-react';

interface TimelineProps {
  state: ProjectState;
  onChangePlayhead: (time: number) => void;
  onSplitClip: (clipId: string, time: number) => void;
  onDeleteClip: (clipId: string) => void;
  onSelectClip: (clipId: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const MIN_ZOOM = 2;
const MAX_ZOOM = 240;

/** Nice-number ladder so ruler labels stay ~70px apart at any zoom. */
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

const pickTickStep = (pxPerSec: number) => {
  const target = 70; // px between labels
  return (
    TICK_STEPS.find((s) => s * pxPerSec >= target) ?? TICK_STEPS[TICK_STEPS.length - 1]
  );
};

const formatTick = (t: number, step: number) => {
  if (step < 1) return `${t.toFixed(1)}s`;
  if (t < 60) return `${Math.round(t)}s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const Timeline: React.FC<TimelineProps> = ({
  state,
  onChangePlayhead,
  onSplitClip,
  onDeleteClip,
  onSelectClip,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const { media, clips, activeClipId, playhead, isPlaying } = state;
  const [zoom, setZoom] = useState(24); // pixels per second
  const [scrubbing, setScrubbing] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef(62);

  const totalDuration =
    clips.reduce((acc, clip) => acc + (clip.end - clip.start), 0) || media?.duration || 0;

  // The gutter is a CSS variable so the two stay in sync automatically.
  useLayoutEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const raw = getComputedStyle(el).getPropertyValue('--track-gutter');
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) gutterRef.current = parsed;
  }, []);

  /** Pointer x -> timeline seconds. */
  const timeAtClientX = useCallback(
    (clientX: number) => {
      const el = workspaceRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft - gutterRef.current;
      return Math.max(0, Math.min(totalDuration, x / zoom));
    },
    [totalDuration, zoom]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Capture keeps the drag alive outside the element; not fatal if refused.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no active pointer (synthetic event) — drag still works via move events */
    }
    setScrubbing(true);
    onChangePlayhead(timeAtClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Browsers already coalesce pointermove to one event per frame, so seeking
    // straight away is cheap and avoids a frame of scrub latency.
    if (!scrubbing) return;
    onChangePlayhead(timeAtClientX(e.clientX));
  };

  const endScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setScrubbing(false);
  };

  /** Ctrl/Cmd+wheel zooms about the cursor; shift+wheel scrolls sideways. */
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = workspaceRef.current;
    if (!el) return;

    if (e.ctrlKey || e.metaKey) {
      const anchorTime = timeAtClientX(e.clientX);
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      if (next === zoom) return;
      setZoom(next);
      // Keep the time under the cursor pinned in place.
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.scrollLeft = anchorTime * next + gutterRef.current - (e.clientX - rect.left);
      });
    } else if (e.shiftKey) {
      el.scrollLeft += e.deltaY;
    }
  };

  const zoomToFit = () => {
    const el = workspaceRef.current;
    if (!el || !totalDuration) return;
    const usable = el.clientWidth - gutterRef.current - 24;
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, usable / totalDuration)));
    el.scrollLeft = 0;
  };

  // Keep the playhead in view during playback.
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el || !isPlaying || scrubbing) return;

    const x = playhead * zoom + gutterRef.current;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    const margin = 60;

    if (x < left + margin || x > right - margin) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.5);
    }
  }, [playhead, zoom, isPlaying, scrubbing]);

  if (!media) return null;

  const tickStep = pickTickStep(zoom);
  const contentWidth = Math.max(totalDuration * zoom, 1);
  const playheadLeft = playhead * zoom;

  const renderRulerTicks = () => {
    const ticks = [];
    const count = Math.ceil(totalDuration / tickStep);
    for (let i = 0; i <= count; i++) {
      const time = i * tickStep;
      ticks.push(
        <div key={i} className="ruler-tick" style={{ left: `${time * zoom}px` }}>
          <span className="tick-label">{formatTick(time, tickStep)}</span>
        </div>
      );
    }
    return ticks;
  };

  const handleSplit = () => {
    if (!activeClipId) return;
    onSplitClip(activeClipId, playhead);
  };

  const handleDelete = () => {
    if (!activeClipId) return;
    onDeleteClip(activeClipId);
  };

  return (
    <div className="timeline-container">
      <div className="timeline-toolbar">
        <div className="toolbar-left">
          <button
            className="toolbar-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (⌘Z)"
          >
            <Undo2 size={14} />
            <span>Undo</span>
          </button>
          <button
            className="toolbar-btn"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (⇧⌘Z)"
          >
            <Redo2 size={14} />
          </button>

          <span className="toolbar-divider" />

          <button
            className="toolbar-btn"
            disabled={!activeClipId}
            onClick={handleSplit}
            title="Split clip at playhead"
          >
            <Scissors size={14} />
            <span>Split</span>
          </button>
          <button
            className="toolbar-btn text-red"
            disabled={!activeClipId}
            onClick={handleDelete}
            title="Delete selected clip"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>

        <div className="toolbar-right">
          <button className="zoom-btn" onClick={zoomToFit} title="Zoom to fit">
            <Maximize2 size={13} />
          </button>
          <button
            className="zoom-btn"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.4))}
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="zoom-label">{Math.round(zoom)} px/s</span>
          <button
            className="zoom-btn"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.4))}
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div
        ref={workspaceRef}
        className={`timeline-workspace ${scrubbing ? 'is-scrubbing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onWheel={handleWheel}
      >
        <div className="timeline-ruler" style={{ width: `${contentWidth}px` }}>
          {renderRulerTicks()}
        </div>

        <div className="timeline-tracks" style={{ width: `${contentWidth}px` }}>
          <div
            className={`timeline-playhead-line ${isPlaying && !scrubbing ? 'is-following' : ''}`}
            style={{ transform: `translateX(${playheadLeft}px)` }}
          >
            <div className="playhead-pointer" />
          </div>

          <div className="timeline-track video-track">
            <div className="track-header-tag">VIDEO</div>
            {clips.map((clip, idx) => {
              const clipDuration = clip.end - clip.start;
              const isSelected = clip.id === activeClipId;

              return (
                <div
                  key={clip.id}
                  className={`timeline-clip video-clip-block ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${clip.timelineStart * zoom}px`,
                    width: `${clipDuration * zoom}px`
                  }}
                  onPointerDown={() => onSelectClip(clip.id)}
                >
                  <span className="clip-name">
                    Clip {idx + 1} ({clipDuration.toFixed(1)}s)
                  </span>
                  <div className="clip-pan-indicator">Pan: {clip.panOffset}%</div>
                </div>
              );
            })}
          </div>

          {state.overlays?.length > 0 && (
            <div className="timeline-track fx-track">
              <div className="track-header-tag">FX</div>
              {state.overlays.map((o) => (
                <div
                  key={o.id}
                  className="timeline-clip motion-block"
                  style={{
                    left: `${o.start * zoom}px`,
                    width: `${Math.max(14, (o.end - o.start) * zoom)}px`
                  }}
                  title={`${o.kind} · ${o.start.toFixed(1)}s–${o.end.toFixed(1)}s`}
                >
                  <span className="clip-name">{o.kind.replace(/-/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}

          {state.sfxCues?.length > 0 && (
            <div className="timeline-track sfx-track">
              <div className="track-header-tag">SFX</div>
              {state.sfxCues.map((c) => (
                <div
                  key={c.id}
                  className="sfx-marker"
                  style={{ left: `${c.at * zoom}px` }}
                  title={`${c.kind} @ ${c.at.toFixed(2)}s`}
                >
                  <span>{c.kind}</span>
                </div>
              ))}
            </div>
          )}

          <div className="timeline-track text-track">
            <div className="track-header-tag">TEXT</div>
            {state.transcription
              .filter((w) => !w.deleted)
              .map((w, idx) => (
                <div
                  key={idx}
                  className="timeline-word-block"
                  style={{
                    left: `${w.start * zoom}px`,
                    width: `${Math.max(6, (w.end - w.start) * zoom)}px`
                  }}
                  title={w.word}
                >
                  {w.word}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
