import { sleep } from "workflow";
import { completePrayerResponse } from "@/lib/prayer-response-completion";
import type { PrayerGenerationInput } from "@/lib/prayer-generation";

async function checkResult(requestId: string, input: PrayerGenerationInput, timedOut = false) {
  "use step";
  console.info("prayer-generation: checking result", { requestId, timedOut });
  return completePrayerResponse(requestId, input, timedOut);
}

export async function finishPrayerGeneration(requestId: string, input: PrayerGenerationInput) {
  "use workflow";
  // No API keys, capabilities, provider output or member records enter workflow arguments/history.
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if (await checkResult(requestId, input)) return;
    } catch { /* Retry transport failures on the next durable tick, never redispatch the model. */ }
    await sleep("20s");
  }
  await checkResult(requestId, input, true);
}
