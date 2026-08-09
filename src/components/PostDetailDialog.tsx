import { ImagePlus, Maximize2, Pencil, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";
import type { BoardPost } from "../types";

export function PostDetailDialog({ post, canManage, startEditing = false, open, onClose }: { post: BoardPost; canManage: boolean; startEditing?: boolean; open: boolean; onClose: () => void }) {
  const { user, boards, sections, comments, addComment, updateComment, deleteComment, updatePost, deletePost } = useAppState();
  const board = boards.find((item) => item.id === post.boardId);
  const boardSections = sections.filter((item) => item.boardId === post.boardId).sort((a, b) => a.sortOrder - b.sortOrder);
  const postComments = useMemo(() => comments.filter((item) => item.postId === post.id), [comments, post.id]);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [sectionId, setSectionId] = useState(post.sectionId);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string }>();
  useEffect(() => { setCaption(post.caption); setSectionId(post.sectionId); setEditing(startEditing); }, [post, startEditing]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (lightbox) setLightbox(undefined); else onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [lightbox, onClose, open]);
  if (!open || !board) return null;

  async function savePost() {
    if (!caption.trim()) return setError("Caption is required.");
    setBusy(true); setError("");
    try { await updatePost(post.id, { caption: caption.trim(), sectionId }); setEditing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not edit the post."); }
    finally { setBusy(false); }
  }
  async function removePost() {
    if (!window.confirm("Delete this post, its comments, and all related images?")) return;
    setBusy(true);
    try { await deletePost(post.id); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the post."); setBusy(false); }
  }
  async function submitComment() {
    if (!text.trim() && !file) return setError("Write a comment or attach an image.");
    setBusy(true); setError("");
    try { await addComment(post.boardId, post.id, text.trim(), file); setText(""); setFile(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the comment."); }
    finally { setBusy(false); }
  }
  async function editComment(commentId: string, currentText: string) {
    const next = window.prompt("Edit comment", currentText);
    if (next === null || !next.trim()) return;
    try { await updateComment(commentId, next.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not edit comment."); }
  }
  async function removeComment(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    try { await deleteComment(commentId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete comment."); }
  }

  const canDeletePost = canManage || user?.uid === post.authorUid;
  return <><div className="dialog-backdrop" onMouseDown={onClose}>
    <section className="dialog post-detail-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
      <div className="dialog-header"><div><span className="eyebrow">Photo post</span><h2>{post.authorName}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
      <button className="media-open-button post-main-view" onClick={() => setLightbox({ src: post.mainImageUrl || post.imageUrl || "", alt: post.caption })}>
        <img className="post-detail-image" src={post.mainImageUrl || post.imageUrl} alt={post.caption} />
        <span><Maximize2 size={17} /> View full screen</span>
      </button>
      {editing ? <div className="edit-post-fields">
        <label className="field"><span>Caption</span><textarea maxLength={500} value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
        <label className="field"><span>Section</span><select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>{boardSections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <button className="button button-primary" disabled={busy} onClick={() => void savePost()}><Save size={16} /> Save post</button>
      </div> : <p className="post-detail-caption">{post.caption}</p>}
      <div className="post-detail-actions">
        {canManage && !editing && <button className="text-button" onClick={() => setEditing(true)}><Pencil size={15} /> Edit post</button>}
        {canDeletePost && <button className="text-button danger-text" disabled={busy} onClick={() => void removePost()}><Trash2 size={15} /> Delete post</button>}
      </div>
      <div className="comments-panel"><h3>Comments <span>{postComments.length}</span></h3>
        {postComments.map((comment) => <article className="comment-item" key={comment.id}>
          <span className="avatar avatar-small">{comment.authorInitials}</span><div><strong>{comment.authorName}</strong><p>{comment.text}</p>{comment.mainImageUrl && <button className="comment-media-button" onClick={() => setLightbox({ src: comment.mainImageUrl || "", alt: comment.text || "Comment attachment" })}><img src={comment.thumbImageUrl || comment.mainImageUrl} alt={comment.text || "Comment attachment"} /><span><Maximize2 size={14} /> Enlarge</span></button>}
          {(canManage || user?.uid === comment.authorUid) && <div className="comment-actions"><button onClick={() => void editComment(comment.id, comment.text)}>Edit</button><button onClick={() => void removeComment(comment.id)}>Delete</button></div>}</div>
        </article>)}
        {!postComments.length && <p className="muted-copy">No comments yet.</p>}
        {board.allowComments ? <div className="comment-form"><textarea maxLength={500} placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)} /><label className="button button-secondary file-button"><ImagePlus size={16} /> {file ? file.name : "Add image"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0])} /></label><button className="button button-primary" disabled={busy} onClick={() => void submitComment()}>{busy ? "Posting…" : "Post comment"}</button></div> : <p className="muted-copy">Comments are closed.</p>}
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  </div>{lightbox && <div className="media-lightbox" role="dialog" aria-modal="true" aria-label="Full-screen image viewer" onClick={() => setLightbox(undefined)}>
    <button className="media-lightbox-close" onClick={() => setLightbox(undefined)} aria-label="Close full-screen image"><X /></button>
    <img src={lightbox.src} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
  </div>}</>;
}
