export type RouteWorkflowMode = 'view' | 'edit' | 'playback';
export type RouteWorkflowState = { mode: RouteWorkflowMode; isAdding: boolean };
export type RouteWorkflowAction =
  | { type: 'mode'; mode: RouteWorkflowMode }
  | { type: 'start-add' }
  | { type: 'cancel-add' };

// Workflow transitions do not own or discard the route draft or its path history.
export function routeWorkflowReducer(
  state: RouteWorkflowState,
  action: RouteWorkflowAction,
): RouteWorkflowState {
  switch (action.type) {
    case 'mode':
      return { mode: action.mode, isAdding: false };
    case 'start-add':
      return state.mode === 'edit' ? { ...state, isAdding: true } : state;
    case 'cancel-add':
      return state.isAdding ? { ...state, isAdding: false } : state;
  }
}
