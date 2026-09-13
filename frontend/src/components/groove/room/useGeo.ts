import { useEffect, useMemo } from "react";
import type * as THREE from "three";

/** Build geometry once and dispose it on unmount. */
export function useGeo<T extends THREE.BufferGeometry | THREE.BufferGeometry[]>(make: () => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, []);
  useEffect(
    () => () => {
      for (const x of Array.isArray(g) ? g : [g]) x.dispose();
    },
    [g],
  );
  return g;
}

/** Build a record of named geometries once and dispose them on unmount. */
export function useGeoSet<T extends Record<string, THREE.BufferGeometry>>(make: () => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, []);
  useEffect(
    () => () => {
      for (const x of Object.values(g)) x.dispose();
    },
    [g],
  );
  return g;
}
