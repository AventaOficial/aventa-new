export type LikeableComment = {
  id: string;
  liked_by_me?: boolean;
  like_count?: number;
  replies?: LikeableComment[];
};

/** One toggle, including replies. Does not refetch the thread. */
export function toggleCommentLike<T extends LikeableComment>(list: T[], commentId: string): T[] {
  return list.map((comment) => {
    if (comment.id === commentId) {
      const liked = comment.liked_by_me !== true;
      const count = Math.max(0, (comment.like_count ?? 0) + (liked ? 1 : -1));
      return { ...comment, liked_by_me: liked, like_count: count };
    }
    if (comment.replies?.length) {
      return { ...comment, replies: toggleCommentLike(comment.replies, commentId) };
    }
    return comment;
  });
}

/** Reconcile one comment with the server's liked flag without touching the rest of the thread. */
export function alignCommentLike<T extends LikeableComment>(list: T[], commentId: string, liked: boolean): T[] {
  return list.map((comment) => {
    if (comment.id === commentId) {
      if (comment.liked_by_me === liked) return comment;
      const count = Math.max(0, (comment.like_count ?? 0) + (liked ? 1 : -1));
      return { ...comment, liked_by_me: liked, like_count: count };
    }
    if (comment.replies?.length) {
      return { ...comment, replies: alignCommentLike(comment.replies, commentId, liked) };
    }
    return comment;
  });
}
