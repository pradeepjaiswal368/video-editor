import React, { useState, useEffect, useRef } from 'react';
import { TranscriptionWord, CaptionStyle, CaptionLanguage } from '../types/video';
import { Trash, Edit, RefreshCw, Check, Sparkles, Sliders, Save, X } from 'lucide-react';
import { CaptionLanguagePicker } from './CaptionLanguagePicker';
import { GlossaryInput } from './GlossaryInput';
import { renderCaptionPhrase } from '../utils/captionRender';
import {
  buildCustomCaptionPreset,
  saveCustomCaptionPreset,
  listCustomCaptionPresets,
  deleteCustomCaptionPreset
} from '../data/skills';

/* Fonts the style builder offers. Self-hosted families render everywhere;
   the rest fall back to system fonts (as the built-in presets already do). */
const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'Inter', label: 'Inter — clean sans' },
  { value: 'Space Grotesk', label: 'Space Grotesk — display' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono — mono' },
  { value: 'Impact', label: 'Impact — heavy' },
  { value: 'Georgia', label: 'Georgia — serif' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Brush Script MT, Segoe Script, cursive', label: 'Cursive — script' },
  { value: 'monospace', label: 'Monospace — generic' }
];

interface TranscriptEditorProps {
  transcription: TranscriptionWord[];
  playhead: number;
  captionStyle: CaptionStyle;
  onChangeStyle: (style: CaptionStyle) => void;
  onUpdateWord: (index: number, updated: Partial<TranscriptionWord>) => void;
  onSeek: (time: number) => void;
  /** Re-runs the whisper + curation pipeline on the loaded media. */
  onRetranscribe?: () => void;
  retranscribing?: boolean;
  /** Caption output language; applied on the next transcription run. */
  captionLanguage?: CaptionLanguage;
  onChangeCaptionLanguage?: (lang: CaptionLanguage) => void;
  /** Creator vocabulary + accuracy toggle, shared with the trigger screen. */
  glossary?: string[];
  onGlossaryChange?: (terms: string[]) => void;
  fixCaptions?: boolean;
  onFixCaptionsChange?: (on: boolean) => void;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  transcription,
  playhead,
  captionStyle,
  onChangeStyle,
  onUpdateWord,
  onSeek,
  onRetranscribe,
  retranscribing,
  captionLanguage,
  onChangeCaptionLanguage,
  glossary,
  onGlossaryChange,
  fixCaptions,
  onFixCaptionsChange
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'style'>('text');

  // Pre-configured style presets
  const presets = {
    hormozi: {
      name: 'Hormozi Bold',
      style: {
        fontFamily: 'Impact',
        fontSize: 70,
        primaryColor: '#FFFFFF',
        activeWordColor: '#FFE600', // Yellow
        strokeColor: '#000000',
        strokeWidth: 8,
        uppercase: true,
        activeWordScale: 1.3,
        positionY: 70,
        animatePop: true,
        addEmojis: true
      }
    },
    cyberpunk: {
      name: 'Neon Cyber',
      style: {
        fontFamily: 'monospace',
        fontSize: 65,
        primaryColor: '#00F0FF', // Cyan
        activeWordColor: '#BD00FF', // Purple-magenta
        strokeColor: '#0A0A0E',
        strokeWidth: 10,
        uppercase: true,
        activeWordScale: 1.2,
        positionY: 65,
        animatePop: true,
        addEmojis: false
      }
    },
    classic: {
      name: 'Classic Sub',
      style: {
        fontFamily: 'Arial',
        fontSize: 50,
        primaryColor: '#FFFFFF',
        activeWordColor: '#00FF66', // Lime green
        strokeColor: '#000000',
        strokeWidth: 5,
        uppercase: false,
        activeWordScale: 1.1,
        positionY: 80,
        animatePop: false,
        addEmojis: false
      }
    }
  };

  const applyPreset = (presetStyle: CaptionStyle) => {
    onChangeStyle(presetStyle);
  };

  const handleWordClick = (word: TranscriptionWord) => {
    onSeek(word.start);
  };

  const handleEditClick = (e: React.MouseEvent, index: number, currentText: string) => {
    e.stopPropagation();
    setEditingIndex(index);
    setEditText(currentText);
  };

  const handleSaveWord = (index: number) => {
    onUpdateWord(index, { word: editText });
    setEditingIndex(null);
  };

  const handleDeleteWord = (e: React.MouseEvent, index: number, isDeleted: boolean) => {
    e.stopPropagation();
    onUpdateWord(index, { deleted: !isDeleted });
  };

  /* --------------------------------------------------- style builder ----- */
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [saveName, setSaveName] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);

  // Live preview mirrors the exact renderer used by the player and export.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // Fake footage: gradient frame + subject silhouette.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3a4150');
    g.addColorStop(1, '#101216');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.24, W * 0.21, H * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sample phrase: the transcript's opening words when available.
    const source = transcription.filter((w) => !w.deleted);
    const fallback = ['This', 'is', 'your', 'caption'].map((word, i) => ({
      word, start: i, end: i + 1, highlighted: false, deleted: false
    }));
    const words = source.length >= 2 ? source.slice(0, 5) : fallback;
    const middle = words[Math.floor((words.length - 1) / 2)];
    renderCaptionPhrase(ctx, words, captionStyle, (middle.start + middle.end) / 2, W, H);
  }, [captionStyle, transcription]);

  const handleSavePreset = () => {
    const preset = buildCustomCaptionPreset(saveName, captionStyle);
    saveCustomCaptionPreset(preset);
    setSaveName('');
    setSavedTick((t) => t + 1);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const applyStyleFromPreset = (style: Partial<CaptionStyle>) => {
    onChangeStyle({ ...captionStyle, ...style });
  };

  return (
    <div className="transcript-panel">
      {/* Tabs */}
      <div className="transcript-tabs">
        <button
          className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          <Sparkles size={16} />
          Transcript Edit
        </button>
        <button
          className={`tab-btn ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
        >
          <Sliders size={16} />
          Caption Style
        </button>

        {onChangeCaptionLanguage && captionLanguage && (
          <CaptionLanguagePicker
            value={captionLanguage}
            onChange={onChangeCaptionLanguage}
            disabled={retranscribing}
          />
        )}

        {onRetranscribe && (
          <button
            type="button"
            className="retranscribe-btn"
            onClick={onRetranscribe}
            disabled={retranscribing}
            title="Re-run Whisper transcription on the loaded video"
          >
            <RefreshCw size={12} className={retranscribing ? 'is-spinning' : ''} />
            {retranscribing ? 'Transcribing…' : 'Re-transcribe'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'text' && (
          <div className="transcript-text-container">
            <div className="transcript-instructions">
              💡 <span>Click a word to seek the preview. Hover to edit spelling or cut/delete that word from video playback.</span>
            </div>

            {glossary && onGlossaryChange && fixCaptions !== undefined && onFixCaptionsChange && (
              <GlossaryInput
                glossary={glossary}
                onChange={onGlossaryChange}
                fixCaptions={fixCaptions}
                onChangeFixCaptions={onFixCaptionsChange}
                disabled={retranscribing}
                compact
              />
            )}

            <div className="words-flow">
              {transcription.length === 0 ? (
                <div className="empty-transcript">
                  No transcription loaded. Upload a video and request transcription.
                </div>
              ) : (
                transcription.map((w, idx) => {
                  const isActive = playhead >= w.start && playhead <= w.end;
                  
                  return (
                    <span
                      key={idx}
                      className={`word-span ${isActive ? 'active' : ''} ${w.deleted ? 'deleted' : ''}`}
                      onClick={() => handleWordClick(w)}
                    >
                      {editingIndex === idx ? (
                        <span className="inline-edit" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveWord(idx)}
                            autoFocus
                          />
                          <button className="small-save-btn" onClick={() => handleSaveWord(idx)}>
                            <Check size={12} />
                          </button>
                        </span>
                      ) : (
                        <>
                          <span className="word-text">{w.word}</span>
                          <span className="word-actions">
                            <button
                              className="word-action-btn edit"
                              onClick={(e) => handleEditClick(e, idx, w.word)}
                              title="Correct spelling"
                            >
                              <Edit size={10} />
                            </button>
                            <button
                              className={`word-action-btn delete ${w.deleted ? 'active' : ''}`}
                              onClick={(e) => handleDeleteWord(e, idx, !!w.deleted)}
                              title={w.deleted ? "Restore word" : "Cut word from video"}
                            >
                              <Trash size={10} />
                            </button>
                          </span>
                        </>
                      )}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'style' && (
          <div className="style-settings">
            {/* Custom Style Builder — live preview + save as palette preset */}
            <div className="style-section builder-section">
              <label>Custom Style — Live Preview</label>
              <div className="builder-layout">
                <canvas ref={previewRef} className="caption-builder-preview" width={180} height={320} />
                <div className="builder-controls">
                  <p className="builder-hint">
                    Tune the controls below and save the look as a preset — it appears in the
                    ⚡ Skills → Caption palette and works as a slash command.
                  </p>

                  <div className="builder-save-row">
                    <input
                      type="text"
                      className="builder-name-input"
                      placeholder="Preset name (e.g. Money Shot)"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                      maxLength={40}
                    />
                    <button
                      type="button"
                      className="builder-save-btn"
                      onClick={handleSavePreset}
                      title="Save as a new preset in the Skills palette"
                    >
                      <Save size={12} />
                      {savedFlash ? 'Saved!' : 'Save Preset'}
                    </button>
                  </div>

                  <div className="custom-presets-list" key={savedTick}>
                    {listCustomCaptionPresets().length === 0 ? (
                      <span className="custom-presets-empty">No saved custom styles yet.</span>
                    ) : (
                      listCustomCaptionPresets().map((p) => (
                        <div key={p.id} className="custom-preset-row">
                          <button
                            type="button"
                            className="custom-preset-apply"
                            onClick={() => {
                              const cmd = p.commands?.[0] as (Partial<CaptionStyle> & { type?: string }) | undefined;
                              if (cmd) {
                                const { type: _type, ...style } = cmd;
                                applyStyleFromPreset(style);
                              }
                            }}
                            title="Apply this style"
                          >
                            <span
                              className="custom-preset-dot"
                              style={{
                                background:
                                  p.preview.caption?.accentColor ||
                                  p.preview.caption?.color ||
                                  '#fff'
                              }}
                            />
                            {p.name}
                          </button>
                          <button
                            type="button"
                            className="custom-preset-delete"
                            title="Delete this preset"
                            onClick={() => {
                              deleteCustomCaptionPreset(p.id);
                              setSavedTick((t) => t + 1);
                            }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Presets Row */}
            <div className="style-section">
              <label>Layout Presets</label>
              <div className="presets-grid">
                <button
                  className={`preset-btn ${captionStyle.fontFamily === 'Impact' ? 'selected' : ''}`}
                  onClick={() => applyPreset(presets.hormozi.style)}
                >
                  <span className="preset-preview hormozi">Abc</span>
                  <span className="preset-name">{presets.hormozi.name}</span>
                </button>
                <button
                  className={`preset-btn ${captionStyle.primaryColor === '#00F0FF' ? 'selected' : ''}`}
                  onClick={() => applyPreset(presets.cyberpunk.style)}
                >
                  <span className="preset-preview cyberpunk">Abc</span>
                  <span className="preset-name">{presets.cyberpunk.name}</span>
                </button>
                <button
                  className={`preset-btn ${captionStyle.fontFamily === 'Arial' ? 'selected' : ''}`}
                  onClick={() => applyPreset(presets.classic.style)}
                >
                  <span className="preset-preview classic">Abc</span>
                  <span className="preset-name">{presets.classic.name}</span>
                </button>
              </div>
            </div>

            {/* Custom Control Sliders */}
            <div className="style-section">
              <label>Font Family</label>
              <select
                className="style-font-select"
                value={FONT_OPTIONS.some((f) => f.value === captionStyle.fontFamily) ? captionStyle.fontFamily : ''}
                onChange={(e) => e.target.value && applyStyleFromPreset({ fontFamily: e.target.value })}
              >
                {!FONT_OPTIONS.some((f) => f.value === captionStyle.fontFamily) && (
                  <option value="">{captionStyle.fontFamily || '— custom font —'}</option>
                )}
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="style-section">
              <label>Font Size ({captionStyle.fontSize}px)</label>
              <input
                type="range"
                min="30"
                max="120"
                value={captionStyle.fontSize}
                onChange={e => onChangeStyle({ ...captionStyle, fontSize: parseInt(e.target.value) })}
                className="style-range"
              />
            </div>

            <div className="style-section">
              <label>Active Word Scale ({captionStyle.activeWordScale.toFixed(2)}×)</label>
              <input
                type="range"
                min="1"
                max="2"
                step="0.05"
                value={captionStyle.activeWordScale}
                onChange={e => onChangeStyle({ ...captionStyle, activeWordScale: parseFloat(e.target.value) })}
                className="style-range"
              />
            </div>

            <div className="style-section">
              <label>Caption Position ({captionStyle.positionY}% from top)</label>
              <input
                type="range"
                min="10"
                max="90"
                value={captionStyle.positionY}
                onChange={e => onChangeStyle({ ...captionStyle, positionY: parseInt(e.target.value) })}
                className="style-range"
              />
            </div>

            <div className="style-row">
              <div className="style-section half">
                <label>Text Color</label>
                <div className="color-picker-container">
                  <input
                    type="color"
                    value={captionStyle.primaryColor}
                    onChange={e => onChangeStyle({ ...captionStyle, primaryColor: e.target.value })}
                  />
                  <span>{captionStyle.primaryColor}</span>
                </div>
              </div>
              <div className="style-section half">
                <label>Active Word Color</label>
                <div className="color-picker-container">
                  <input
                    type="color"
                    value={captionStyle.activeWordColor}
                    onChange={e => onChangeStyle({ ...captionStyle, activeWordColor: e.target.value })}
                  />
                  <span>{captionStyle.activeWordColor}</span>
                </div>
              </div>
            </div>

            <div className="style-row">
              <div className="style-section half">
                <label>Outline Color</label>
                <div className="color-picker-container">
                  <input
                    type="color"
                    value={captionStyle.strokeColor}
                    onChange={e => onChangeStyle({ ...captionStyle, strokeColor: e.target.value })}
                  />
                  <span>{captionStyle.strokeColor}</span>
                </div>
              </div>
              <div className="style-section half">
                <label>Outline Size ({captionStyle.strokeWidth}px)</label>
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={captionStyle.strokeWidth}
                  onChange={e => onChangeStyle({ ...captionStyle, strokeWidth: parseInt(e.target.value) })}
                  className="style-range"
                />
              </div>
            </div>

            <div className="toggles-grid">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={captionStyle.uppercase}
                  onChange={e => onChangeStyle({ ...captionStyle, uppercase: e.target.checked })}
                />
                Force UPPERCASE Text
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={captionStyle.addEmojis}
                  onChange={e => onChangeStyle({ ...captionStyle, addEmojis: e.target.checked })}
                />
                Auto Emojis (AI-Style)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={captionStyle.animatePop}
                  onChange={e => onChangeStyle({ ...captionStyle, animatePop: e.target.checked })}
                />
                Scale Active Word (Pop effect)
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!captionStyle.boxed}
                  onChange={e => onChangeStyle({
                    ...captionStyle,
                    boxed: e.target.checked,
                    boxColor: captionStyle.boxColor || 'rgba(0,0,0,0.62)'
                  })}
                />
                Background Box (subtitle bar)
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
