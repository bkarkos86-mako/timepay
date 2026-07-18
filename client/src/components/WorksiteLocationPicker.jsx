import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon URLs break under bundlers unless re-pointed
// to a CDN — without this the pin renders as a broken image.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const FALLBACK_CENTER = [14.5995, 120.9842]; // Manila — reasonable default until we know better

// Free (OpenStreetMap + Nominatim) worksite location picker: search an
// address, or click/drag the pin directly. Exact lat/lng stay editable
// separately (see AdminDashboard) for anyone who already has coordinates.
export default function WorksiteLocationPicker({ lat, lng, onChange }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const initialCenter = lat != null && lng != null ? [lat, lng] : FALLBACK_CENTER;
    const map = L.map(mapElRef.current).setView(initialCenter, lat != null ? 16 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(initialCenter, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange({ lat: pos.lat, lng: pos.lng });
    });
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    if (lat == null && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
        () => {} // silent — fallback center is already showing
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin synced when lat/lng change from outside (manual number
  // inputs, "use my current location" elsewhere on the form).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || lat == null || lng == null) return;
    const current = markerRef.current.getLatLng();
    if (Math.abs(current.lat - lat) > 1e-9 || Math.abs(current.lng - lng) > 1e-9) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    }
  }, [lat, lng]);

  async function search(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
      if (data.length === 0) setSearchError('No matches found — try a different search or click the map directly.');
    } catch {
      setSearchError('Search failed — check your connection, or click the map directly.');
    } finally {
      setSearching(false);
    }
  }

  function pickResult(result) {
    onChange({ lat: Number(result.lat), lng: Number(result.lon) });
    setResults([]);
    setQuery(result.display_name);
  }

  return (
    <div>
      {/* Not a <form>: this picker is embedded inside AdminDashboard's "Add
          worksite" form, and nested <form> elements are invalid HTML. */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input
          type="text"
          placeholder="Search an address or place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          style={{ flex: 1, padding: '0.55rem 0.7rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button className="btn btn-secondary" type="button" onClick={search} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {searchError && <p className="muted">{searchError}</p>}
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 0.5rem', padding: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => pickResult(r)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.7rem',
                  background: 'var(--bg-elevated)',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  color: 'var(--text)',
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={mapElRef} style={{ height: '260px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
      <p className="muted" style={{ marginTop: '0.4rem' }}>
        Click the map or drag the pin to fine-tune. Exact coordinates below update automatically — edit them directly if you already
        know them.
      </p>
    </div>
  );
}
