export async function controlMedia(player: HTMLMediaElement, action: 'play' | 'pause') {
  if (action === 'pause') { player.pause(); return; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (player.error) throw new Error('This film or sound could not be played.');
    await Promise.race([
      player.play(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The film or sound did not start. Try opening it.')), 5000); }),
    ]);
  } catch (error) {
    player.pause();
    throw error;
  } finally { clearTimeout(timer); }
}
