export type NoteColor = "yellow" | "pink" | "blue" | "green" | "orange" | "purple";
export type StrokeColor = "black" | "red" | "blue" | "green" | "orange" | "purple";

export type Tool = "select" | "pen" | "note" | "eraser";

export type Point = [number, number];

export type Board = {
  id: string;
  slug: string;
  name: string | null;
  created_at: string;
  created_by: string | null;
};

export type Note = {
  id: string;
  board_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: NoteColor;
  text: string;
  z_index: number;
  updated_at: string;
  updated_by: string | null;
};

export type Stroke = {
  id: string;
  board_id: string;
  color: StrokeColor;
  width: number;
  points: Point[];
  created_at: string;
  created_by: string | null;
};

export type NoteVote = {
  note_id: string;
  user_id: string;
  board_id: string;
  value: 1 | -1;
  updated_at: string;
};

export type Cursor = {
  user_id: string;
  name: string;
  color: string;
  x: number;
  y: number;
};
