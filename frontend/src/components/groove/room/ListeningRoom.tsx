/**
 * The listening room: a private room above an old record shop, in the last
 * hour of daylight. Composition only — each part lives in its own module.
 *
 * Static by design: nothing here runs per frame except RoomLights'
 * throttled shadow refresh. Geometry is built once per mount, textures and
 * materials come from the shared kit and survive Studio ⇄ Room toggles.
 */

import Console from "./Console";
import Corner from "./Corner";
import Plant from "./Plant";
import RoomLights from "./RoomLights";
import Shell from "./Shell";
import Shelves from "./Shelves";
import type { Quality } from "./quality";

export default function ListeningRoom({ quality }: { quality: Quality }) {
  return (
    <group>
      <RoomLights quality={quality} />
      <Shell />
      <Console quality={quality} />
      <Corner quality={quality} />
      <Shelves quality={quality} />
      <Plant quality={quality} />
    </group>
  );
}
