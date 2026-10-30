/// <reference types="@types/google.maps" />

import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

let loaderPromise: Promise<void> | null = null;

function loadMapScript(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return Promise.reject(
      new Error("VITE_GOOGLE_MAPS_API_KEY is required to load Google Maps")
    );
  }

  loaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      libraries: "marker,places,geometry",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

export interface MapMarker {
  id: string;
  position: google.maps.LatLngLiteral;
  title: string;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  markers?: MapMarker[];
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 33.5138, lng: 36.2765 },
  initialZoom = 12,
  markers = [],
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markersOnMap = useRef<google.maps.Marker[]>([]);
  const [loadError, setLoadError] = useState(false);
  const hasGoogleMapsKey = Boolean(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  );

  const drawMarkers = usePersistFn(() => {
    if (!map.current || !window.google?.maps) return;
    markersOnMap.current.forEach(marker => marker.setMap(null));
    markersOnMap.current = markers.map(
      marker =>
        new window.google!.maps.Marker({
          map: map.current!,
          position: marker.position,
          title: marker.title,
        })
    );
    if (markers.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      markers.forEach(marker => bounds.extend(marker.position));
      map.current.fitBounds(bounds, 48);
    } else if (markers[0]) {
      map.current.setCenter(markers[0].position);
      map.current.setZoom(initialZoom);
    }
  });

  const init = usePersistFn(async () => {
    if (!hasGoogleMapsKey) return;
    await loadMapScript();
    if (!mapContainer.current || !window.google?.maps) return;

    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
    });

    drawMarkers();

    onMapReady?.(map.current);
  });

  useEffect(() => {
    void init().catch(error => {
      console.error("[Maps]", error);
      setLoadError(true);
    });
  }, [init]);

  useEffect(() => {
    drawMarkers();
  }, [drawMarkers, markers]);

  if (!hasGoogleMapsKey || loadError) {
    return <OpenStreetMapFallback className={className} markers={markers} />;
  }

  return (
    <div ref={mapContainer} className={cn("h-[500px] w-full", className)} />
  );
}

function OpenStreetMapFallback({
  className,
  markers,
}: Pick<MapViewProps, "className" | "markers">) {
  const src = useMemo(() => {
    const points = markers ?? [];
    const coordinates = points
      .map(marker => marker.position)
      .filter(
        point =>
          Number.isFinite(point.lat) &&
          Number.isFinite(point.lng) &&
          Math.abs(point.lat) <= 90 &&
          Math.abs(point.lng) <= 180
      );
    if (!coordinates.length) return null;
    const latitudes = coordinates.map(point => point.lat);
    const longitudes = coordinates.map(point => point.lng);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latPadding = Math.max(0.008, (maxLat - minLat) * 0.18);
    const lngPadding = Math.max(0.008, (maxLng - minLng) * 0.18);
    const bbox = [
      Math.max(-180, minLng - lngPadding),
      Math.max(-90, minLat - latPadding),
      Math.min(180, maxLng + lngPadding),
      Math.min(90, maxLat + latPadding),
    ]
      .map(value => value.toFixed(6))
      .join(",");
    const center = coordinates[0];
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${center.lat},${center.lng}`)}`;
  }, [markers]);

  if (!src) return null;
  return (
    <div className={cn("relative h-[500px] w-full", className)}>
      <iframe
        title="خريطة مواقع البرقيات"
        src={src}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <p className="absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
        خريطة بديلة؛ افتح سجل المواقع لتحديد البلاغ المطلوب.
      </p>
    </div>
  );
}
