import { start } from "workflow/api";
import { HookConflictError } from "workflow/errors";
import { finishPrayerGeneration } from "@/workflows/prayer-generation";
import type { PrayerGenerationInput } from "./prayer-generation";

export async function schedulePrayerCompletion(requestId: string, input: PrayerGenerationInput) {
  try {
    await start(finishPrayerGeneration, [requestId, input], {
      experimental_hook: { token: `prayer-completion:${requestId}`, experimental_minRetention: "1 day" },
    });
  } catch (error) {
    if (!HookConflictError.is(error)) throw new Error("prayer-worker-start-unconfirmed");
  }
}
