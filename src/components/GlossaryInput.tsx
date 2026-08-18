import React, { useState } from 'react';
import { BookOpen, Check } from 'lucide-react';

interface GlossaryInputProps {
  /** Saved terms — names, brands, slang the creator wants spelled right. */
  glossary: string[];
  onChange: (terms: string[]) => void;
  /** Whether the post-transcription AI accuracy pass runs. */
  fixCaptions: boolean;
  onChangeFixCaptions: (on: boolean) => void;
  disabled?: boolean;
  /** Compact styling for the narrow transcript panel. */
  compact?: boolean;
}

/** Creator vocabulary + accuracy toggle. Terms typed here are injected into
 *  the Whisper prompt AND the AI correction pass, so names, brands and slang
 *  ("Raj Shamani", "UPI", "crore", "yaar") stop getting mangled. */
export const GlossaryInput: React.FC<GlossaryInputProps> = ({
  glossary,
  onChange,
  fixCaptions,
  onChangeFixCaptions,
  disabled,
  compact
}) => {
  const [draft, setDraft] = useState(glossary.join(', '));
  const [savedFlash, setSavedFlash] = useState(false);

  // Keep the draft in sync when the saved terms change (e.g. the other mounted
  // instance saved first). Done during render — the React-recommended way to
  // adjust state when a prop changes — instead of in an effect.
  const [prevGlossary, setPrevGlossary] = useState(glossary);
  if (glossary !== prevGlossary) {
    setPrevGlossary(glossary);
    setDraft(glossary.join(', '));
  }

  const handleSave = () => {
    const terms = draft
      .split(/[,，\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t, i, arr) => arr.indexOf(t) === i); // dedupe, keep order
    onChange(terms);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className={`glossary-box ${compact ? 'compact' : ''}`}>
      <div className="glossary-header">
        <BookOpen size={13} />
        <span>Vocabulary — names, brands, slang</span>
      </div>
      <textarea
        className="glossary-input"
        rows={compact ? 2 : 3}
        placeholder="e.g. Raj Shamani, UPI, crore, yaar, subscribe"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
      />
      <div className="glossary-footer">
        <button
          type="button"
          className="glossary-save-btn"
          onClick={handleSave}
          disabled={disabled}
          title="Save these terms; they are injected into Whisper and the correction pass on the next transcription"
        >
          <Check size={11} />
          {savedFlash ? 'Saved' : 'Save'}
        </button>
        <label
          className="checkbox-label glossary-fix"
          title="After Whisper, run LLaMA over the captions to fix romanization, spelling, punctuation and hallucinated words (keeps word timings)"
        >
          <input
            type="checkbox"
            checked={fixCaptions}
            onChange={(e) => onChangeFixCaptions(e.target.checked)}
            disabled={disabled}
          />
          Auto-fix captions with AI
        </label>
      </div>
    </div>
  );
};
