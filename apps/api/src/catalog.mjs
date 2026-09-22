import { packBot } from "@prompt-chien/core/engine";
import chimUngTienPhong from "../../../examples/bots/chim-ung-tien-phong.json" with { type: "json" };
import flanker from "../../../examples/bots/flanker.json" with { type: "json" };
import glassCannon from "../../../examples/bots/glass-cannon.json" with { type: "json" };
import shield from "../../../examples/bots/shield.json" with { type: "json" };
import spear from "../../../examples/bots/spear.json" with { type: "json" };
import spinner from "../../../examples/bots/spinner.json" with { type: "json" };

export const REFERENCE_DEFINITIONS = {
  spear,
  shield,
  flanker,
  spinner,
  "glass-cannon": glassCannon,
  "chim-ung-tien-phong": chimUngTienPhong,
};

let packageCache;
export async function referencePackages() {
  packageCache ??= Promise.all(Object.entries(REFERENCE_DEFINITIONS).map(async ([id, definition]) => ({
    id,
    name: definition.name,
    package: await packBot(definition),
  })));
  return packageCache;
}

