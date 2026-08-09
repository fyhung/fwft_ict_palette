import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  BarChart3,
  Copy,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Minus,
  Presentation,
  QrCode,
  Settings,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PostCard } from "../components/PostCard";
import { PostDialog } from "../components/PostDialog";
import { BoardSettingsDialog } from "../components/BoardSettingsDialog";
import { PostDetailDialog } from "../components/PostDetailDialog";
import type { BoardPost, PostDisplayColumns } from "../types";
import { useAppState } from "../state/AppState";

export function BoardPage() {
  const { classId = "", boardId = "" } = useParams();
  const { appRole, classes, boards, sections, posts, comments, toggleBoardSetting, updateBoardDisplay, user, signIn, ensureClassLoaded, watchBoardPosts, watchBoardComments, addSection, renameSection, deleteSection, moveSection, updatePost } = useAppState();
  const board = boards.find((item) => item.id === boardId);
  const classroom = classes.find((item) => item.id === classId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [postSectionId, setPostSectionId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<BoardPost>();
  const [editSelectedPost, setEditSelectedPost] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy link");
  const requestedClass = useRef("");
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const boardSections = sections.filter((section) => section.boardId === boardId).sort((a, b) => a.sortOrder - b.sortOrder);
  const orderedBoardPosts = boardSections.flatMap((section) => posts.filter((post) => post.boardId === boardId && post.sectionId === section.id));

  useEffect(() => {
    if (!user || !appRole || classroom || requestedClass.current === classId) return;
    requestedClass.current = classId;
    void ensureClassLoaded(classId);
  }, [appRole, classId, classroom, ensureClassLoaded, user]);

  useEffect(() => {
    if (!user || !board) return;
    return watchBoardPosts(classId, boardId);
  }, [board, boardId, classId, user, watchBoardPosts]);

  useEffect(() => {
    if (!user || !board) return;
    return watchBoardComments(classId, boardId);
  }, [board, boardId, classId, user, watchBoardComments]);

  if (!classroom && user && appRole) return <main className="page-shell"><div className="workspace-empty">Loading board...</div></main>;
  if (!board || !classroom) return <main className="page-shell"><h1>Board not found</h1></main>;

  const postColumns = board.postColumns ?? 1;
  const thumbnailMode = board.thumbnailMode ?? "crop";

  const saveBoardDisplay = (input: { postColumns?: PostDisplayColumns; thumbnailMode?: "crop" | "original" }) => {
    void updateBoardDisplay(board.id, input).catch((error) => window.alert(error instanceof Error ? error.message : "Could not update the board display."));
  };

  const openPostDialog = (sectionId?: string) => {
    if (!user) signIn();
    setPostSectionId(sectionId);
    setDialogOpen(true);
  };

  const copyBoardLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopyLabel("Copied!");
    window.setTimeout(() => setCopyLabel("Copy link"), 1600);
  };

  const navigatePost = (direction: -1 | 1) => {
    if (!selectedPost || orderedBoardPosts.length < 2) return;
    const currentIndex = orderedBoardPosts.findIndex((post) => post.id === selectedPost.id);
    const nextIndex = (currentIndex + direction + orderedBoardPosts.length) % orderedBoardPosts.length;
    setEditSelectedPost(false);
    setSelectedPost(orderedBoardPosts[nextIndex]);
  };

  const finishPostDrag = (event: DragEndEvent) => {
    if (!classroom.canManage || !event.over) return;
    const postId = String(event.active.id).replace(/^post:/, "");
    const targetSectionId = String(event.over.id).replace(/^section:/, "");
    const post = posts.find((item) => item.id === postId);
    if (!post || !boardSections.some((section) => section.id === targetSectionId) || post.sectionId === targetSectionId) return;
    void updatePost(post.id, { caption: post.caption, sectionId: targetSectionId }).catch((error) => window.alert(error instanceof Error ? error.message : "Could not move the post."));
  };

  return (
    <main className="board-page">
      <div className="board-topbar page-shell">
        <Link className="back-link" to={`/c/${classId}`}><ArrowLeft size={17} /> {classroom.name}</Link>
        {classroom.canManage && (
          <div className="board-toolbar">
            <Link className="button button-primary" to={`/c/${classId}/b/${boardId}/present`}><Presentation size={17} /> Present</Link>
            <Link className="button button-secondary" to={`/c/${classId}/b/${boardId}/present`}><QrCode size={17} /> QR</Link>
            <button className="button button-secondary" onClick={() => void copyBoardLink()}><Copy size={17} /> {copyLabel}</button>
            <button className="icon-button" aria-label="Board settings" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
          </div>
        )}
      </div>

      <section className="board-heading page-shell">
        <div className="board-title-block">
          <div className="board-kicker"><span>{classroom.name}</span><i /> Live lesson board</div>
          <div className="board-title-action"><h1>{board.title}</h1><button className="button button-primary board-add-photo" onClick={() => openPostDialog(boardSections[0]?.id)} disabled={!board.allowPosting || boardSections.length === 0}><ImagePlus size={20} /> {board.allowPosting ? "Add photo" : "Posting closed"}</button></div>
          <p>{board.description}</p>
        </div>
        {classroom.canManage && <div className="live-controls">
          <label className="switch-row">
            <span><strong>Posting</strong><small>Student photo submissions</small></span>
            <input type="checkbox" checked={board.allowPosting} onChange={() => void toggleBoardSetting(board.id, "allowPosting")} />
          </label>
          <label className="switch-row">
            <span><strong>Comments</strong><small>Text and image replies</small></span>
            <input type="checkbox" checked={board.allowComments} onChange={() => void toggleBoardSetting(board.id, "allowComments")} />
          </label>
          <button className="text-button"><BarChart3 size={16} /> View activity</button>
        </div>}
      </section>

      <div className="board-content page-shell">
        {classroom.canManage && <div className="section-tools"><div className="board-display-tools">
          <div className="board-size-control" role="group" aria-label={`Board post size level ${postColumns} of 4`}><span>Post size</span><button type="button" aria-label="Make all posts smaller" disabled={postColumns === 1} onClick={() => saveBoardDisplay({ postColumns: Math.max(1, postColumns - 1) as PostDisplayColumns })}><Minus size={16} /></button><strong>{postColumns}×</strong><button type="button" aria-label="Make all posts larger" disabled={postColumns === 4} onClick={() => saveBoardDisplay({ postColumns: Math.min(4, postColumns + 1) as PostDisplayColumns })}><Plus size={16} /></button></div>
          <button className="button button-secondary thumbnail-mode-toggle" type="button" aria-pressed={thumbnailMode === "original"} onClick={() => saveBoardDisplay({ thumbnailMode: thumbnailMode === "crop" ? "original" : "crop" })}>{thumbnailMode === "crop" ? "Show original ratio" : "Crop thumbnails"}</button>
          <button className="button button-secondary" onClick={() => { const title = window.prompt("New section name", `Section ${boardSections.length + 1}`)?.trim(); if (title) void addSection(board.id, title); }}><Plus size={17} /> New section</button>
        </div></div>}
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={finishPostDrag}>
        {boardSections.map((section) => {
          const sectionPosts = posts.filter((post) => post.boardId === boardId && post.sectionId === section.id);
          return (
            <DroppableSection sectionId={section.id} disabled={!classroom.canManage} key={section.id}>
              <header className={`photo-section-header ${classroom.canManage ? "" : "view-only"}`}>
                {classroom.canManage && <span className="drag-handle" aria-hidden="true"><GripVertical /></span>}
                <div><h2>{section.title}</h2><p>{section.note}</p></div>
                <div className="section-header-actions"><span className="section-count">{sectionPosts.length} posts</span>{board.allowPosting && <button className="button section-add-photo" onClick={() => openPostDialog(section.id)}><ImagePlus size={16} /> Add photo</button>}{classroom.canManage && <>
                  <button className="mini-icon" title="Move up" onClick={() => void moveSection(section.id, -1)}><ChevronUp /></button>
                  <button className="mini-icon" title="Move down" onClick={() => void moveSection(section.id, 1)}><ChevronDown /></button>
                  <button className="mini-icon" title="Rename" onClick={() => { const title = window.prompt("Rename section", section.title)?.trim(); if (title) void renameSection(section.id, title); }}><Pencil /></button>
                  <button className="mini-icon danger-text" title="Delete empty section" onClick={() => { if (window.confirm(`Delete empty section “${section.title}”?`)) void deleteSection(section.id).catch((error) => window.alert(error instanceof Error && error.message === "SECTION_NOT_EMPTY" ? "Move or delete its posts first." : error)); }}><Trash2 /></button>
                </>}</div>
              </header>
              {sectionPosts.length ? (
                <div className="post-grid">{sectionPosts.map((post) => <DraggablePostCard post={{ ...post, commentCount: comments.filter((comment) => comment.postId === post.id).length }} displayColumns={postColumns} thumbnailMode={thumbnailMode} canDrag={Boolean(classroom.canManage)} key={post.id} onOpen={() => { setEditSelectedPost(false); setSelectedPost(post); }} onEdit={classroom.canManage ? () => { setEditSelectedPost(true); setSelectedPost(post); } : undefined} />)}</div>
              ) : (
                <div className="empty-section">No photos in this section yet.</div>
              )}
            </DroppableSection>
          );
        })}
        </DndContext>
        {boardSections.length === 0 && <div className="empty-section">This board has no sections yet.</div>}
      </div>

      <PostDialog boardId={board.id} initialSectionId={postSectionId} open={dialogOpen} onClose={() => { setDialogOpen(false); setPostSectionId(undefined); }} />
      <BoardSettingsDialog board={board} open={settingsOpen} onClose={() => setSettingsOpen(false)} onDeleted={() => { window.location.hash = `#/c/${classId}`; }} />
      {selectedPost && <PostDetailDialog
        post={posts.find((item) => item.id === selectedPost.id) || selectedPost}
        canManage={Boolean(classroom.canManage)}
        startEditing={editSelectedPost}
        postPosition={Math.max(1, orderedBoardPosts.findIndex((post) => post.id === selectedPost.id) + 1)}
        postCount={orderedBoardPosts.length}
        onPreviousPost={orderedBoardPosts.length > 1 ? () => navigatePost(-1) : undefined}
        onNextPost={orderedBoardPosts.length > 1 ? () => navigatePost(1) : undefined}
        open
        onClose={() => { setSelectedPost(undefined); setEditSelectedPost(false); }}
      />}
    </main>
  );
}

function DroppableSection({ sectionId, disabled, children }: { sectionId: string; disabled: boolean; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `section:${sectionId}`, disabled });
  return <section ref={setNodeRef} className={`photo-section ${isOver ? "is-drop-target" : ""}`}>{children}</section>;
}

function DraggablePostCard({ post, displayColumns, thumbnailMode, canDrag, onOpen, onEdit }: { post: BoardPost; displayColumns: PostDisplayColumns; thumbnailMode: "crop" | "original"; canDrag: boolean; onOpen: () => void; onEdit?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `post:${post.id}`, disabled: !canDrag });
  return <div ref={setNodeRef} className={`post-drag-item post-card-size-${displayColumns} ${isDragging ? "is-dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform) }}>
    <PostCard post={post} displayColumns={displayColumns} thumbnailMode={thumbnailMode} onOpen={onOpen} onEdit={onEdit} dragHandleProps={canDrag ? { ...attributes, ...listeners } : undefined} />
  </div>;
}
