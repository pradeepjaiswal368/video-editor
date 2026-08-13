import React, { useState } from 'react';
import { TranscriptionWord, CaptionStyle } from '../types/video';
import { Trash, Edit, RefreshCw, Check, Sparkles, Sliders } from 'lucide-react';

interface TranscriptEditorProps {
  transcription: TranscriptionWord[];
  playhead: number;
  captionStyle: CaptionStyle;
  onChangeStyle: (style: CaptionStyle) => void;
  onUpdateWord: (index: number, updated: Partial<TranscriptionWord>) => void;
  onSeek: (time: number) => void;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  transcription,
  playhead,
  captionStyle,
  onChangeStyle,
  onUpdateWord,
  onSeek
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
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'text' && (
          <div className="transcript-text-container">
            <div className="transcript-instructions">
              💡 <span>Click a word to seek the preview. Hover to edit spelling or cut/delete that word from video playback.</span>
            </div>
            
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
