import { ArrowLeft, CheckCircle2, Search, UserMinus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { APP_OWNER_EMAIL } from "../firebase/workspace";
import { useAppState } from "../state/AppState";
import type { StaffCandidate } from "../types";

export function TeacherManagementPage() {
  const { appRole, loadStaffCandidates, setTeacherApproved } = useAppState();
  const [candidates, setCandidates] = useState<StaffCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setCandidates(await loadStaffCandidates());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "TEACHER_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (appRole === "owner") void refresh();
    else if (appRole) setLoading(false);
    // The owner role is stable for this page; refresh is intentionally run only on role change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRole]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((candidate) =>
      candidate.displayName.toLowerCase().includes(needle) || candidate.email.toLowerCase().includes(needle));
  }, [candidates, query]);

  const update = async (candidate: StaffCandidate, approved: boolean) => {
    setUpdatingUid(candidate.uid);
    setError(undefined);
    try {
      await setTeacherApproved(candidate, approved);
      setCandidates((current) => current.map((item) => item.uid === candidate.uid ? { ...item, approved } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "TEACHER_UPDATE_FAILED");
    } finally {
      setUpdatingUid(undefined);
    }
  };

  if (appRole && appRole !== "owner") {
    return <main className="page-shell"><section className="student-entry-state"><h1>Owner access required</h1><p>Only the application owner can approve teacher accounts.</p><Link className="button button-secondary" to="/teacher">Return</Link></section></main>;
  }

  return (
    <main className="page-shell staff-page">
      <Link className="back-link" to="/teacher"><ArrowLeft size={17} /> All classes</Link>
      <section className="class-hero staff-hero">
        <div>
          <p className="eyebrow">Application owner</p>
          <h1>Teachers</h1>
          <p>Approve signed-in accounts that may create classes. Approved teachers can view every class but manage only classes they own.</p>
        </div>
      </section>

      <section className="section-block">
        <label className="staff-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or school email" />
        </label>
        {error && <div className="probe-error" role="alert"><strong>Teacher management failed.</strong> {error}</div>}
        {loading ? <div className="workspace-empty">Loading signed-in accounts...</div> : (
          <div className="staff-list">
            {filtered.map((candidate) => {
              const isOwner = candidate.email.toLowerCase() === APP_OWNER_EMAIL;
              return (
                <article className="staff-row" key={candidate.uid}>
                  <span className="avatar avatar-warm">{candidate.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <div className="staff-copy"><strong>{candidate.displayName}</strong><span>{candidate.email}</span></div>
                  <span className={`role-pill ${candidate.approved || isOwner ? "is-approved" : ""}`}>{isOwner ? "application owner" : candidate.approved ? "approved teacher" : "student"}</span>
                  {!isOwner && (candidate.approved ? (
                    <button className="button button-secondary" disabled={updatingUid === candidate.uid} onClick={() => void update(candidate, false)}><UserMinus size={17} /> Revoke</button>
                  ) : (
                    <button className="button button-primary" disabled={updatingUid === candidate.uid} onClick={() => void update(candidate, true)}><CheckCircle2 size={17} /> Approve</button>
                  ))}
                </article>
              );
            })}
            {filtered.length === 0 && <div className="workspace-empty">No signed-in account matches this search.</div>}
          </div>
        )}
      </section>
    </main>
  );
}
