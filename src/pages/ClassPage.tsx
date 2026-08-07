import { ArrowLeft, BarChart3, MoreHorizontal, Plus, Presentation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppState } from "../state/AppState";

export function ClassPage() {
  const { classId = "" } = useParams();
  const { user, appRole, classes, boards, dataLoading, dataError, ensureClassLoaded } = useAppState();
  const [lookupComplete, setLookupComplete] = useState(false);
  const requestedClass = useRef("");
  const classroom = classes.find((item) => item.id === classId);
  const classBoards = boards.filter((board) => board.classId === classId);

  useEffect(() => {
    if (!user || !appRole || classroom || requestedClass.current === classId) return;
    requestedClass.current = classId;
    let active = true;
    void ensureClassLoaded(classId).finally(() => {
      if (active) setLookupComplete(true);
    });
    return () => { active = false; };
  }, [appRole, classId, classroom, ensureClassLoaded, user]);

  if (!classroom && (dataLoading || !lookupComplete || requestedClass.current !== classId)) return <main className="page-shell"><div className="workspace-empty">Loading class...</div></main>;
  if (!classroom && dataError) return <main className="page-shell"><div className="probe-error" role="alert"><strong>Class could not load.</strong> {dataError}</div><Link to="/teacher">Return to classes</Link></main>;
  if (!classroom) return <NotFound />;

  return (
    <main className="page-shell">
      <Link className="back-link" to="/teacher"><ArrowLeft size={17} /> All classes</Link>
      <section className="class-hero">
        <div>
          <p className="eyebrow">Class workspace</p>
          <h1>{classroom.name}</h1>
          <p>{classroom.description}</p>
        </div>
        {classroom.canManage && (
          <div className="hero-actions">
            <button className="button button-secondary"><BarChart3 size={18} /> Class stats</button>
            <button className="button button-primary"><Plus size={18} /> New board</button>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">Lesson activities</p><h2>Boards</h2></div>
          <div className="status-legend"><span className="status-dot open" /> Open for submissions</div>
        </div>
        <div className="board-list">
          {classBoards.map((board) => (
            <article className="board-row" key={board.id}>
              <div className={`board-index ${board.status === "archived" ? "muted" : ""}`}>
                {String(classBoards.indexOf(board) + 1).padStart(2, "0")}
              </div>
              <div className="board-main">
                <div className="board-title-row">
                  <div>
                    <div className="board-status-line">
                      <span className={`status-dot ${board.allowPosting ? "open" : "closed"}`} />
                      {board.status === "archived" ? "Archived" : board.allowPosting ? "Posting open" : "Posting closed"}
                    </div>
                    <h3>{board.title}</h3>
                    <p>{board.description}</p>
                  </div>
                  {classroom.canManage && <button className="icon-button" aria-label={`More actions for ${board.title}`}><MoreHorizontal /></button>}
                </div>
                <div className="board-stats">
                  <span><strong>{board.postCount}</strong> posts</span>
                  <span><strong>{board.commentCount}</strong> comments</span>
                  <span><strong>{board.contributorCount}</strong> contributors</span>
                  <span>{board.updatedLabel}</span>
                </div>
                <div className="board-actions">
                  <Link className="button button-secondary" to={`/c/${classId}/b/${board.id}`}>Open board</Link>
                  {classroom.canManage && board.status === "active" && (
                    <Link className="button button-primary" to={`/c/${classId}/b/${board.id}/present`}>
                      <Presentation size={18} /> Present
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function NotFound() {
  return <main className="page-shell"><h1>Class not found</h1><Link to="/teacher">Return to classes</Link></main>;
}
