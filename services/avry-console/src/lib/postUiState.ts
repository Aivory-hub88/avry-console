/**
 * UI State Streaming Client
 * Sends UI state updates from frontend to VPS Bridge for context awareness
 */

export type UiStatePayload = {
  session_id: string;
  active_tab?: string;
  page_url?: string;
  last_action?: string;
  form_errors?: Record<string, string>;
  extra?: any;
};

/**
 * Post UI state to VPS Bridge
 * Errors are silently swallowed to avoid disrupting user experience
 */
export async function postUiState(state: UiStatePayload): Promise<void> {
  try {
    await fetch('/api/bridge/context/ui-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  } catch (e) {
    // Silently swallow errors - don't disrupt UI
    console.error('[postUiState] failed', e);
  }
}
