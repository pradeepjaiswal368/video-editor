import { TranscriptionWord, ViralShort, ProjectState } from '../types/video';

const GROQ_API_URL = 'https://api.groq.com/openai/v1';

/**
 * Transcribes the audio WAV blob using Groq Whisper.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string
): Promise<TranscriptionWord[]> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');

  const response = await fetch(`${GROQ_API_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper transcription failed: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const wordsList: TranscriptionWord[] = [];

  // Parse words from verbose_json segments if available
  if (data.segments && data.segments.length > 0) {
    for (const segment of data.segments) {
      if (segment.words && segment.words.length > 0) {
        for (const w of segment.words) {
          // Remove punctuation from start/end of word for clean text matching, but keep it in transcription
          wordsList.push({
            word: w.word,
            start: w.start,
            end: w.end,
            highlighted: false,
            deleted: false
          });
        }
      } else {
        // Fallback: If word-level timestamps are missing, distribute segment words evenly
        const segmentText = segment.text.trim();
        const words = segmentText.split(/\s+/);
        const duration = segment.end - segment.start;
        const wordDuration = duration / Math.max(1, words.length);
        
        words.forEach((word: string, index: number) => {
          wordsList.push({
            word: word,
            start: segment.start + index * wordDuration,
            end: segment.start + (index + 1) * wordDuration,
            highlighted: false,
            deleted: false
          });
        });
      }
    }
  } else if (data.text) {
    // Ultimate fallback if no segments
    const words = data.text.trim().split(/\s+/);
    const wordDuration = 1.0; // dummy
    words.forEach((word: string, index: number) => {
      wordsList.push({
        word: word,
        start: index * wordDuration,
        end: (index + 1) * wordDuration,
        highlighted: false,
        deleted: false
      });
    });
  } else {
    throw new Error('No transcription text returned from Groq');
  }

  return wordsList;
}

/**
 * Uses Groq LLaMA to curate viral shorts from a transcription.
 */
export async function curateShorts(
  transcription: TranscriptionWord[],
  apiKey: string
): Promise<ViralShort[]> {
  // Build a concise transcript string with timestamps for LLaMA
  let transcriptText = '';
  // Sample every few words or group into sentences to keep token count manageable
  let currentGroup: string[] = [];
  let groupStart = 0;
  
  transcription.forEach((w, idx) => {
    if (currentGroup.length === 0) groupStart = w.start;
    currentGroup.push(w.word);
    
    if (currentGroup.length >= 12 || idx === transcription.length - 1) {
      transcriptText += `[${groupStart.toFixed(1)}s - ${w.end.toFixed(1)}s]: ${currentGroup.join(' ')}\n`;
      currentGroup = [];
    }
  });

  const systemPrompt = `You are an expert AI video producer for viral short-form content (TikTok, YouTube Shorts, Instagram Reels).
Your task is to analyze the transcription of a long-form video (with timestamps) and identify the top 1 to 3 most viral, cohesive, and high-retention segments (shorts) of roughly 15 to 45 seconds each.
Look for segments that:
- Start with a strong hook (a question, a shocking statement, or an engaging premise).
- End on a complete thought, punchline, or key takeaway.
- Maintain high information density or comedic value throughout.

For each segment, you must provide:
1. A viral-optimized Title (under 8 words, catchy, hooks attention).
2. Start time and End time in seconds, which MUST match the timestamp range in the transcript.
3. A Virality Score from 0 to 100 based on standard video marketing metrics (hook strength, retention likelihood, clarity).
4. A brief "hookAnalysis" justifying why this clip will perform well.

Response format requirements:
You MUST respond with a JSON object containing a "shorts" array. Do not include any markdown fences, explanation text, or conversational intro/outro. Only return the raw JSON matching this structure:
{
  "shorts": [
    {
      "title": "Title of Short",
      "startTime": 12.5,
      "endTime": 35.0,
      "score": 94,
      "hookAnalysis": "This segment begins with a strong counter-intuitive hook about productivity..."
    }
  ]
}
If no good segments are found, return an empty array.`;

  const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the transcript with timestamps:\n\n${transcriptText}` }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq AI curation failed: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response during clip curation.');

  try {
    const parsed = JSON.parse(content);
    if (!parsed.shorts || !Array.isArray(parsed.shorts)) {
      return [];
    }
    return parsed.shorts.map((s: any, idx: number) => ({
      id: `short-${idx + 1}`,
      title: s.title || `Viral Segment #${idx + 1}`,
      startTime: Number(s.startTime),
      endTime: Number(s.endTime),
      score: Number(s.score) || 85,
      hookAnalysis: s.hookAnalysis || 'Strong verbal delivery and cohesive topic.'
    }));
  } catch (err) {
    console.error('Error parsing LLaMA response content:', content, err);
    throw new Error('Failed to parse AI curation results from Groq.');
  }
}

export interface AICommandResponse {
  explanation: string;
  commands: {
    type:
      | 'TRIM_CLIP'
      | 'SPLIT_CLIP'
      | 'DELETE_CLIP'
      | 'UPDATE_STYLE'
      | 'HIGHLIGHT_WORDS'
      | 'ADJUST_PAN'
      | 'APPLY_GRADE'
      | 'ADD_MOTION'
      | 'CLEAR_MOTION'
      | 'REMOVE_SILENCE'
      | 'TRIM_SILENCE_EDGES'
      | 'ADD_SFX'
      | 'CLEAR_SFX';
    [key: string]: any;
  }[];
}

/**
 * Translates conversational user instructions into timeline editing actions.
 */
export async function processChatCommand(
  userCommand: string,
  state: ProjectState
): Promise<AICommandResponse> {
  const apiKey = state.apiKey;
  if (!apiKey) throw new Error('API Key missing');

  // Strip file details from active state for size limits
  const simplifiedState = {
    activeClip: state.clips.find(c => c.id === state.activeClipId),
    clipsCount: state.clips.length,
    captionStyle: state.captionStyle,
    motionOverlays: state.overlays?.map((o) => ({ kind: o.kind, start: o.start, end: o.end })),
    sfxCues: state.sfxCues?.map((c) => ({ kind: c.kind, at: c.at })),
    wordsSample: state.transcription.slice(0, 30).map(w => w.word)
  };

  const systemPrompt = `You are the AI brain of a browser video editor (OpusClip Clone).
You take a natural language command from the user, look at the editor's current styling and clip state, and output:
1. A brief explanation of the actions taken.
2. A list of concrete edit commands to update the timeline.

Supported command actions:
- { "type": "TRIM_CLIP", "clipId": string, "start": number, "end": number }  // updates the clip start/end timings
- { "type": "UPDATE_STYLE", "fontSize": number, "primaryColor": string, "activeWordColor": string, "uppercase": boolean, "addEmojis": boolean } // SUBTITLE TEXT styling ONLY. Colors should be hex.
- { "type": "HIGHLIGHT_WORDS", "words": string[] } // marks specific words as highlighted in the transcript
- { "type": "ADJUST_PAN", "clipId": string, "panOffset": number } // Adjusts horizontal video position (-100 to 100)
- { "type": "APPLY_GRADE", "grade": "cozy-craft" | "teal-orange" | "bleach-print" | "night-neon" | "none" } // Colour grade / look of the VIDEO IMAGE
- { "type": "ADD_MOTION", "kind": "kinetic-title" | "lower-third" | "stat-counter" | "progress-ring", "text": string?, "subtext": string?, "value": number?, "start": number?, "end": number? } // Animated graphic overlay
- { "type": "CLEAR_MOTION", "kind": string? } // Removes one kind of motion graphic, or all of them when kind is omitted
- { "type": "REMOVE_SILENCE" } // Analyses the audio and cuts every pause out of the timeline
- { "type": "TRIM_SILENCE_EDGES" } // Trims silence off only the head and tail
- { "type": "ADD_SFX", "kind": "whoosh" | "impact" | "riser" } // Synthesised sound effect; whoosh lands on cuts, impact and riser at the playhead
- { "type": "CLEAR_SFX", "kind": string? } // Removes sound effects

Motion graphic guidance:
- kinetic-title: a word-by-word animated title card. Put the headline in "text".
- lower-third: a name bar. "text" is the name, "subtext" the role.
- stat-counter: a number rolling up to "value". "text" is an optional label.
- progress-ring: a corner ring tracking playback; needs no content.
Titles, name bars, counters and callout graphics are ADD_MOTION — never UPDATE_STYLE.

CRITICAL DISTINCTION:
UPDATE_STYLE changes the subtitle text only. It must NEVER be used to change the
look, colour, mood, grade, filter, warmth, or tone of the video image itself.
Any request about how the *footage* looks ("make it warmer", "cinematic look",
"black and white", "moodier", "restyle the scene") is APPLY_GRADE — pick the
closest of the listed grades. If a request is about the footage and no grade
fits, return an empty commands array and explain the limitation instead of
falling back to UPDATE_STYLE.

Examples:
- User: "make the text yellow and uppercase"
  Output: { "explanation": "I've changed the active subtitle color to yellow and set all text to uppercase.", "commands": [{ "type": "UPDATE_STYLE", "primaryColor": "#FFE600", "uppercase": true }] }
- User: "center the video crop a bit to the right"
  Output: { "explanation": "Adjusted the horizontal crop alignment to center-right.", "commands": [{ "type": "ADJUST_PAN", "clipId": "current-clip-id", "panOffset": 30 }] }
- User: "trim the clip to start at 5 seconds and end at 25 seconds"
  Output: { "explanation": "Trimmed the video to play between 5s and 25s.", "commands": [{ "type": "TRIM_CLIP", "clipId": "clip-1", "start": 5, "end": 25 }] }
- User: "give the footage a warm cozy look"
  Output: { "explanation": "Applied the Cozy Craft grade — warm tones with lifted blacks.", "commands": [{ "type": "APPLY_GRADE", "grade": "cozy-craft" }] }
- User: "make it look black and white and gritty"
  Output: { "explanation": "Applied the Bleach Print grade — desaturated and high contrast.", "commands": [{ "type": "APPLY_GRADE", "grade": "bleach-print" }] }
- User: "put a title card saying Stop Doing This at the start"
  Output: { "explanation": "Added a kinetic title card over the opening.", "commands": [{ "type": "ADD_MOTION", "kind": "kinetic-title", "text": "Stop Doing This" }] }
- User: "add a name bar for Jane Doe, head of design"
  Output: { "explanation": "Added an animated lower third.", "commands": [{ "type": "ADD_MOTION", "kind": "lower-third", "text": "Jane Doe", "subtext": "Head of Design" }] }

Your output MUST be a JSON object with keys "explanation" and "commands". No markdown blocks or extra text. Only JSON.`;

  const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant', // Fast model for chat interactions
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Current Editor State:\n${JSON.stringify(simplifiedState)}\n\nUser command: "${userCommand}"` }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Chat Copilot failed: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty chat copilot response.');

  return JSON.parse(content) as AICommandResponse;
}
