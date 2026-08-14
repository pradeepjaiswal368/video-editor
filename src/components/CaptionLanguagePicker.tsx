import React from 'react';
import { CaptionLanguage, CAPTION_LANGUAGES } from '../types/video';

interface CaptionLanguagePickerProps {
  value: CaptionLanguage;
  onChange: (lang: CaptionLanguage) => void;
  disabled?: boolean;
}

/** Captions output language: Hinglish, Hindi script, or English. The choice is
 *  applied on the next transcription run (or Re-transcribe). */
export const CaptionLanguagePicker: React.FC<CaptionLanguagePickerProps> = ({
  value,
  onChange,
  disabled
}) => {
  const current = CAPTION_LANGUAGES.find((l) => l.id === value) ?? CAPTION_LANGUAGES[0];

  return (
    <label
      className="caption-lang-picker"
      title={`Captions: ${current.hint}. Pick, then transcribe (or Re-transcribe) to apply.`}
    >
      <span className="caption-lang-label">Captions</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CaptionLanguage)}
        disabled={disabled}
      >
        {CAPTION_LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
};
