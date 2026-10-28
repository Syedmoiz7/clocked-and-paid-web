import {
  configureStore,
  createAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { appReducer } from "@/store/appSlice";
import type { AppState } from "@/types";
export const replaceWorkspace = createAction<AppState>("web/replaceWorkspace");
const workspaceReducer = (
  state: AppState | undefined,
  action: UnknownAction,
): AppState =>
  replaceWorkspace.match(action) ? action.payload : appReducer(state, action);

// Future API endpoints are injected here; no server or network calls are mocked as successes.
export const workspaceApi = createApi({
  reducerPath: "workspaceApi",
  baseQuery: fakeBaseQuery<{ message: string }>(),
  endpoints: () => ({}),
});
export const makeStore = () =>
  configureStore({
    reducer: {
      app: workspaceReducer,
      [workspaceApi.reducerPath]: workspaceApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(workspaceApi.middleware),
  });
export type AppStore = ReturnType<typeof makeStore>;
