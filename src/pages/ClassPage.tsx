import { ArrowLeft, BarChart3, ChevronDown, ChevronUp, Plus, Presentation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { NewBoardDialog } from "../components/NewBoardDialog";
import { useAppState } from "../state/AppState";

export function ClassPage() {
  const { classId = "" } = useParams();
  const navigate = useNavigate();
  const { user, appRole, classes, boards, dataLoading, dataError, ensureClassLoaded, loadBoardPreviewImages, moveBoard } = useAppState();
  const [lookupComplete, setLookupComplete] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [boardPreviews, setBoardPreviews] = useState<Record<string, string[]>>({});
  const requestedClass = useRef("");
  const classroom = classes.find((item) => item.id === classId);
  const classBoards = useMemo(() => boards
    .filter((board) => board.classId === classId)
    .sort((a, b) => a.sortOrder - b.sortOrder), [boards, classId]);

  useEffect(() => {
    if (!user || !appRole || classroom || requestedClass.current === classId) return;
    requestedClass.current = classId;
    let active = true;
    void ensureClassLoaded(classId).finally(() => {
      if (active) setLookupComplete(true);
    });
    return () => { active = false; };
  }, [appRole, classId, classroom, ensureClassLoaded, user]);

  useEffect(() => {
    let active = true;
    const missing = classBoards.filter((board) => boardPreviews[board.id] === undefined);
    if (!missing.length) return;
    void Promise.all(missing.map(async (board) => [board.id, await loadBoardPreviewImages(board.id).catch(() => [])] as const)).then((results) => {
      if (!active) return;
      setBoardPreviews((current) => Object.fromEntries([...Object.entries(current), ...results]));
    });
    return () => { active = false; };
  }, [boardPreviews, classBoards, loadBoardPreviewImages]);

  if (!classroom && (dataLoading || !lookupComplete || requestedClass.current !== classId)) return <main className="page-shell"><div className="workspace-empty">Loading class...</div></main>;
  if (!classroom && dataError) return <main className="page-shell"><div className="probe-error" role="alert"><strong>Class could not load.</strong> {dataError}</div><Link to="/teacher">Return to classes</Link></main>;
  if (!classroom) return <NotFound />;

  return (
    <main className="page-shell class-page">
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
            <button className="button button-primary" onClick={() => setNewBoardOpen(true)}><Plus size={18} /> New board</button>
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
            <article className="board-row" key={board.id} role="link" tabIndex={0} aria-label={`Open ${board.title}`} onClick={() => navigate(`/c/${classId}/b/${board.id}`)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); navigate(`/c/${classId}/b/${board.id}`); } }}>
              <div className={`board-preview board-preview-${Math.min(3, boardPreviews[board.id]?.length || 0)} ${board.status === "archived" ? "muted" : ""}`}>
                {(boardPreviews[board.id] || []).map((imageUrl, index) => <img src={imageUrl} alt="" loading="lazy" key={`${imageUrl}-${index}`} />)}
                {!boardPreviews[board.id]?.length && <div className="board-preview-empty"><strong>{String(classBoards.indexOf(board) + 1).padStart(2, "0")}</strong><span>{boardPreviews[board.id] ? "No photos yet" : "Loading previews…"}</span></div>}
                <div className="board-preview-status"><span className={`status-dot ${board.allowPosting ? "open" : "closed"}`} />{board.status === "archived" ? "Archived" : board.allowPosting ? "Posting open" : "Posting closed"}</div>
              </div>
              <div className="board-main">
                <div className="board-title-row">
                  <div>
                    <h3>{board.title}</h3>
                    <p>{board.description}</p>
                  </div>
                </div>
                <div className="board-stats">
                  <span><strong>{board.postCount}</strong> posts</span>
                  <span><strong>{board.commentCount}</strong> comments</span>
                  <span><strong>{board.contributorCount}</strong> contributors</span>
                </div>
                <div className="board-card-footer"><span>{board.updatedLabel}</span>
                  {classroom.canManage && (
                    <div className="board-card-actions">
                      <div className="board-order-controls" role="group" aria-label={`Reorder ${board.title}`}>
                        <button className="mini-icon" type="button" title="Move board earlier" aria-label={`Move ${board.title} earlier`} disabled={classBoards.indexOf(board) === 0} onClick={(event) => { event.stopPropagation(); void moveBoard(board.id, -1).catch((error) => window.alert(error instanceof Error ? error.message : "Could not move the board.")); }}><ChevronUp /></button>
                        <button className="mini-icon" type="button" title="Move board later" aria-label={`Move ${board.title} later`} disabled={classBoards.indexOf(board) === classBoards.length - 1} onClick={(event) => { event.stopPropagation(); void moveBoard(board.id, 1).catch((error) => window.alert(error instanceof Error ? error.message : "Could not move the board.")); }}><ChevronDown /></button>
                      </div>
                      {board.status === "active" && <button className="button button-primary" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/c/${classId}/b/${board.id}/present`); }}>
                        <Presentation size={18} /> Present
                      </button>}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          {classBoards.length === 0 && <div className="workspace-empty"><h3>No boards yet</h3><p>Create the first lesson board for this class.</p></div>}
        </div>
      </section>
      <NewBoardDialog classId={classId} open={newBoardOpen} onClose={() => setNewBoardOpen(false)} />
    </main>
  );
}

function NotFound() {
  return <main className="page-shell"><h1>Class not found</h1><Link to="/teacher">Return to classes</Link></main>;
}
