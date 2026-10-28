import { appReducer } from "../store/appSlice";
import type { AppState } from "../types";

export async function commitWorkspaceAction(
  action: Parameters<typeof appReducer>[1],
  ports: {
    read: () => AppState;
    write: (state: AppState) => Promise<void>;
    dispatch: (action: Parameters<typeof appReducer>[1]) => unknown;
  },
) {
  const before = ports.read();
  const proposed = appReducer(before, action);
  if (proposed === before) return false;
  await ports.write(proposed);
  ports.dispatch(action);
  return true;
}
