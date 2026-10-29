import { mockAccount, validateCredentials, type Credentials } from "./model";
import { validatePassword } from "@/features/settings/model";
import { saveMockPassword } from "@/lib/browserCredentials";

// Replace this adapter with the future API client. These operations send no requests.
export const mockAuth = {
  async signIn(input: Credentials) {
    const error = validateCredentials(input);
    if (error) throw new Error(error);
    return mockAccount(input.email, input.name);
  },
  async signUp(input: Credentials) {
    const error = validateCredentials(input, true);
    if (error) throw new Error(error);
    return mockAccount(input.email, input.name);
  },
  async requestRecovery(email: string) {
    if (!email.trim()) throw new Error("Enter a mock email value.");
  },
  async setPassword(password: string, confirmation: string) {
    const error = validatePassword(password, confirmation);
    if (error) throw new Error(error);
    await saveMockPassword(password);
  },
};
