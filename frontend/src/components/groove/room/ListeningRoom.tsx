/**
 * The listening room: a private room above an old record shop, in the last
 * hour of daylight. Composition only — each part lives in its own module.
 *
 * Static by design: nothing here runs per frame except RoomLights'
 * throttled shadow refresh. Geometry is built once per mount, textures and
 * materials come from the shared kit and survive Studio ⇄ Room toggles.
 *
 * The parts mount one per macrotask rather than in a single commit, so
 * building the geometry never blocks the page for long at a stretch (the
 * loading curtain keeps moving); `onBuilt` fires once everything is in.
 */

import { useEffect, useState, type ComponentType } from "react";

import Console from "./Console";
import Corner from "./Corner";
import Plant from "./Plant";
import RoomLights from "./RoomLights";
import Shell from "./Shell";
import Shelves from "./Shelves";
import type { Quality } from "./quality";

const PARTS: Array<ComponentType<{ quality: Quality }>> = [RoomLights, Shell, Console, Corner, Shelves, Plant];

export default function ListeningRoom({ quality, onBuilt }: { quality: Quality; onBuilt?: () => void }) {
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (count >= PARTS.length) {
      onBuilt?.();
      return;
    }
    const id = window.setTimeout(() => setCount((c) => c + 1), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <group>
      {PARTS.slice(0, count).map((Part, i) => (
        <Part key={i} quality={quality} />
      ))}
    </group>
  );
}
