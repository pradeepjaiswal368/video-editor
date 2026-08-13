import React from 'react';
import { ViralShort } from '../types/video';
import { Play, TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface ClipListProps {
  shorts: ViralShort[];
  activeShortId: string | null;
  onSelectShort: (short: ViralShort) => void;
  isProcessing: boolean;
}

export const ClipList: React.FC<ClipListProps> = ({
  shorts,
  activeShortId,
  onSelectShort,
  isProcessing
}) => {
  const getScoreColorClass = (score: number) => {
    if (score >= 90) return 'score-high';
    if (score >= 70) return 'score-medium';
    return 'score-low';
  };

  const formatDuration = (start: number, end: number) => {
    const duration = end - start;
    return `${duration.toFixed(1)}s`;
  };

  return (
    <div className="clips-panel">
      <div className="panel-header">
        <TrendingUp size={16} className="accent-glow-purple" />
        <h2>AI Viral Clips</h2>
      </div>

      <div className="clips-container">
        {isProcessing && (
          <div className="processing-indicator">
            <div className="spinner"></div>
            <p>Groq LLaMA is analyzing the hook potentials and curating shorts...</p>
          </div>
        )}

        {!isProcessing && shorts.length === 0 && (
          <div className="empty-clips">
            <AlertCircle size={32} className="dimmed-icon" />
            <p>No viral shorts generated yet.</p>
            <span>Upload a video and start the AI curation pipeline to automatically slice engaging moments.</span>
          </div>
        )}

        {!isProcessing && shorts.length > 0 && (
          <div className="clips-list">
            <div className="list-instructions">
              🔥 <span>We found {shorts.length} potential viral shorts. Select a card to edit it on the timeline.</span>
            </div>

            {shorts.map((short) => {
              const isActive = short.id === activeShortId;
              
              return (
                <div
                  key={short.id}
                  className={`clip-card ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectShort(short)}
                >
                  <div className="clip-card-header">
                    <span className={`score-badge ${getScoreColorClass(short.score)}`}>
                      {short.score} Score
                    </span>
                    <span className="clip-duration">
                      <Clock size={12} />
                      {formatDuration(short.startTime, short.endTime)}
                    </span>
                  </div>

                  <h3 className="clip-title">{short.title}</h3>
                  <p className="clip-hook-analysis">{short.hookAnalysis}</p>

                  <div className="clip-play-indicator">
                    <Play size={12} fill="currentColor" />
                    <span>Load Clip & Edit</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
