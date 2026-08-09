export type AppRole = "owner" | "teacher" | "student";
export type ClassRole = "app owner" | "owner" | "view only";
export type BoardStatus = "active" | "archived";

export interface Classroom {
  id: string;
  name: string;
  description: string;
  role: ClassRole;
  ownerUid?: string;
  canManage?: boolean;
  boardCount: number;
  postCount: number;
  accent: string;
}

export interface BoardSummary {
  id: string;
  classId: string;
  title: string;
  description: string;
  status: BoardStatus;
  allowPosting: boolean;
  allowComments: boolean;
  postCount: number;
  commentCount: number;
  contributorCount: number;
  updatedLabel: string;
}

export interface BoardSection {
  id: string;
  boardId: string;
  title: string;
  note: string;
  sortOrder: number;
}

export type PostDisplayColumns = 1 | 2 | 3 | 4;

export interface BoardPost {
  id: string;
  boardId: string;
  sectionId: string;
  authorUid: string;
  authorName: string;
  authorInitials: string;
  caption: string;
  imageUrl?: string;
  mainImageUrl?: string;
  thumbImageUrl?: string;
  mainFileId?: string;
  thumbFileId?: string;
  imageBytes?: number;
  thumbBytes?: number;
  visual: string;
  createdLabel: string;
  commentCount: number;
  displayColumns?: PostDisplayColumns;
}

export interface BoardComment {
  id: string;
  boardId: string;
  postId: string;
  authorUid: string;
  authorName: string;
  authorInitials: string;
  text: string;
  mainImageUrl?: string;
  thumbImageUrl?: string;
  mainFileId?: string;
  thumbFileId?: string;
  imageBytes?: number;
  thumbBytes?: number;
  createdLabel: string;
}

export interface DemoUser {
  uid: string;
  displayName: string;
  email: string;
  initials: string;
  photoURL?: string;
}

export interface StaffCandidate {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  approved: boolean;
}
