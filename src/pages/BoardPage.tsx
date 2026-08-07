import {
  ArrowLeft,
  BarChart3,
  Copy,
  GripVertical,
  ImagePlus,
  Presentation,
  QrCode,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PostCard } from "../components/PostCard";
import { PostDialog } from "../components/PostDialog";
import { sections } from "../demoData";
import { useAppState } from "../state/AppState";

export function BoardPage() {
  const { classId = "", boardId = "" } = useParams();
  const { appRole, classes, boards, posts, toggleBoardSetting, user, signIn, ensureClassLoaded } = useAppState();
  const board = boards.find((item) => item.id === boardId);
  const classroom = classes.find((item) => item.id === classId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const requestedClass = useRef("");

  useEffect(() => {
    if (!user || !appRole || classroom || requestedClass.current === classId) return;
    requestedClass.current = classId;
    void ensureClassLoaded(classId);
  }, [appRole, classId, classroom, ensureClassLoaded, user]);

  if (!classroom && user && appRole) return <main className="page-shell"><div className="workspace-empty">Loading board...</div></main>;
  if (!board || !classroom) return <main className="page-shell"><h1>Board not found</h1></main>;

  const openPostDialog = () => {
    if (!user) signIn();
    setDialogOpen(true);
  };

  return (
    <main className="board-page">
      <div className="board-topbar page-shell">
        <Link className="back-link" to={`/c/${classId}`}><ArrowLeft size={17} /> {classroom.name}</Link>
        {classroom.canManage && (
          <div className="board-toolbar">
            <Link className="button button-primary" to={`/c/${classId}/b/${boardId}/present`}><Presentation size={17} /> Present</Link>
            <button className="button button-secondary"><QrCode size={17} /> QR</button>
            <button className="button button-secondary"><Copy size={17} /> Copy link</button>
            <button className="icon-button" aria-label="Board settings"><Settings size={18} /></button>
          </div>
        )}
      </div>

      <section className="board-heading page-shell">
        <div>
          <div className="board-kicker"><span>{classroom.name}</span><i /> Live lesson board</div>
          <h1>{board.title}</h1>
          <p>{board.description}</p>
        </div>
        {classroom.canManage && <div className="live-controls">
          <label className="switch-row">
            <span><strong>Posting</strong><small>Student photo submissions</small></span>
            <input type="checkbox" checked={board.allowPosting} onChange={() => toggleBoardSetting(board.id, "allowPosting")} />
          </label>
          <label className="switch-row">
            <span><strong>Comments</strong><small>Text and image replies</small></span>
            <input type="checkbox" checked={board.allowComments} onChange={() => toggleBoardSetting(board.id, "allowComments")} />
          </label>
          <button className="text-button"><BarChart3 size={16} /> View activity</button>
        </div>}
      </section>

      <div className="board-content page-shell">
        {sections.map((section) => {
          const sectionPosts = posts.filter((post) => post.boardId === boardId && post.sectionId === section.id);
          return (
            <section className="photo-section" key={section.id}>
              <header className={`photo-section-header ${classroom.canManage ? "" : "view-only"}`}>
                {classroom.canManage && <span className="drag-handle" aria-hidden="true"><GripVertical /></span>}
                <div><h2>{section.title}</h2><p>{section.note}</p></div>
                <span className="section-count">{sectionPosts.length} posts</span>
              </header>
              {sectionPosts.length ? (
                <div className="post-grid">{sectionPosts.map((post) => <PostCard post={post} key={post.id} />)}</div>
              ) : (
                <div className="empty-section">No photos in this section yet.</div>
              )}
            </section>
          );
        })}
      </div>

      <button className="floating-post" onClick={openPostDialog} disabled={!board.allowPosting}>
        <ImagePlus size={20} /> {board.allowPosting ? "Add photo" : "Posting closed"}
      </button>
      <PostDialog boardId={board.id} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </main>
  );
}
