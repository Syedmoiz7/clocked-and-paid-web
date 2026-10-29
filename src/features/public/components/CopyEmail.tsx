"use client";
import { useRef, useState } from "react";
import { contactEmail } from "../contact";
export function CopyEmail() {
  const pending = useRef(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const copy = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await navigator.clipboard.writeText(contactEmail);
      setMessage("Email address copied. No message was sent.");
    } catch {
      setMessage(
        "Could not copy automatically. Select and copy the email address above.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="contact-copy">
      <button disabled={busy} onClick={() => void copy()}>
        Copy email address
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
