"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Plus } from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { Confirm } from "@/features/pay/components/Shared";
import type { MockJob } from "@/types";
import { entitlementsFor } from "@/services/entitlements";
import { jobReferenced, newJobFromDefaults, workInProgress } from "../model";
import { useJobActions } from "../useJobActions";
import { JobForm } from "./JobForm";
import { JobCard } from "./JobCard";

export function Jobs() {
  const data = useApp(),
    { busy } = useWorkspace(),
    actions = useJobActions(),
    router = useRouter();
  const [editing, setEditing] = useState<{
      initial: MockJob;
      existing: boolean;
    } | null>(null),
    [removing, setRemoving] = useState<MockJob | null>(null);
  const jobs = data.jobs.filter((job) => !job.archived),
    limitReached = jobs.length >= entitlementsFor(data).jobLimit;
  const selected = jobs.find((job) => job.id === data.selectedJobId);
  return (
    <div className="jobs-page">
      <div className="page-heading jobs-heading">
        <div>
          <h1>Jobs</h1>
          <p>
            Manage your jobs, pay rates, schedules, reminders, and deductions.
          </p>
        </div>
      </div>
      <section className="card jobs-workspace">
        <header className="jobs-header">
          <span className="jobs-header-icon">
            <Briefcase size={16} aria-hidden="true" />
          </span>
          <div>
            <h2>Your jobs</h2>
            <p>
              Selected for Tracker:{" "}
              <strong>{selected?.name ?? "No profile"}</strong>
            </p>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              limitReached
                ? router.push("/plans?returnTo=jobs")
                : setEditing({
                    initial: newJobFromDefaults(data, crypto.randomUUID()),
                    existing: false,
                  })
            }
          >
            <Plus size={16} />
            {limitReached ? "Add job · Premium" : "Add job"}
          </button>
        </header>
        <div className="jobs-body">
          <p>
            Selected is the profile Tracker will use next. Default is your
            fallback profile.
          </p>
          {workInProgress(data) && (
            <p className="job-notice">
              Finish or resolve running/recoverable shifts before switching
              profiles. Notes and reminders can still be edited.
            </p>
          )}
          {!jobs.length && (
            <div className="empty">
              <Briefcase size={34} aria-hidden="true" />
              <h3>Add your first job</h3>
              <p>Set a name and hourly rate to keep your work organized.</p>
            </div>
          )}
          <div className="jobs-list">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                data={data}
                job={job}
                busy={busy}
                onEdit={() => setEditing({ initial: job, existing: true })}
                onRemove={() => setRemoving(job)}
                onSelect={(makeDefault) =>
                  void actions.select(job.id, makeDefault)
                }
              />
            ))}
          </div>
          {data.jobs.some((job) => job.archived) && (
            <p>
              Removed profiles remain available to historical records. They
              cannot start new shifts.
            </p>
          )}
        </div>
      </section>
      {editing && (
        <JobForm
          key={editing.initial.id}
          data={data}
          initial={editing.initial}
          existing={editing.existing}
          onSave={(value) =>
            actions.save(value, editing.existing ? editing.initial : undefined)
          }
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <Confirm
          title="Delete job?"
          label="Delete job"
          action={() => actions.remove(removing)}
          onClose={() => setRemoving(null)}
        >
          <p>
            {jobReferenced(data, removing.id)
              ? "This job will leave Tracker choices. Its profile, shifts, deductions and received paychecks are retained for historical calculations."
              : `Remove ${removing.name}? This cannot be undone.`}
          </p>
        </Confirm>
      )}
    </div>
  );
}
