/**
 * Small stationary square: wave video (head + arm motion) with still fallback.
 * The square frame does not move — only the character inside animates.
 */
export function MiniButlerWave({ title = 'Butler reminder' }: { title?: string }) {
  return (
    <span className="mini-butler-frame" title={title}>
      <img className="mini-butler-still" src="./butler-wave.jpg" alt="" draggable={false} />
      <video
        className="mini-butler-video"
        src="./video/butler-wave-loop.mp4"
        poster="./butler-wave.jpg"
        muted
        playsInline
        autoPlay
        loop
        preload="metadata"
        onError={(e) => {
          (e.currentTarget as HTMLVideoElement).style.display = 'none';
        }}
      />
    </span>
  );
}
