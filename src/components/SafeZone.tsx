import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { SafeZonePreset, SAFE_ZONE_PRESETS } from '../data/safeZonePresets';

interface SafeZoneProps {
  enabled: boolean;
  presetId: SafeZonePreset;
  opacity: number;
  onChangeEnabled: (enabled: boolean) => void;
  onChangePreset: (presetId: SafeZonePreset) => void;
  onChangeOpacity: (opacity: number) => void;
}

export const SafeZone: React.FC<SafeZoneProps> = ({
  enabled,
  presetId,
  opacity,
  onChangeEnabled,
  onChangePreset,
  onChangeOpacity
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="safe-zone-container">
      <button 
        className={`safe-zone-toggle ${enabled ? 'active' : ''}`}
        onClick={() => setShowDropdown(!showDropdown)}
      >
        Safe zone
        <ChevronDown size={14} />
      </button>
      
      {showDropdown && (
        <div className="safe-zone-dropdown">
          <div className="safe-zone-presets">
            {SAFE_ZONE_PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`safe-zone-preset ${preset.id === presetId ? 'selected' : ''}`}
                onClick={() => {
                  onChangePreset(preset.id);
                  onChangeEnabled(true);
                }}
              >
                {preset.label}
                {preset.id === presetId && <Check size={14} />}
              </button>
            ))}
          </div>
          
          <div className="safe-zone-opacity">
            <span>Opacity</span>
            <input
              type="range"
              min="10"
              max="100"
              value={opacity}
              onChange={(e) => onChangeOpacity(parseInt(e.target.value))}
            />
            <span>{opacity}%</span>
          </div>
          
          <button 
            className="safe-zone-close"
            onClick={() => setShowDropdown(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};
