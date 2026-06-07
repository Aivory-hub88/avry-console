import { NextResponse } from 'next/server';

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

/**
 * Create a real n8n workflow from blueprint
 */
async function createN8nWorkflow(payload: any): Promise<any> {
  if (!N8N_BASE_URL || !N8N_API_KEY) {
    throw new Error('n8n not configured');
  }

  console.log('=== createN8nWorkflow START ===');
  console.log('N8N_BASE_URL:', N8N_BASE_URL);
  console.log('Payload nodes count:', payload.nodes?.length || 0);
  console.log('Payload connections keys:', Object.keys(payload.connections || {}));
  console.log('Full payload:', JSON.stringify(payload, null, 2));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    clearTimeout(timeoutId);

    console.log('n8n response status:', response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('n8n API error response:', error);
      throw new Error(error.message || `n8n API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('n8n response workflow ID:', result.id);
    console.log('n8n response nodes count:', result.nodes?.length || 0);
    console.log('n8n response connections keys:', Object.keys(result.connections || {}));
    console.log('Full n8n response:', JSON.stringify(result, null, 2));
    console.log('=== createN8nWorkflow END ===');
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('createN8nWorkflow error:', err.message);
    console.log('=== createN8nWorkflow ERROR ===');
    if (err.name === 'AbortError') {
      throw new Error('n8n request timeout');
    }
    throw err;
  }
}

/**
 * Build n8n nodes from blueprint steps
 * Each step becomes a real n8n node with parameters
 */
function buildN8nNodesFromSteps(steps: any[]): any[] {
  const nodes: any[] = [];
  // Track which step indices are decision/IF nodes so connections can wire both branches
  const decisionIndices: number[] = [];

  // Layout: spread nodes horizontally so they don't stack in n8n editor
  // Trigger at x=250, each subsequent node shifts right by 220px
  const X_START = 250;
  const X_STEP = 220;
  const Y_BASE = 300;
  const Y_FALSE_BRANCH = 500; // false-branch nodes sit below the main flow

  // 1. Webhook trigger
  nodes.push({
    id: 'webhook-trigger',
    name: 'Webhook Trigger',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1.1,
    position: [X_START, Y_BASE],
    parameters: {
      path: 'aivory-workflow',
      responseMode: 'responseNode',
      method: 'POST',
    },
  });

  // 2. Convert each blueprint step
  steps.forEach((step, index) => {
    const nodeId = `step-${index}`;
    const xPos = X_START + (index + 1) * X_STEP;
    const stepType = step.type || '';
    const stepAction = step.action || '';
    const stepText = `${stepAction}`.toLowerCase();

    let node: any;

    if (stepType === 'notification' || stepText.includes('email') || stepText.includes('send')) {
      node = {
        id: nodeId,
        name: stepAction || 'Send Notification',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2.1,
        position: [xPos, Y_BASE],
        parameters: {
          fromEmail: 'no-reply@aivory.com',
          toEmail: '={{ $json.clientEmail }}',
          subject: stepAction || 'Notification',
          emailType: 'text',
          message: '={{ $json.message || "' + (stepAction || 'Notification') + '" }}',
          options: {},
        },
      };
    } else if (stepType === 'decision' || stepText.includes('condition') || stepText.includes('if')) {
      decisionIndices.push(index);
      node = {
        id: nodeId,
        name: stepAction || 'Decision',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [xPos, Y_BASE],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [
              {
                leftValue: '={{ $json.validationStatus }}',
                rightValue: 'complete',
                operator: { type: 'string', operation: 'equals' },
              },
            ],
            combinator: 'and',
          },
        },
      };
    } else if (stepType === 'ai_processing') {
      node = {
        id: nodeId,
        name: stepAction || 'AI Processing',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [xPos, Y_BASE],
        parameters: {
          method: 'POST',
          url: '={{ $env.AI_ENDPOINT || "https://api.aivory.com/nlp" }}',
          authentication: 'none',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify({ action: "' + (stepAction || '') + '", data: $json }) }}',
          options: {},
        },
      };
    } else {
      // ingestion / execution / human_review / default → Set node
      node = {
        id: nodeId,
        name: stepAction || `Step ${index + 1}`,
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [xPos, Y_BASE],
        parameters: {
          assignments: {
            assignments: [
              { name: 'action', value: stepAction, type: 'string' },
              { name: 'stepType', value: stepType, type: 'string' },
              { name: 'stepIndex', value: String(index), type: 'string' },
            ],
          },
          options: {},
        },
      };
    }

    nodes.push(node);
  });

  // 3. Human Review fallback node — target for IF false branches
  const humanReviewX = X_START + (steps.length + 1) * X_STEP;
  nodes.push({
    id: 'human-review',
    name: 'Human Review Flag',
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [humanReviewX, Y_FALSE_BRANCH],
    parameters: {},
  });

  // 4. End node
  nodes.push({
    id: 'end-node',
    name: 'End',
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [humanReviewX, Y_BASE],
    parameters: {},
  });

  return nodes;
}

/**
 * Build n8n connections from steps
 * Chain: webhook → step1 → step2 → ... → end
 */
function buildN8nConnectionsFromSteps(steps: any[]): any {
  const connections: any = {};

  // n8n uses node NAMES (not IDs) as connection keys
  const getNodeName = (index: number): string => {
    const step = steps[index];
    const stepType = step?.type || '';
    const stepAction = step?.action || '';
    const stepText = `${stepAction}`.toLowerCase();
    if (stepType === 'notification' || stepText.includes('email') || stepText.includes('send')) {
      return stepAction || 'Send Notification';
    }
    if (stepType === 'decision' || stepText.includes('condition') || stepText.includes('if')) {
      return stepAction || 'Decision';
    }
    if (stepType === 'ai_processing') return stepAction || 'AI Processing';
    return stepAction || `Step ${index + 1}`;
  };

  const isDecisionStep = (index: number): boolean => {
    const step = steps[index];
    const stepType = step?.type || '';
    const stepText = `${step?.action || ''}`.toLowerCase();
    return stepType === 'decision' || stepText.includes('condition') || stepText.includes('if');
  };

  // Webhook Trigger → first step (or End if no steps)
  connections['Webhook Trigger'] = {
    main: [
      [{ node: steps.length > 0 ? getNodeName(0) : 'End', type: 'main', index: 0 }],
    ],
  };

  steps.forEach((_, index) => {
    const currentName = getNodeName(index);
    const nextName = index < steps.length - 1 ? getNodeName(index + 1) : 'End';

    if (isDecisionStep(index)) {
      // IF node: output[0] = true branch → next step, output[1] = false branch → Human Review Flag
      connections[currentName] = {
        main: [
          [{ node: nextName, type: 'main', index: 0 }],
          [{ node: 'Human Review Flag', type: 'main', index: 0 }],
        ],
      };
    } else {
      connections[currentName] = {
        main: [
          [{ node: nextName, type: 'main', index: 0 }],
        ],
      };
    }
  });

  return connections;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workflow_id, workflow_title, workflow_steps, company_name } = body;

    if (!workflow_id) {
      return NextResponse.json({ error: 'workflow_id is required' }, { status: 400 });
    }

    const steps = Array.isArray(workflow_steps) ? workflow_steps : [];
    const nodes = buildN8nNodesFromSteps(steps);
    const connections = buildN8nConnectionsFromSteps(steps);

    const n8nPayload = {
      name: workflow_title || 'Generated Workflow',
      nodes,
      connections,
      settings: { executionOrder: 'v1' },
    };

    // Transform steps first — needed regardless of n8n availability
    const transformedSteps = steps.map((step: any, index: number) => ({
      step: index + 1,
      action: typeof step === 'string' ? step : step.action || '',
      tool: typeof step === 'object' ? step.tool || 'N/A' : 'N/A',
      output: typeof step === 'object' ? step.output || '' : '',
      type: typeof step === 'object' ? step.type || 'execution' : 'execution',
    }));

    // Try to create in n8n — if it fails, fall back to a locally-generated workflow
    // so the canvas always has steps to render (preview mode)
    let n8nWorkflowId: string | null = null;
    try {
      const n8nWorkflow = await createN8nWorkflow(n8nPayload);
      n8nWorkflowId = n8nWorkflow.id;
      console.log('[from-blueprint] n8n workflow created:', n8nWorkflowId);
    } catch (err: any) {
      console.warn('[from-blueprint] n8n unavailable, saving as preview-only workflow:', err.message);
      // Fall through — workflow will be saved locally without an n8n ID
    }

    // Use n8n ID if available, otherwise generate a stable local ID
    const finalWorkflowId = n8nWorkflowId ?? `local-${workflow_id}-${Date.now()}`;

    return NextResponse.json({
      workflow_id: finalWorkflowId,
      title: workflow_title || 'Generated Workflow',
      trigger: 'Webhook trigger',
      steps: transformedSteps,
      integrations: [],
      estimated_time: '2-4 hours',
      automation_percentage: '75%',
      error_handling: 'Retry on failure',
      notes: `Generated from blueprint for ${company_name || 'SME'}`,
    }, { status: 200 });
  } catch (err: any) {
    console.error('[from-blueprint] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
