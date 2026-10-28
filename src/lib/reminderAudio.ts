let context: AudioContext | null = null;

// Prime from a user gesture. Browsers may still suppress audio or notifications.
export function primeReminderAudio() {
  try {
    if (typeof AudioContext === "undefined") return;
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    /* The visible reminder remains available. */
  }
}
export function playReminderSound() {
  if (!context || context.state !== "running") return;
  try {
    const tone = context.createOscillator(),
      gain = context.createGain(),
      at = context.currentTime;
    tone.type = "sine";
    tone.frequency.value = 660;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.09, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    tone.connect(gain);
    gain.connect(context.destination);
    tone.start(at);
    tone.stop(at + 0.35);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Respect autoplay/platform limits without blocking the alert. */
  }
}
