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
     जीना → "jeena" keep their length mid-word)
   - anusvara (ं) is homorganic: "m" before labial stops (संभव → "sambhav",
     कंपनी → "kampani"), "n" elsewhere (पंजाब → "panjab"); chandrabindu (ँ)
     is always "n" (मैं → "main", नहीं → "nahin", हूँ → "hoon")
   - English loanwords that Whisper writes in Devanagari map back to their
     English spelling from a dictionary (सब्सक्राइब → "subscribe", never
     "sabskraib") instead of being letter-transliterated
   - every Latin-script word is then normalized to its canonical Hinglish
     spelling (achha → "accha", mein → "main") for consistent captions */

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

/* Vowel signs (matras) + visarga. The nasals (ं ँ) are NOT here — they get
   context-sensitive handling in the token loop (homorganic anusvara) and must
   not count as "vowel signs" in the schwa lookahead. */
const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'ॄ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ॅ': 'e', 'ॉ': 'o', 'ः': 'h'
};

/* Labial stops — anusvara before these is pronounced 'm' (संभव → "sambhav"). */
const LABIALS = new Set(['प', 'फ', 'ब', 'भ', 'म']);

const DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

/* A handful of very common words whose conventional Hinglish spelling bends
   the general rules (length, schwa retention). Keep this list small. */
const EXCEPTIONS: Record<string, string> = {
  'चाहिए': 'chahiye', 'जवाब': 'jawab', 'सवाल': 'sawaal', 'वाले': 'wale',
  'बेवकूफ': 'bewakoof', 'इसलिए': 'isliye', 'क्योंकि': 'kyonki',
  'हमेशा': 'hamesha', 'आवाज़': 'aawaaz', 'ज़रूर': 'zaroor', 'सकता': 'sakta',
  'पंजाब': 'punjab' // proper noun — rule-based transliteration gives "panjaab"
};

/* Punctuation that may trail a token — kept attached when a dictionary maps
   the bare word, so "सब्सक्राइब," → "subscribe," and "achha?" → "accha?". */
const TRAILING_PUNCT = /[.,!?;:।॥'"”’…]+$/;

/* English words desi creators say but Whisper sometimes writes in Devanagari
   — "सब्सक्राइब", "बिज़नेस". The character transliterator would mangle these
   ("sabskraib", "bijness"), so the exact Devanagari form maps back to the
   standard English spelling. Covers the creator-economy vocabulary and the
   everyday loanwords most likely to appear in spoken Hinglish. */
const ENGLISH_LOANWORDS: Record<string, string> = {
  // Creator economy
  'सब्सक्राइब': 'subscribe', 'सब्सक्राइबर': 'subscriber', 'सब्सक्राइबर्स': 'subscribers',
  'चैनल': 'channel', 'वीडियो': 'video', 'वीडियोज़': 'videos', 'शॉर्ट्स': 'shorts',
  'रील्स': 'reels', 'स्टोरी': 'story', 'स्टोरीज़': 'stories', 'लाइक': 'like',
  'शेयर': 'share', 'कमेंट': 'comment', 'कंटेंट': 'content', 'क्रिएटर': 'creator',
  'ऑडियंस': 'audience', 'फॉलोअर्स': 'followers', 'फॉलोअर': 'follower',
  'व्यूज': 'views', 'ट्रेंडिंग': 'trending', 'वायरल': 'viral', 'बायो': 'bio',
  'प्रमोशन': 'promotion', 'स्पॉन्सर': 'sponsor', 'ब्लॉग': 'blog',
  'पॉडकास्ट': 'podcast', 'लाइव': 'live', 'रिकॉर्ड': 'record', 'कैप्शन': 'caption',
  'हैशटैग': 'hashtag', 'इमोजी': 'emoji', 'स्टिकर': 'sticker', 'फ़िल्टर': 'filter',
  'फिल्टर': 'filter', 'टेम्पलेट': 'template', 'थंबनेल': 'thumbnail',
  'स्क्रिप्ट': 'script', 'हाइलाइट': 'highlight', 'फीचर': 'feature',
  'अपडेट': 'update', 'एडिट': 'edit', 'एडिटिंग': 'editing', 'एडिटर': 'editor',
  'क्लिप': 'clip', 'फुटेज': 'footage', 'साउंड': 'sound', 'ट्रैक': 'track',
  'टाइटल': 'title', 'डिस्क्रिप्शन': 'description', 'इमेज': 'image',
  'पिक्चर': 'picture', 'म्यूजिक': 'music', 'सॉन्ग': 'song', 'फोटो': 'photo',
  'कैमरा': 'camera',
  // Platforms & apps (brand names keep their capitalization)
  'यूट्यूब': 'YouTube', 'इंस्टाग्राम': 'Instagram', 'फेसबुक': 'Facebook',
  'ट्विटर': 'Twitter', 'व्हाट्सएप': 'WhatsApp', 'वॉट्सऐप': 'WhatsApp',
  'टेलीग्राम': 'Telegram', 'टिकटॉक': 'TikTok', 'स्नैपचैट': 'Snapchat',
  'लिंक्डइन': 'LinkedIn', 'गूगल': 'Google', 'पिनटेरेस्ट': 'Pinterest',
  'डीएम': 'DM', 'ऐप': 'app', 'ऐप्स': 'apps', 'वेबसाइट': 'website',
  // Work, money, daily life
  'बिज़नेस': 'business', 'बिजनेस': 'business', 'कम्पनी': 'company',
  'कंपनी': 'company', 'मीटिंग': 'meeting', 'प्रोजेक्ट': 'project',
  'प्रॉजेक्ट': 'project', 'जॉब': 'job', 'वर्क': 'work', 'सैलरी': 'salary',
  'इनकम': 'income', 'प्रॉफिट': 'profit', 'लॉस': 'loss', 'लोन': 'loan',
  'इन्वेस्टमेंट': 'investment', 'स्टॉक': 'stock',
  'बजट': 'budget', 'बिल': 'bill', 'ऑर्डर': 'order', 'डिलीवरी': 'delivery',
  'पैकेज': 'package', 'कूपन': 'coupon', 'डिस्काउंट': 'discount', 'ऑफर': 'offer',
  'डील': 'deal', 'प्राइस': 'price', 'रेट': 'rate', 'कॉस्ट': 'cost',
  'वैल्यू': 'value', 'पेमेंट': 'payment', 'बैंक': 'bank', 'अकाउंट': 'account',
  'कार्ड': 'card', 'कैश': 'cash', 'डॉलर': 'dollar', 'पर्सेंट': 'percent',
  'परसेंट': 'percent', 'टैक्स': 'tax', 'इंश्योरेंस': 'insurance',
  'मनी': 'money', 'फंड': 'fund', 'डोनेशन': 'donation',
  // Phone, internet, gadgets
  'फोन': 'phone', 'मोबाइल': 'mobile', 'इंटरनेट': 'internet',
  'कंप्यूटर': 'computer', 'लैपटॉप': 'laptop', 'टीवी': 'TV', 'एसी': 'AC',
  'मशीन': 'machine', 'बैटरी': 'battery', 'चार्ज': 'charge', 'स्क्रीन': 'screen',
  'नंबर': 'number', 'मैसेज': 'message', 'मैसेजेस': 'messages', 'लिंक': 'link',
  'फाइल': 'file', 'कोड': 'code', 'सॉफ्टवेयर': 'software', 'हार्डवेयर': 'hardware',
  'पासवर्ड': 'password', 'लॉगिन': 'login', 'ऑनलाइन': 'online',
  'ऑफलाइन': 'offline', 'सर्च': 'search', 'सर्वर': 'server', 'डेटा': 'data',
  // People, places, things
  'स्कूल': 'school', 'कॉलेज': 'college', 'यूनिवर्सिटी': 'university',
  'टीचर': 'teacher', 'स्टूडेंट': 'student', 'डॉक्टर': 'doctor', 'नर्स': 'nurse',
  'लॉयर': 'lawyer', 'कस्टमर': 'customer', 'क्लाइंट': 'client', 'मैनेजर': 'manager',
  'बॉस': 'boss', 'टीम': 'team', 'फ्रेंड': 'friend', 'फैमिली': 'family',
  'पर्सन': 'person', 'पीपल': 'people',
  'सिटी': 'city', 'टाउन': 'town', 'विलेज': 'village', 'कंट्री': 'country',
  'स्टेशन': 'station', 'एयरपोर्ट': 'airport', 'होटल': 'hotel', 'रूम': 'room',
  'हाउस': 'house', 'ऑफिस': 'office', 'शॉप': 'shop', 'स्टोर': 'store', 'मॉल': 'mall',
  'कार': 'car', 'बस': 'bus', 'ट्रेन': 'train', 'प्लेन': 'plane', 'बाइक': 'bike',
  'साइकिल': 'cycle', 'रोड': 'road', 'ड्राइवर': 'driver',
  // Time, size, common adjectives
  'टाइम': 'time', 'टुडे': 'today', 'टुमॉरो': 'tomorrow', 'ईवनिंग': 'evening',
  'मॉर्निंग': 'morning', 'नाइट': 'night', 'वीक': 'week', 'मंथ': 'month',
  'ईयर': 'year', 'मिनट': 'minute', 'सेकंड': 'second', 'वीकेंड': 'weekend',
  'हॉलिडे': 'holiday', 'बर्थडे': 'birthday', 'फेस्टिवल': 'festival',
  'इवेंट': 'event', 'पार्टी': 'party', 'शो': 'show', 'मूवी': 'movie',
  'फिल्म': 'film', 'ट्रेलर': 'trailer', 'रिव्यू': 'review', 'रेटिंग': 'rating',
  'टिकट': 'ticket', 'प्लान': 'plan', 'आइडिया': 'idea', 'आईडिया': 'idea',
  'गोल': 'goal', 'टारगेट': 'target', 'ड्रीम': 'dream', 'चांस': 'chance',
  'ऑप्शन': 'option', 'चॉइस': 'choice', 'रिजल्ट': 'result', 'मिस्टेक': 'mistake',
  'प्रॉब्लम': 'problem', 'क्वेश्चन': 'question', 'आंसर': 'answer',
  'टेस्ट': 'test', 'एग्जाम': 'exam', 'एग्ज़ाम': 'exam', 'मार्केट': 'market',
  'स्पेशल': 'special', 'इंपॉर्टेंट': 'important', 'पॉसिबल': 'possible',
  'सिम्पल': 'simple', 'इज़ी': 'easy', 'डिफिकल्ट': 'difficult', 'क्विक': 'quick',
  'फास्ट': 'fast', 'स्लो': 'slow', 'स्टार्ट': 'start', 'स्टॉप': 'stop',
  'ओपन': 'open', 'क्लोज़': 'close', 'चेक': 'check', 'ट्राई': 'try',
  'स्टेप': 'step', 'स्टेप्स': 'steps', 'प्रोसेस': 'process', 'सिस्टम': 'system',
  'मेथड': 'method', 'टेक्निक': 'technique', 'पॉइंट': 'point', 'पावर': 'power',
  'फ्री': 'free', 'प्रीमियम': 'premium', 'बेस्ट': 'best', 'टॉप': 'top',
  'फुल': 'full', 'हाफ': 'half', 'डबल': 'double', 'सिंगल': 'single',
  'स्मार्ट': 'smart', 'स्ट्रॉन्ग': 'strong', 'न्यू': 'new',
  'गुड': 'good', 'बैड': 'bad', 'हैप्पी': 'happy', 'कूल': 'cool', 'लव': 'love',
  'लाइफ': 'life', 'वर्ल्ड': 'world', 'हार्ट': 'heart', 'बॉडी': 'body',
  'फेस': 'face', 'आइज़': 'eyes', 'हेयर': 'hair', 'माइंड': 'mind',
  'एक्सपीरियंस': 'experience', 'एक्सपर्ट': 'expert', 'करियर': 'career',
  'सक्सेस': 'success', 'सक्सेसफुल': 'successful', 'टैलेंट': 'talent',
  'स्किल': 'skill', 'स्किल्स': 'skills', 'मोटिवेशन': 'motivation',
  'इंस्पिरेशन': 'inspiration', 'डिसिप्लिन': 'discipline', 'हैबिट': 'habit',
  'रूटीन': 'routine', 'शेड्यूल': 'schedule', 'डेडलाइन': 'deadline',
  'प्रोफेशनल': 'professional', 'क्वालिटी': 'quality', 'कलर': 'color',
  'ब्लैक': 'black', 'व्हाइट': 'white', 'रेड': 'red', 'ब्लू': 'blue',
  'ग्रीन': 'green', 'येलो': 'yellow', 'पिंक': 'pink', 'गोल्ड': 'gold',
  'सिल्वर': 'silver', 'साइज़': 'size', 'लार्ज': 'large', 'स्मॉल': 'small',
  'बिग': 'big', 'सीरियस': 'serious', 'डिफरेंट': 'different',
  'नेसेसरी': 'necessary', 'कॉम्प्लिकेटेड': 'complicated'
};

/* Canonical Hinglish spellings for the variant forms Whisper most often
   produces (and that slip past its romanization prompt). Applied to every
   Latin-script word in Hinglish mode so captions read the way Indian
   creators actually type them. Keys are the variant, values the canonical
   spelling. Keep this list to high-confidence normalizations only. */
const HINGLISH_CANONICAL: Record<string, string> = {
  // अच्छा — Whisper drifts across all four spellings
  'acha': 'accha', 'achha': 'accha', 'achcha': 'accha', 'aacha': 'accha',
  // चाहिए
  'chaiye': 'chahiye',
  // मैं (the German-style "mein" is the most common Whisper artifact)
  'mein': 'main',
  // कुछ
  'kuchh': 'kuch',
  // वाला / वाले — initial व can surface as v or w, long/short a
  'waala': 'wala', 'vala': 'wala', 'vaala': 'wala',
  'waale': 'wale', 'vale': 'wale', 'vaale': 'wale',
  // ज़ vs ज — Whisper drops the nukta
  'jaroor': 'zaroor', 'jindagi': 'zindagi',
  // फिर
  'fir': 'phir',
  // शुरू
  'suru': 'shuru',
  // नहीं — the two-letter typo Whisper often emits
  'nhi': 'nahi',
  // क्या
  'kyaa': 'kya',
  // भगवान
  'bhagavan': 'bhagwan',
  // व after a consonant is pronounced 'v' in these words, but the letter
  // transliterates as 'w' (sambhaw, bhaaw) — restore the common spellings
  'sambhaw': 'sambhav', 'bhaaw': 'bhaav'
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

/** Looks an English loanword written in Devanagari up in the dictionary,
 *  tolerating trailing punctuation ("सब्सक्राइब," → "subscribe,"). */
function lookupLoanword(token: string): string | undefined {
  const direct = ENGLISH_LOANWORDS[token];
  if (direct !== undefined) return direct;
  const m = token.match(TRAILING_PUNCT);
  if (m) {
    const bare = token.slice(0, -m[0].length);
    const mapped = ENGLISH_LOANWORDS[bare];
    if (mapped !== undefined) return mapped + m[0];
  }
  return undefined;
}

/** Normalizes a Latin-script Hinglish word to its canonical spelling ("achha"
 *  → "accha", "mein" → "main"), keeping trailing punctuation attached.
 *  Words not in the dictionary pass through untouched. */
export function canonicalizeHinglish(word: string): string {
  const m = word.match(TRAILING_PUNCT);
  const bare = m ? word.slice(0, -m[0].length) : word;
  const mapped = HINGLISH_CANONICAL[bare];
  return mapped !== undefined ? mapped + (m ? m[0] : '') : word;
}

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

  // English loanwords written in Devanagari map back to their English
  // spelling instead of being letter-transliterated (सब्सक्राइब → "subscribe").
  const loanword = lookupLoanword(text);
  if (loanword !== undefined) return loanword;

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
    if (ch === 'ं') {
      // Anusvara is homorganic: 'm' before labial stops (संभव → "sambhav",
      // कंपनी → "kampani"), 'n' elsewhere (पंजाब → "panjab", अंक → "ank").
      // English loans with ं are caught by the loanword dictionary above.
      const next = text[i + 1];
      out += next && LABIALS.has(next) ? 'm' : 'n';
      continue;
    }
    if (ch === 'ँ') {
      // Chandrabindu nasalizes the vowel; Hinglish writes it 'n' — मैं →
      // "main", नहीं → "nahin", हूँ → "hoon", क्यों → "kyon".
      out += 'n';
      continue;
    }
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
