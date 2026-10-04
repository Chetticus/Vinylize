import { useLayoutEffect } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useThree } from "@react-three/fiber";

/** Merge opaque static furniture by material, preserving world-space UVs,
 * normals and shadow flags. Transparent window/decal sorting stays separate. */
export default function StaticBatch({ root, ready, onDone }: {
  root: React.RefObject<THREE.Group>;
  ready: boolean;
  onDone: () => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const room = root.current;
    if (!ready || !room) return;
    let alive = true;
    let timer = 0;
    const batches = new THREE.Group();
    batches.name = "static-room-batches";
    const originals: THREE.Mesh[] = [];
    room.updateWorldMatrix(true, true);
    const inverse = room.matrixWorld.clone().invert();
    const groups = new Map<string, THREE.Mesh[]>();
    room.traverseVisible((obj) => {
      if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh ||
          obj instanceof THREE.SkinnedMesh || Array.isArray(obj.material) ||
          obj.material.transparent || obj.children.length ||
          Object.keys(obj.geometry.morphAttributes).length) return;
      const key = `${obj.material.uuid}:${obj.castShadow}:${obj.receiveShadow}:${obj.renderOrder}`;
      const list = groups.get(key) ?? [];
      list.push(obj);
      groups.set(key, list);
    });
    const queue = [...groups.values()].filter((items) => items.length > 1);
    room.add(batches);
    const next = () => {
      if (!alive) return;
      const objects = queue.shift();
      if (!objects) { onDone(); invalidate(); return; }
      const parts = objects.map((mesh) => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        // Furniture uses the standard position/normal/UV layout. Discard
        // optional attributes unused by these shared materials before merging.
        for (const key of Object.keys(geometry.attributes)) {
          if (!["position", "normal", "uv"].includes(key)) geometry.deleteAttribute(key);
        }
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        if (!geometry.attributes.uv) geometry.setAttribute("uv",
          new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        geometry.clearGroups();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        return geometry;
      });
      const merged = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      if (merged) {
        merged.computeBoundingSphere();
        const batch = new THREE.Mesh(merged, objects[0].material);
        batch.castShadow = objects[0].castShadow;
        batch.receiveShadow = objects[0].receiveShadow;
        batch.renderOrder = objects[0].renderOrder;
        batch.matrixAutoUpdate = false;
        batch.raycast = () => {};
        batches.add(batch);
        for (const obj of objects) { obj.visible = false; originals.push(obj); }
      }
      timer = window.setTimeout(next, 0);
    };
    timer = window.setTimeout(next, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      originals.forEach((obj) => { obj.visible = true; });
      batches.children.forEach((obj) => (obj as THREE.Mesh).geometry.dispose());
      room.remove(batches);
    };
  }, [root, ready, onDone, invalidate]);
  return null;
}
