export type SafeZonePreset = 'instagram-reels' | 'instagram-story' | 'instagram-feed' | 'tiktok' | 'youtube-shorts';

export interface SafeZoneConfig {
  id: SafeZonePreset;
  label: string;
  // Safe zone bounds as percentage of video dimensions
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const SAFE_ZONE_PRESETS: SafeZoneConfig[] = [
  { id: 'instagram-reels', label: 'Instagram Reels', top: 12, bottom: 18, left: 4, right: 4 },
  { id: 'instagram-story', label: 'Instagram Story', top: 10, bottom: 15, left: 5, right: 5 },
  { id: 'instagram-feed', label: 'Instagram Feed', top: 8, bottom: 12, left: 5, right: 5 },
  { id: 'tiktok', label: 'TikTok For You', top: 12, bottom: 20, left: 4, right: 4 },
  { id: 'youtube-shorts', label: 'YouTube Shorts', top: 10, bottom: 18, left: 5, right: 5 },
];

// Helper to render safe zone overlay on canvas
export const renderSafeZone = (
  ctx: CanvasRenderingContext2D,
  preset: SafeZoneConfig,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number
) => {
  ctx.save();
  ctx.globalAlpha = opacity / 100;
  
  // Calculate safe zone bounds
  const top = (preset.top / 100) * canvasHeight;
  const bottom = canvasHeight - (preset.bottom / 100) * canvasHeight;
  const left = (preset.left / 100) * canvasWidth;
  const right = canvasWidth - (preset.right / 100) * canvasWidth;
  
  // Draw semi-transparent overlay outside safe zone
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  
  // Top area
  ctx.fillRect(0, 0, canvasWidth, top);
  // Bottom area
  ctx.fillRect(0, bottom, canvasWidth, canvasHeight - bottom);
  // Left area (between top and bottom)
  ctx.fillRect(0, top, left, bottom - top);
  // Right area (between top and bottom)
  ctx.fillRect(right, top, canvasWidth - right, bottom - top);
  
  // Draw safe zone border
  ctx.strokeStyle = '#F5A623';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(left, top, right - left, bottom - top);
  
  ctx.restore();
};
