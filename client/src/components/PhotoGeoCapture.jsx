import { useEffect, useRef, useState } from 'react';

// Captures a selfie photo + geolocation together, for buddy-punching
// prevention on clock in/out. Renders a live camera preview, then a still
// frame once captured, and hands {blob, lat, lng} back via onConfirm.
export default function PhotoGeoCapture({ onConfirm, onCancel, confirmLabel = 'Confirm' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('starting'); // starting | live | captured | error
  const [error, setError] = useState('');
  const [coords, setCoords] = useState(null);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;

    navigator.geolocation?.getCurrentPosition(
      (pos) => !cancelled && setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => !cancelled && setError((e) => e || 'Location unavailable — enable location access to clock in.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus('live');
      })
      .catch(() => !cancelled && setError('Camera unavailable — enable camera access to clock in.'));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    setStatus('captured');
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function retake() {
    setPhotoDataUrl(null);
    setStatus('starting');
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus('live');
      })
      .catch(() => setError('Camera unavailable — enable camera access to clock in.'));
  }

  async function confirm() {
    const blob = await (await fetch(photoDataUrl)).blob();
    onConfirm({ blob, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {status !== 'captured' && (
        <video ref={videoRef} className="camera-preview" autoPlay playsInline muted />
      )}
      {status === 'captured' && <img className="camera-preview" src={photoDataUrl} alt="Captured selfie" />}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <p className="muted" style={{ marginTop: '0.5rem' }}>
        {coords ? `Location captured (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : 'Getting your location…'}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        {status === 'live' && (
          <button className="btn btn-block" onClick={capture}>
            📷 Take Photo
          </button>
        )}
        {status === 'captured' && (
          <>
            <button className="btn btn-secondary" onClick={retake}>
              Retake
            </button>
            <button className="btn btn-block" onClick={confirm} disabled={!coords}>
              {confirmLabel}
            </button>
          </>
        )}
        {onCancel && (
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
