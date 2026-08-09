import { MessageCircle, Minus, Pencil, Plus } from "lucide-react";
import type { BoardPost } from "../types";

export function PostCard({ post, onOpen, onEdit, onResize }: { post: BoardPost; onOpen?: () => void; onEdit?: () => void; onResize?: (direction: -1 | 1) => void }) {
  const displayColumns = post.displayColumns ?? 1;
  return (
    <article className={`post-card post-card-size-${displayColumns}`} tabIndex={0} role="button" onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen?.(); }}>
      <div className={`post-image ${post.visual}`}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.caption} />
        ) : (
          <span className="visual-label" aria-hidden="true" />
        )}
        {onResize && <div className="post-card-resize" role="group" aria-label={`Post size level ${displayColumns} of 4`} onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={`Make smaller: ${post.caption}`} title="Make post smaller" disabled={displayColumns === 1} onClick={() => onResize(-1)}><Minus size={15} /></button>
          <span aria-hidden="true">{displayColumns}×</span>
          <button type="button" aria-label={`Make larger: ${post.caption}`} title="Make post larger" disabled={displayColumns === 4} onClick={() => onResize(1)}><Plus size={15} /></button>
        </div>}
        {onEdit && <button className="post-card-edit" type="button" aria-label={`Edit ${post.caption}`} onClick={(event) => { event.stopPropagation(); onEdit(); }}><Pencil size={15} /> Edit</button>}
      </div>
      <div className="post-body">
        <p>{post.caption}</p>
        <div className="post-meta">
          <span className="avatar avatar-small">{post.authorInitials}</span>
          <span>
            <strong>{post.authorName}</strong>
            <small>{post.createdLabel}</small>
          </span>
          <span className="comment-count" aria-label={`${post.commentCount} comments`}>
            <MessageCircle size={15} /> {post.commentCount}
          </span>
        </div>
      </div>
    </article>
  );
}
