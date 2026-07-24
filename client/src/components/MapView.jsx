/**
 * The councilor's map.
 *
 * MapLibre GL + OpenStreetMap raster tiles rather than Mapbox: plan.md listed
 * this as the fallback, and it needs no access token, which removes a
 * submission-day dependency and a quota that could die mid-demo.
 *
 * Two representations of the same data, swapped by zoom:
 *   - zoomed out: a heatmap weighted by priorityWeight x reportCount, so a
 *     cluster of severe issues reads as one hot region at a glance
 *   - zoomed in: individual circles coloured by severity, sized by report count
 *
 * That transition is the "high-priority cluster" view the whole dashboard
 * exists to give a ward councilor.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

const CENTER = [
  Number(import.meta.env.VITE_MAP_CENTER_LNG) || 90.4125,
  Number(import.meta.env.VITE_MAP_CENTER_LAT) || 23.9999,
];
const ZOOM = Number(import.meta.env.VITE_MAP_ZOOM) || 11;

/* A raster-only style: no token, no styling service, works anywhere. */
const STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
    // Darken the base so severity colour is the brightest thing on screen.
    {
      id: 'dim',
      type: 'background',
      paint: { 'background-color': '#0d1117', 'background-opacity': 0.45 },
    },
  ],
};

const SEVERITY_COLOUR = [
  'match',
  ['get', 'severity'],
  1, '#6b7787',
  2, '#3d8bcd',
  3, '#d8a22c',
  4, '#e2703a',
  5, '#e5484d',
  '#6b7787',
];

export default function MapView({ issues, selectedId, onSelect, flashId }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  // Kept in a ref so the click handler, registered once, always sees the
  // current callback without re-binding on every render.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /* ---- create the map once ---- */
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: CENTER,
      zoom: ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('issues', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'issues-heat',
        type: 'heatmap',
        source: 'issues',
        maxzoom: 15,
        paint: {
          // A severity-5 issue with many reports should dominate the field.
          'heatmap-weight': [
            'interpolate', ['linear'],
            ['*', ['get', 'severity'], ['min', ['get', 'reportCount'], 10]],
            0, 0.1,
            50, 1,
          ],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(61,139,205,0.5)',
            0.4, 'rgba(216,162,44,0.6)',
            0.7, 'rgba(226,112,58,0.75)',
            1, 'rgba(229,72,77,0.9)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 15, 55],
          // Hand over to the circles as the councilor zooms in.
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 15, 0],
        },
      });

      map.addLayer({
        id: 'issues-circle',
        type: 'circle',
        source: 'issues',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, ['+', 4, ['*', 0.7, ['min', ['get', 'reportCount'], 12]]],
            16, ['+', 9, ['*', 1.6, ['min', ['get', 'reportCount'], 12]]],
          ],
          'circle-color': SEVERITY_COLOUR,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.25, 14, 0.92],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
          'circle-stroke-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#ffffff',
            'rgba(255,255,255,0.55)',
          ],
        },
      });

      readyRef.current = true;
      map.on('click', 'issues-circle', (e) => {
        const f = e.features?.[0];
        if (f) onSelectRef.current?.(f.properties.id);
      });
      map.on('mouseenter', 'issues-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'issues-circle', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => map.remove();
  }, []);

  /* ---- push data whenever the issue list changes ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource('issues');
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: (issues || []).map((i) => ({
          type: 'Feature',
          id: i._id,
          geometry: i.centroid,
          properties: {
            id: String(i._id),
            severity: i.severity ?? 1,
            reportCount: i.reportCount ?? 1,
            category: i.category ?? '',
          },
        })),
      });
    };

    if (readyRef.current) apply();
    else map.once('load', apply);
  }, [issues]);

  /* ---- selection ring ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const i of issues || []) {
      map.setFeatureState({ source: 'issues', id: i._id }, { selected: i._id === selectedId });
    }
  }, [selectedId, issues]);

  /* ---- fly to a newly arrived issue: the live pin-drop demo shot ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flashId) return;
    const target = (issues || []).find((i) => i._id === flashId);
    if (!target?.centroid?.coordinates) return;
    map.flyTo({ center: target.centroid.coordinates, zoom: Math.max(map.getZoom(), 14), speed: 0.9 });
  }, [flashId, issues]);

  return <div className="map" ref={containerRef} />;
}
