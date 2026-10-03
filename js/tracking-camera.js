// Camera, video element and error helpers for HandTracker.

export class TrackingError extends Error {
  constructor(code, message, cause) {
    super(message);
    // Keep DOMException names (e.g. NotAllowedError) so callers can branch on them.
    this.name = code === 'cancelled' ? 'AbortError' : (typeof cause?.name === 'string' && cause.name.endsWith('Error') ? cause.name : 'TrackingError');
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export const cancelledError = () => new TrackingError('cancelled', 'Camera start was cancelled.');

/** Map getUserMedia / runtime failures to friendly, adult-facing messages. */
export function describeCameraError(error) {
  if (error instanceof TrackingError) return error;
  const name = error?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new TrackingError('permission-denied', 'Camera permission was blocked. Allow the camera in the browser address bar, then press Try again.', error);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new TrackingError('no-camera', 'No camera was found. Connect a webcam, then press Try again.', error);
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new TrackingError('camera-busy', 'The camera is busy or unavailable. Close other apps using it, then press Try again.', error);
    default:
      return new TrackingError('camera-failed', `The camera could not start${error?.message ? ` (${error.message})` : ''}. Press Try again.`, error);
  }
}

/** Error for a browser/page that cannot call getUserMedia at all. */
export function cameraUnavailableError(isSecureContext) {
  return isSecureContext
    ? new TrackingError('unsupported', 'This browser cannot use the camera. Try a recent desktop Chrome.')
    : new TrackingError('insecure', 'The camera needs a secure page (https or localhost).');
}

export const PREFERRED_CONSTRAINTS = Object.freeze({
  audio: false,
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
});
export const FALLBACK_CONSTRAINTS = Object.freeze({ audio: false, video: true });

export function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* already stopped */ }
  }
}

export function closeBitmap(bitmap) {
  try { bitmap?.close?.(); } catch { /* already detached */ }
}

/** Throw camera-ended unless the stream still has live video tracks. */
export function ensureCameraLive(stream) {
  const tracks = stream?.getVideoTracks?.() || [];
  if (!tracks.length || tracks.some((t) => t.readyState === 'ended')) {
    throw new TrackingError('camera-ended', 'The camera was disconnected. Press Try again.');
  }
}

/** Listen for any track ending; returns cleanup functions. */
export function watchTracks(stream, onEnded) {
  const cleanups = [];
  for (const track of stream?.getTracks?.() || []) {
    track.addEventListener?.('ended', onEnded);
    cleanups.push(() => track.removeEventListener?.('ended', onEnded));
  }
  return cleanups;
}

function waitForVideoData(video) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener?.('loadeddata', done);
      video.removeEventListener?.('loadedmetadata', done);
      resolve();
    };
    video.addEventListener?.('loadeddata', done);
    video.addEventListener?.('loadedmetadata', done);
    if (video.readyState >= 2) done();
  });
}

/** Attach the stream to a muted inline video and wait for frames to play. */
export async function attachVideo(video, stream) {
  if (!video) throw new TrackingError('camera-failed', 'No video element for the camera.');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute?.('playsinline', '');
  video.setAttribute?.('muted', '');
  video.srcObject = stream;
  if (!(video.readyState >= 2 && video.videoWidth > 0)) await waitForVideoData(video);
  try {
    await video.play?.();
  } catch (error) {
    // Autoplay of a muted, user-initiated stream is allowed; surface anything else.
    if (error?.name !== 'AbortError') throw describeCameraError(error);
  }
}

/** Detach the camera from the video element. */
export function detachVideo(video) {
  if (!video) return;
  try { video.pause?.(); } catch { /* element already gone */ }
  try { video.srcObject = null; } catch { /* element already gone */ }
}

/** Snapshot the current video frame as an ImageBitmap, or null if none is ready. */
export async function grabBitmap(video, createImageBitmap) {
  if (!video || !(video.readyState >= 2) || !(video.videoWidth > 0)) return null;
  try {
    return await createImageBitmap(video);
  } catch {
    return null;
  }
}
