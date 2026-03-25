export function getBritishVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const byLang = voices.find((voice) => voice.lang.toLowerCase() === "en-gb");
  if (byLang) return byLang;

  const byPrefix = voices.find((voice) => voice.lang.toLowerCase().startsWith("en-gb"));
  if (byPrefix) return byPrefix;

  const byName = voices.find((voice) =>
    /uk|british|united kingdom/i.test(voice.name)
  );
  return byName ?? null;
}

export function getSpeechUtteranceConfig(
  text: string,
  voices: SpeechSynthesisVoice[]
): {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: SpeechSynthesisVoice | null;
} {
  return {
    text,
    lang: "en-GB",
    rate: 0.92,
    pitch: 1,
    volume: 1,
    voice: getBritishVoice(voices),
  };
}
