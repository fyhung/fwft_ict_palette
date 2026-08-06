import { ArrowRight, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { NewClassDialog } from "../components/NewClassDialog";
import { DeleteClassDialog } from "../components/DeleteClassDialog";
import { useAppState } from "../state/AppState";
import type { Classroom } from "../types";

export function TeacherDashboardPage() {
  const { user, classes, boards, dataLoading, dataError } = useAppState();
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [manageClasses, setManageClasses] = useState(false);
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null);
  const totalPosts = classes.reduce((total, classroom) => total + classroom.postCount, 0);
  const firstName = user?.displayName.split(/\s+/)[0] || "teacher";
  const today = new Intl.DateTimeFormat("en-HK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const indexUrl = dataError?.match(/https:\/\/\S+/)?.[0];

  return (
    <main className="page-shell">
      <section className="hero-row">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>Good afternoon, {firstName}.</h1>
          <p className="hero-copy">Choose a class, open today&apos;s board and put the QR code on screen.</p>
        </div>
        <button className="button button-primary" onClick={() => setNewClassOpen(true)} disabled={!user}>
          <Plus size={18} /> New class
        </button>
      </section>

      <section className="summary-strip" aria-label="Classroom overview">
        <div><strong>{classes.length}</strong><span>active classes</span></div>
        <div><strong>{boards.length}</strong><span>lesson boards</span></div>
        <div><strong>{totalPosts}</strong><span>photo posts</span></div>
        <div><strong>—</strong><span>contributors</span></div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">Your teaching spaces</p><h2>Classes</h2></div>
          <button className="text-button" onClick={() => setManageClasses((current) => !current)}>{manageClasses ? "Done" : "Manage classes"}</button>
        </div>
        {dataError && (
          <div className="probe-error firestore-error" role="alert">
            <div><strong>Firestore could not load the class membership index.</strong></div>
            {indexUrl ? (
              <a className="button button-secondary" href={indexUrl} target="_blank" rel="noreferrer">Create required Firestore index</a>
            ) : <span>{dataError}</span>}
          </div>
        )}
        {dataLoading && <div className="workspace-empty">Loading your Firestore classes...</div>}
        {!dataLoading && !dataError && classes.length === 0 && (
          <div className="workspace-empty">
            <h3>No classes yet</h3>
            <p>Create your first teaching space to verify the live Firestore connection.</p>
          </div>
        )}
        <div className="class-grid">
          {classes.map((classroom, index) => (
            <div className="class-card-wrap" key={classroom.id}>
              <Link className={`class-card accent-${classroom.accent}`} to={`/c/${classroom.id}`}>
                <div className="class-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="class-card-body">
                  <div className="role-row">
                    <span className="role-pill">{classroom.role}</span>
                    <UsersRound size={17} />
                  </div>
                  <h3>{classroom.name}</h3>
                  <p>{classroom.description}</p>
                  <div className="class-card-footer">
                    <span>{classroom.boardCount} boards · {classroom.postCount} posts</span>
                    <span className="round-arrow"><ArrowRight size={18} /></span>
                  </div>
                </div>
              </Link>
              {manageClasses && classroom.role === "owner" && (
                <button className="class-delete-button" onClick={() => setClassToDelete(classroom)} aria-label={`Delete ${classroom.name}`}>
                  <Trash2 size={17} /> Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <NewClassDialog open={newClassOpen} onClose={() => setNewClassOpen(false)} />
      <DeleteClassDialog classroom={classToDelete} onClose={() => setClassToDelete(null)} />
    </main>
  );
}
