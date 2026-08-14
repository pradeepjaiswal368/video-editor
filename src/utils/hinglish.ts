/* Devanagari → Hinglish transliteration.
   Whisper's prompt can bias Hindi audio toward romanized output, but it is
   not a guarantee — stray Devanagari words still come through. This pass runs
   over every transcribed word so captions are *always* Latin script.

   The mapping is character-by-character, tuned for spoken Hindi:
   - matras (vowel signs) attach to consonants: कैसे → "kaise"
   - virama (्) joins consonant clusters: सत्य → "satya"
   - word-final schwa is silent in Hindi, so it is dropped: आज → "aaj"
     (except after a conjunct ending in a semivowel, where it is pronounced:
     मित्र → "mitra", but शब्द → "shabd")
   - an internal schwa is deleted before a consonant carrying its own vowel
     sign: आपको → "aapko", करता → "karta" (the word-initial schwa is always
     kept: ज़रूरत → "zaroorat", कलम → "kalam")
   - word-final ा/ी shorten to a/i: मेरा → "mera", अभी → "abhi" (बात → "baat",
     जीना → "jeena" keep their length mid-word) */

const VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ॠ': 'ri', 'ऌ': 'li', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ऍ': 'e', 'ऑ': 'o', 'ऎ': 'e', 'ऒ': 'o'
};

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'w', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'य़': 'y'
};

/* Consonant + nukta (़) combinations — Whisper usually returns these as two
   code points (ज + ़) rather than the precomposed ज़. Colloquial Hinglish
   spells ड़ as "d" (लड़का → "ladka") and ढ़ as "dh" (पढ़ → "padh"). */
const NUKTA: Record<string, string> = {
  'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'd', 'ढ': 'dh', 'फ': 'f', 'य': 'y'
};

/* Vowel signs (matras) + nasal/visarga marks. */
const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'ॄ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ॅ': 'e', 'ॉ': 'o', 'ं': 'n', 'ँ': 'n', 'ः': 'h'
};

const DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

/* A handful of very common words whose conventional Hinglish spelling bends
   the general rules (length, schwa retention). Keep this list small. */
const EXCEPTIONS: Record<string, string> = {
  'चाहिए': 'chahiye', 'जवाब': 'jawab', 'सवाल': 'sawaal', 'वाले': 'wale',
  'बेवकूफ': 'bewakoof', 'इसलिए': 'isliye', 'क्योंकि': 'kyonki',
  'हमेशा': 'hamesha', 'आवाज़': 'aawaaz', 'ज़रूर': 'zaroor', 'सकता': 'sakta'
};

/* Devanagari letters only — danda (। ॥) and digits (०-९) live inside the
   block but are not letters, so they must not confuse the lookahead logic. */
const isDevanagari = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x0900 && c <= 0x097F && !(c >= 0x0964 && c <= 0x096F);
};

/** Word-final schwa is pronounced after a conjunct ending in a semivowel
 *  (य र ल व): मित्र → "mitra". Everywhere else it is silent. */
const SEMIVOWELS = new Set(['y', 'r', 'l', 'w']);
const isMark = (ch: string | undefined) => ch === 'ं' || ch === 'ँ' || ch === 'ः';

/** Transliterates a Devanagari string to romanized Hinglish. Non-Devanagari
 *  characters (punctuation, existing Latin letters) pass through untouched.
 *  Each whitespace-separated token is transliterated independently, since the
 *  word-initial schwa protection must reset per word. */
export function devanagariToHinglish(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : transliterateToken(part)))
    .join('');
}

function transliterateToken(text: string): string {
  const exact = EXCEPTIONS[text];
  if (exact) return exact;

  const firstDevanagari = [...text].find((ch) => isDevanagari(ch) && ch !== '्');
  const wordStartsWithConsonant = !!firstDevanagari && !!CONSONANTS[firstDevanagari];

  let out = '';
  let seenConsonant = false;
  let afterConjunct = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (CONSONANTS[ch]) {
      const hasNukta = text[i + 1] === '़';
      const base = hasNukta ? (NUKTA[ch] ?? CONSONANTS[ch]) : CONSONANTS[ch];
      if (hasNukta) i++; // consume the nukta so it is not re-emitted

      const isFirstConsonant = !seenConsonant && wordStartsWithConsonant;
      const wasConjunct = afterConjunct;
      seenConsonant = true;
      afterConjunct = false;

      const next = text[i + 1];

      if (next === '्') {
        // Conjunct: consume the virama, next consonant appends directly.
        out += base;
        i++;
        afterConjunct = true;
        continue;
      }

      if (next && !isMark(next) && (MATRAS[next] || VOWELS[next])) {
        // Explicit vowel sign or standalone vowel follows — no inherent vowel.
        out += base;
        continue;
      }

      if (next !== undefined && !isDevanagari(next)) {
        // Latin letter or punctuation follows: same as word end — silent
        // schwa, unless the cluster ends in a semivowel (मित्र। → "mitra").
        out += base + (wasConjunct && SEMIVOWELS.has(base) ? 'a' : '');
        continue;
      }

      if (next === undefined) {
        // Word-final consonant: silent schwa, unless the cluster ends in a
        // semivowel, where it is pronounced (मित्र → "mitra", शब्द → "shabd").
        out += base + (wasConjunct && SEMIVOWELS.has(base) ? 'a' : '');
        continue;
      }

      // A consonant (or nasal mark) follows: decide the internal schwa.
      const nextNext = text[i + 2];
      const nextCarriesVowel = nextNext !== undefined && MATRAS[nextNext] !== undefined;
      if (nextCarriesVowel && !isFirstConsonant) {
        out += base; // आपको → "aapko", करता → "karta"
      } else {
        out += base + 'a'; // कर → "kar", कलम → "kalam", नमस्ते → "namaste"
      }
      continue;
    }

    if (ch === '्' || ch === '़') continue;
    if (MATRAS[ch]) {
      // Word-final ा/ी shorten to a/i — Hinglish convention ("mera", "abhi"),
      // while mid-word they keep length ("baat", "jeena").
      const shortened = (ch === 'ा' || ch === 'ी') &&
        (i + 1 >= text.length || isMark(text[i + 1]) || !isDevanagari(text[i + 1]));
      out += shortened ? (ch === 'ा' ? 'a' : 'i') : MATRAS[ch];
      continue;
    }
    if (VOWELS[ch]) {
      // Word-final िए is written "iye": चाहिए → "chahiye", कीजिए → "kijiye".
      if (ch === 'ए' && i + 1 >= text.length && text[i - 1] === 'ि') {
        out += 'ye';
      } else {
        out += VOWELS[ch];
      }
      continue;
    }
    if (DIGITS[ch]) { out += DIGITS[ch]; continue; }
    if (ch === '।' || ch === '॥') { out += '.'; continue; } // danda → period
    out += ch;
  }

  return out;
}

/** True when the word still contains Devanagari script. */
export function hasDevanagari(word: string): boolean {
  for (const ch of word) {
    if (isDevanagari(ch)) return true;
  }
  return false;
}
