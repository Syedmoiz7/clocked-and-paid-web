import type { Page } from "@playwright/test";
import type { AppState } from "../../src/types";

export async function savedValue<T>(page: Page, key = "current"): Promise<T> {
  return page.evaluate(async (key) => {
    const request = indexedDB.open("clocked-paid-web", 1),
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const tx = db.transaction("workspace", "readonly"),
      requestValue = tx.objectStore("workspace").get(key);
    const value = await new Promise<T>((resolve, reject) => {
      requestValue.onsuccess = () => resolve(requestValue.result);
      requestValue.onerror = () => reject(requestValue.error);
    });
    db.close();
    return value;
  }, key);
}
export async function savedState(page: Page) {
  return (await savedValue<{ state: AppState }>(page)).state;
}
export async function seedState(page: Page, changes: Partial<AppState>) {
  await page.evaluate(async (changes) => {
    const request = indexedDB.open("clocked-paid-web", 1),
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace"),
      read = store.get("current");
    read.onsuccess = () => {
      const snapshot = read.result;
      snapshot.state = { ...snapshot.state, ...changes };
      snapshot.revision++;
      store.put(snapshot, "current");
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, changes);
  await page.reload();
}
