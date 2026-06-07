import { z } from "zod";

const DiagnosticSummarySchema = z.object({
  objective: z.string(),
  current_state: z.string(),
  key_issues: z.array(z.string()),
  priority_areas: z.array(z.string()),
});

const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  business_value: z.string(),
  owner: z.string(),
});

const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  triggers: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  tools: z.array(z.string()),
  actors: z.array(z.string()),
  kpis: z.array(z.string()),
});

const BlueprintSchema = z.object({
  target_state: z.string(),
  capability_map: z.array(CapabilitySchema),
  workflows: z.array(WorkflowSchema),
  data_requirements: z.array(z.string()),
  risks_and_assumptions: z.array(z.string()),
});

export const AivoryPipelineResponseSchema = z.object({
  error: z.boolean(),
  mode: z.string(),
  model: z.string(),
  diagnostic_summary: DiagnosticSummarySchema,
  blueprint: BlueprintSchema,
  fallback_message: z.string().nullable(),
});

export type AivoryPipelineResponse = z.infer<
  typeof AivoryPipelineResponseSchema
>;
