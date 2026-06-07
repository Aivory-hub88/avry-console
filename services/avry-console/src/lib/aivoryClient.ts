import { AivoryPipelineResponseSchema, type AivoryPipelineResponse } from "./aivoryPipelineSchema";

type PipelineRequest = {
  intent: string;
  diagnostic: Record<string, unknown>;
};

export async function runAivoryPipeline(
  payload: PipelineRequest,
  options: { signal?: AbortSignal } = {}
): Promise<AivoryPipelineResponse> {
  const res = await fetch("/api/aivory/pipeline", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipeline HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const parsed = AivoryPipelineResponseSchema.parse(json);
  return parsed;
}
