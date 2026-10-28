"use client";
import Link from "next/link";
import { useState } from "react";
import type { AppState, Deduction, MockJob } from "@/types";
import { Toggle } from "@/components/Fields";
import { money, localDate } from "@/features/history/model";
import { DeductionForm } from "@/features/pay/components/DeductionForm";
import { Confirm } from "@/features/pay/components/Shared";
import { useJobActions } from "../useJobActions";

export function JobDeductions({
  data,
  job,
  busy,
}: {
  data: AppState;
  job: MockJob;
  busy: boolean;
}) {
  const actions = useJobActions(),
    [editing, setEditing] = useState<{ initial?: Deduction } | null>(null),
    [removing, setRemoving] = useState<Deduction | null>(null);
  const deductions = data.deductions.filter((item) => item.jobId === job.id),
    code = job.currency ?? data.preferences.currency;
  return (
    <div className="job-form-section">
      <h3>Deductions for this Job</h3>
      {data.isPremium ? (
        <>
          {!deductions.length && (
            <p>No deductions for this job yet. These are shared with Pay.</p>
          )}
          {deductions.map((item) => (
            <div className="job-deduction" key={item.id}>
              <div className="pay-row">
                <h4>{item.label}</h4>
                <strong>
                  {data.payVisible
                    ? item.isPercentage
                      ? `${item.amount}% of matching gross`
                      : `${money(item.amount, item.currency ?? code)} / ${item.frequency}`
                    : "•••••"}
                </strong>
              </div>
              <Toggle
                label={`Enable ${item.label}`}
                checked={item.enabled}
                disabled={busy}
                onChange={(enabled) =>
                  void actions.deduction({ ...item, enabled }, job.id, item)
                }
              />
              <div className="button-row">
                <button
                  disabled={busy}
                  onClick={() => setEditing({ initial: item })}
                >
                  Edit {item.label}
                </button>
                <button disabled={busy} onClick={() => setRemoving(item)}>
                  Delete {item.label}
                </button>
              </div>
            </div>
          ))}
          <button disabled={busy} onClick={() => setEditing({})}>
            + Add job deduction
          </button>
        </>
      ) : (
        <div className="job-notice">
          <p>Manage deductions with Premium, using the same records as Pay.</p>
          <Link className="button-link primary" href="/plans?returnTo=jobs">
            See plans
          </Link>
        </div>
      )}
      {editing && data.isPremium && (
        <DeductionForm
          data={data}
          initial={editing.initial}
          jobId={job.id}
          lockedJobId={job.id}
          bounds={{ start: `${localDate().slice(0, 7)}-01`, end: localDate() }}
          onSave={(value) => actions.deduction(value, job.id, editing.initial)}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <Confirm
          title="Delete job deduction?"
          label="Delete deduction"
          action={() => actions.removeDeduction(removing, job.id)}
          onClose={() => setRemoving(null)}
        >
          <p>
            Delete {removing.label}? Existing received-paycheck amounts remain
            unchanged.
          </p>
        </Confirm>
      )}
    </div>
  );
}
