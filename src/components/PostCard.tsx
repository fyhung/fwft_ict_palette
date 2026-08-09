import { MessageCircle } from "lucide-react";
import type { BoardPost } from "../types";

export function PostCard({ post, onOpen }: { post: BoardPost; onOpen?: () => void }) {
  return (
    <article className="post-card" tabIndex={0} role="button" onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen?.(); }}>
      <div className={`post-image ${post.visual}`}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.caption} />
        ) : (
          <span className="visual-label" aria-hidden="true" />
        )}
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
