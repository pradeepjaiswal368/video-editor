/**
 * Helper to convert an AudioBuffer (PCM) to a standard 16-bit mono WAV blob.
 */
function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // raw PCM
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferArr = new ArrayBuffer(44 + result.length * 2);
  const view = new DataView(bufferArr);
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + result.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numOfChan, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, result.length * 2, true);
  
  // Write PCM audio samples
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([view], { type: 'audio/wav' });
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Extracts the audio track from a video File, downmixes to 16kHz mono PCM WAV,
 * and returns the Blob ready to send to Groq Whisper.
 */
export async function extractAudio(videoFile: File, progressCallback?: (progress: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    
    fileReader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          throw new Error('Could not read video file');
        }
        
        progressCallback?.(10); // Decode started
        
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        
        progressCallback?.(20);
        
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer).catch(err => {
          throw new Error(`Audio decoding failed. Ensure the file has an audio track. details: ${err.message}`);
        });
        
        progressCallback?.(50); // Decode completed, starting offline render for resampling
        
        const TARGET_SAMPLE_RATE = 16000; // Standard for Whisper transcription
        const offlineCtx = new OfflineAudioContext(
          1, // Mono channel
          Math.floor(decodedBuffer.duration * TARGET_SAMPLE_RATE),
          TARGET_SAMPLE_RATE
        );
        
        const source = offlineCtx.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        progressCallback?.(70);
        
        const resampledBuffer = await offlineCtx.startRendering();
        
        progressCallback?.(90); // Encoding to WAV
        
        const wavBlob = bufferToWav(resampledBuffer);
        
        progressCallback?.(100);
        resolve(wavBlob);
      } catch (err) {
        reject(err);
      }
    };
    
    fileReader.onerror = () => {
      reject(new Error('FileReader error loading video file'));
    };
    
    fileReader.readAsArrayBuffer(videoFile);
  });
}
