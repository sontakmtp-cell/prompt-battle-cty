import { mkdirSync, writeFileSync } from "node:fs";
import { VERSIONS } from "@prompt-chien/contracts";

const action = (move = "towardEnemy", turn = "faceEnemy", power = 1000) => ({ move: { mode: move, power }, turn: { mode: turn, power: 1000, offset: 0 } });
const always = a => ({ when: { op: "always" }, action: a });
const brain = rules => ({ apiVersion: VERSIONS.brainApi, initialState: "fight", variables: [], states: [{ name: "fight", rules }] });
const compare = (name, cmp, value) => ({ op: "compare", cmp, left: { kind: "sensor", name }, right: { kind: "constant", value } });
const designs = [
  { name: "Spear", widths: [7,7,6,5,3,2], motors: 15, hammer: 24, paper: 10, rules: [always(action())] },
  { name: "Shield", widths: [5,5,5,5,5,5], motors: 15, hammer: 10, paper: 25, rules: [always(action("towardEnemy", "faceEnemy", 650))] },
  { name: "Flanker", widths: [3,6,6,6,6,3], motors: 15, hammer: 10, paper: 10, rules: [
    { when: { op: "all", args: [compare("enemy.distance", "lt", 9500), compare("stateTicks", "lt", 100)] }, action: action("orbitLeft") },
    always(action()),
  ] },
  { name: "Spinner", widths: [3,5,7,7,5,3], motors: 15, hammer: 15, paper: 15, rules: [
    { when: compare("enemy.distance", "lt", 8500), action: action("towardEnemy", "left", 850) }, always(action()),
  ] },
  { name: "Glass Cannon", widths: [8,7,6,5,3,1], motors: 30, hammer: 24, paper: 2, rules: [always(action())] },
];

export function referenceBots() {
  return Object.fromEntries(designs.map(design => {
    const triangles = [];
    for (const [r, width] of design.widths.entries()) for (let column = 0; column < width; column++) for (const orientation of ["up", "down"]) {
      const q = column - Math.floor(width / 2) - Math.floor(r / 2);
      triangles.push({ id: `t${triangles.length.toString().padStart(2, "0")}`, q, r, orientation, type: "scissor", core: false });
    }
    const x = t => t.q * 1000 + t.r * 500 + (t.orientation === "up" ? 500 : 1000);
    const y = t => t.r * 866 + (t.orientation === "up" ? 288 : 577);
    const centerY = triangles.reduce((sum,t) => sum+y(t),0) / triangles.length;
    const core = [...triangles].sort((a,b) => Math.abs(x(a)) + Math.abs(y(a)-centerY) - Math.abs(x(b)) - Math.abs(y(b)-centerY))[0];
    core.core = true; core.type = "paper";
    const motorRank = t => design.name === "Flanker" || design.name === "Spinner" ? -Math.abs(x(t)) + Math.abs(y(t)-centerY) / 2 : y(t) + Math.abs(x(t)) / 2;
    const motors = triangles.filter(t => !t.core).sort((a,b) => motorRank(a)-motorRank(b)).slice(0,design.motors);
    motors.forEach(t => { t.type = "motor"; });
    const remaining = triangles.filter(t => !t.core && t.type !== "motor");
    const paperRank = t => design.name === "Shield" ? -y(t) : Math.abs(x(t)-x(core)) + Math.abs(y(t)-y(core));
    const papers = [...remaining].sort((a,b) => paperRank(a)-paperRank(b)).slice(0,design.paper-1);
    papers.forEach(t => { t.type = "paper"; });
    remaining.filter(t => t.type === "scissor").sort((a,b) => y(b)-y(a)).slice(0,design.hammer).forEach(t => { t.type = "hammer"; });
    if (design.name === "Spinner") {
      let i = 0;
      triangles.filter(t => t.type !== "motor" && !t.core).forEach(t => { t.type = ["hammer","scissor","paper"][i++ % 3]; });
    }
    return [design.name.toLowerCase().replaceAll(" ", "-"), { schemaVersion: VERSIONS.botSchema, name: design.name, body: { triangles }, brain: brain(design.rules) }];
  }));
}

if (process.argv.includes("--write")) {
  const directory = new URL("../examples/bots/", import.meta.url); mkdirSync(directory, { recursive: true });
  for (const [name, bot] of Object.entries(referenceBots())) writeFileSync(new URL(`${name}.json`, directory), `${JSON.stringify(bot, null, 2)}\n`);
  console.log("Wrote five reference bots");
}
