import { useState } from "react";
import { runAivoryPipeline } from "../lib/aivoryClient";
import type { AivoryPipelineResponse } from "../lib/aivoryPipelineSchema";

export default function AivoryTestPage() {
  const [data, setData] = useState<AivoryPipelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const result = await runAivoryPipeline({
        intent: "increase warehouse operational efficiency",
        diagnostic: { sample_data: "minimal test payload so the request is valid" },
      });
      setData(result);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6 space-y-4">
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Running..." : "Run Aivory Pipeline"}
      </button>

      {error && (
        <pre className="text-red-500 whitespace-pre-wrap">
          Error: {error}
        </pre>
      )}

      {data && (
        <pre className="mt-4 max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}
