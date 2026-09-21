import { packBot, simulateMatch, verifyPackage } from "@prompt-chien/core/engine";
import { createReplay, verifyReplay, seekReplay } from "@prompt-chien/core/replay";
import { validateBot } from "@prompt-chien/application";

process.once("message", async request => {
  try {
    let result;
    if (request.kind === "validate") result = await validateBot(request.bot);
    else if (request.kind === "simulate") {
      const pack = bot => bot && typeof bot === "object" && "packageHash" in bot ? verifyPackage(bot) : packBot(bot);
      const input = { packages: { A: await pack(request.a), B: await pack(request.b) }, seed: request.seed };
      const simulation = await simulateMatch(input);
      result = { replay: await createReplay(input, simulation), stats: simulation.stats };
    } else if (request.kind === "verify") result = await verifyReplay(request.replay);
    else if (request.kind === "seek") { await verifyReplay(request.replay); result = seekReplay(request.replay, request.tick); }
    else throw new Error("Unknown worker operation");
    process.send({ ok: true, result }, () => process.disconnect());
  } catch (error) { process.send({ ok: false, error: error instanceof Error ? error.message : String(error) }, () => process.disconnect()); }
});
