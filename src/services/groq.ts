import { TranscriptionWord, ViralShort, ProjectState, CaptionLanguage } from '../types/video';
import { hasDevanagari, devanagariToHinglish, canonicalizeHinglish } from '../utils/hinglish';

const GROQ_API_URL = 'https://api.groq.com/openai/v1';

/* Chat models the editor may use, in preference order. Groq retires models on
   its own schedule — llama-3.3-70b-versatile was decommissioned 2026-08-16 —
   so we ask the account which of these it can actually see, and the retry
   loop below falls back to the next one if a request is rejected anyway. */
const PREFERRED_CHAT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b'
];

let cachedChatModels: string[] | null = null;

/** Models this account can use, resolved once per session from GET /models.
 *  If that call fails (network hiccup), the preference list itself is used —
 *  postChatCompletion's retry loop still protects us. */
async function resolveChatModels(apiKey: string): Promise<string[]> {
  if (cachedChatModels) return cachedChatModels;
  try {
    const res = await fetch(`${GROQ_API_URL}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      const available = new Set(
        (data.data ?? []).map((m: { id?: string }) => m.id).filter(Boolean)
      );
      const usable = PREFERRED_CHAT_MODELS.filter((id) => available.has(id));
      if (usable.length > 0) {
        cachedChatModels = usable;
        return usable;
      }
    }
  } catch {
    // Fall through to the default list.
  }
  cachedChatModels = [...PREFERRED_CHAT_MODELS];
  return cachedChatModels;
}

interface ChatCompletionBody {
  messages: { role: string; content: string }[];
  temperature?: number;
  response_format?: { type: 'json_object' };
}

/** One chat-completion call. If the model id is rejected (not found on the
 *  account, or the account lacks access), retries with the next model in the
 *  preference order. Returns the message content. */
async function postChatCompletion(
  apiKey: string,
  body: ChatCompletionBody
): Promise<string> {
  const models = await resolveChatModels(apiKey);
  let lastModelError: Error | null = null;

  for (const model of models) {
    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ ...body, model })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq returned an empty chat completion.');
      return content;
    }

    const errorText = await response.text();
    const modelRejected = response.status === 404 && errorText.includes('model_not_found');
    if (modelRejected) {
      lastModelError = new Error(`Groq model "${model}" is unavailable on this account.`);
      continue;
    }
    throw new Error(`Groq chat completion failed: ${errorText || response.statusText}`);
  }

  throw lastModelError ?? new Error('No Groq chat model available on this account.');
}

/** Hinglish output conventions that Whisper's prompt biases toward. Kept
 *  deliberately short (Whisper prompts are token-limited) and concrete —
 *  example romanizations beat abstract instructions for a model that has
 *  never been told how Indian creators spell. */
const HINGLISH_PROMPT_LEAD =
  'The transcript is Hinglish: Hindi spoken by Indian creators, written in English/Latin letters only — never Devanagari. ' +
  'Romanize Hindi the way Indian social media writes it, e.g. "aaj", "main", "aapko", "karta hoon", "mujhe", "nahi", "bahut", "accha", "chahiye", "paisa", "bhai", "yaar". ' +
  'English words keep standard English spelling, e.g. "subscribe", "business", "crore", "lakh", "UPI".';

/**
 * Transcribes the audio WAV blob using Groq Whisper.
 *
 * `language` picks the caption output:
 * - 'hinglish' (default): Whisper auto-detects, a prompt biases Hindi toward
 *   Latin script, and any Devanagari that slips through is transliterated.
 * - 'hindi': Whisper auto-detects and returns Devanagari untouched.
 * - 'english': forces English transcription.
 *
 * `glossary` lists names, brands and slang the creator wants spelled exactly
 * right (e.g. "Raj Shamani", "UPI", "crore"). It is injected into the
 * Whisper prompt as vocabulary hints — the same lever Deepgram's "keyterm
 * prompting" uses to cut domain WER, and it costs nothing extra.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string,
  language: CaptionLanguage = 'hinglish',
  glossary: string[] = []
): Promise<TranscriptionWord[]> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');

  if (language === 'hinglish') {
    // Whisper auto-detects Hindi and returns Devanagari by default. A prompt
    // biases it toward Hinglish — Hindi spoken, written in Latin script — so
    // captions read as romanized text instead of Hindi letters.
    const glossaryHint = glossary.length > 0
      ? ` Spell these names and terms exactly like this: ${glossary.join(', ')}.`
      : '';
    formData.append('prompt', HINGLISH_PROMPT_LEAD + glossaryHint);
  } else if (language === 'english') {
    formData.append('language', 'en');
  }
  // 'hindi' leaves Whisper to auto-detect and return the native script.

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
          // Keep Whisper's punctuation on the word for accurate text matching.
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

  // Guarantee Hinglish captions: Whisper occasionally still returns Devanagari
  // despite the romanization prompt, so transliterate anything that slipped
  // through. Then normalize every Latin word to its canonical Hinglish
  // spelling ("achha" → "accha", "mein" → "main"). Hindi-script and English
  // modes keep Whisper's output as-is.
  return wordsList.map((w) => {
    if (language !== 'hinglish') return w;
    const word = hasDevanagari(w.word) ? devanagariToHinglish(w.word) : w.word;
    const canonical = canonicalizeHinglish(word);
    return canonical !== w.word ? { ...w, word: canonical } : w;
  });
}

export interface CorrectedTranscription {
  words: TranscriptionWord[];
  /** How many words the model actually changed (0 = nothing to fix). */
  changedCount: number;
}

/* How many words go on each numbered line sent to the corrector. Small
   enough that the model keeps line-level word counts honest, large enough
   that it has real sentence context. */
const CORRECTION_LINE_SIZE = 12;
/* Lines per API call — bounds request size on long transcripts. */
const CORRECTION_CHUNK_LINES = 120;

const CORRECTION_RULES: Record<CaptionLanguage, string> = {
  hinglish:
    'Fix the romanized Hinglish spelling to the way Indian creators write captions on social media: "aaj", "main", "aapko", "karta hoon", "mujhe", "nahi", "bahut", "accha", "chahiye", "paisa", "bhai", "yaar", "crore", "lakh". ' +
    'Fix English words inside the Hinglish to standard English spelling ("subscribe" not "sabskraib", "business" not "bijness").',
  hindi:
    'Fix Devanagari spelling, sandhi and homophone errors (e.g. की/कि, है/हैं, में/मैं, और/और). Keep the Devanagari script exactly as Hindi is written.',
  english:
    'Fix English spelling, missing punctuation and repeated-word artifacts. Keep standard written English.'
};

/**
 * Post-transcription accuracy pass. Whisper is confident but often wrong on
 * desi audio — wrong romanization, mangled English loanwords, hallucinated
 * repeated words, missing punctuation. This sends the raw word list to LLaMA
 * to correct the *text* while keeping Whisper's per-word timestamps intact.
 *
 * Alignment trick: words are grouped into numbered lines of fixed size and
 * the model must return the exact same number of words per line, in order.
 * Corrections are then mapped back onto the original word objects by index,
 * so start/end/highlighted/deleted fields are never touched. Any line that
 * breaks the count contract is left as Whisper wrote it — the pass can make
 * captions better, never worse.
 *
 * `glossary` lists names/terms that must not be altered (spell them exactly).
 */
export async function correctTranscription(
  words: TranscriptionWord[],
  apiKey: string,
  language: CaptionLanguage = 'hinglish',
  glossary: string[] = []
): Promise<CorrectedTranscription> {
  // Not worth a model round-trip for a couple of words.
  if (words.length < 6) return { words, changedCount: 0 };

  // Group words into numbered lines, preserving order.
  const lines: { start: number; words: string[] }[] = [];
  for (let i = 0; i < words.length; i += CORRECTION_LINE_SIZE) {
    lines.push({ start: i, words: words.slice(i, i + CORRECTION_LINE_SIZE).map((w) => w.word) });
  }

  const glossaryBlock = glossary.length > 0
    ? `These names and terms are CORRECT — spell them exactly like this and never change them:\n${glossary.join('\n')}\n\n`
    : '';

  const systemPrompt = `You are an expert subtitle corrector for Indian (desi) video creators.
Your job: correct the transcription text so the captions read perfectly, WITHOUT changing the audio timing.

${CORRECTION_RULES[language]}

Also:
- Delete hallucinated words (a word repeated back-to-back is almost always a Whisper artifact — keep one).
- Fix punctuation attached to words (commas, periods, question marks, apostrophes).

CRITICAL CONTRACT — the output must stay frame-accurate to the audio:
- Return exactly the same number of words per line as the input, in the same order.
- Never add, remove, merge, split, or reorder words.
- Only fix spelling, punctuation and artifacts; never paraphrase.

${glossaryBlock}Respond ONLY with raw JSON matching this structure (no markdown, no commentary):
{"lines": [["word1", "word2", "..."], ["..."]]}
Each inner array is one corrected line with the same word count as the input line.`;

  const result: TranscriptionWord[] = words.map((w) => ({ ...w }));
  let changedCount = 0;

  // Process in chunks so one huge transcript doesn't mean one huge response.
  for (let c = 0; c < lines.length; c += CORRECTION_CHUNK_LINES) {
    const chunk = lines.slice(c, c + CORRECTION_CHUNK_LINES);
    const inputText = chunk.map((l, i) => `${c + i}: ${l.words.join(' ')}`).join('\n');

    let content: string;
    try {
      content = await postChatCompletion(apiKey, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: inputText }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
    } catch (err) {
      throw new Error(
        `Groq caption correction failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }

    let parsed: { lines?: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn('Caption correction returned unparseable JSON; keeping Whisper words.', content);
      continue;
    }
    if (!parsed.lines || !Array.isArray(parsed.lines)) continue;

    chunk.forEach((line, idx) => {
      // The model returns corrected lines in the same order as the chunk's
      // numbered input lines, so chunk-local index maps 1:1.
      const out = parsed.lines![idx];
      const correctedLine = Array.isArray(out) ? out : null;
      // Count contract violated → keep the original line untouched.
      if (!correctedLine || correctedLine.length !== line.words.length) return;
      correctedLine.forEach((cw, k) => {
        const text = typeof cw === 'string' ? cw.trim() : '';
        if (!text || text === line.words[k]) return;
        result[line.start + k] = { ...result[line.start + k], word: text };
        changedCount++;
      });
    });
  }

  // Final consistency pass: whatever the model returned, canonicalize the
  // Latin Hinglish spellings so the captions follow one convention. The
  // dictionary is high-confidence, so this can only align, never corrupt.
  if (language === 'hinglish') {
    for (let i = 0; i < result.length; i++) {
      const canonical = canonicalizeHinglish(result[i].word);
      if (canonical !== result[i].word) {
        result[i] = { ...result[i], word: canonical };
      }
    }
  }

  return { words: result, changedCount };
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

  let content: string;
  try {
    content = await postChatCompletion(apiKey, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the transcript with timestamps:\n\n${transcriptText}` }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
  } catch (err) {
    throw new Error(
      `Groq AI curation failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

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
      | 'DELETE_WORDS'
      | 'ADJUST_PAN'
      | 'SET_DRIFT'
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
- { "type": "DELETE_WORDS", "words": string[] } // cuts the listed words out of the transcript entirely ("remove the filler words")
- { "type": "ADJUST_PAN", "clipId": string, "panOffset": number } // Adjusts horizontal video position (-100 to 100); also cancels any drift
- { "type": "SET_DRIFT", "direction": "left" | "right" | "none" } // animated reframe: crop glides from left to right (or right to left) across the clip; "none" stops it
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

  let content: string;
  try {
    content = await postChatCompletion(apiKey, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Current Editor State:\n${JSON.stringify(simplifiedState)}\n\nUser command: "${userCommand}"` }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
  } catch (err) {
    throw new Error(
      `Groq Chat Copilot failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  return JSON.parse(content) as AICommandResponse;
}
