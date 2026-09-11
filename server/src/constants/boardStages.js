// The four Product Backlog workflow stages (US-06), always in this exact
// order: Product Backlog -> Sprint Planning -> Active Sprint -> Completed.
//
// This is the one place the backend defines the stage list. Every other
// backend file that needs the stages (the board endpoint today, later the
// PBI move/validation logic) imports it from here instead of writing its
// own copy, so the list and its order can never drift apart between them.
//
// This is a fixed, hard-coded list, not project data. Every project uses
// the exact same four stages in the exact same order, there is nothing in
// the database that could make one project's board different from another's.
export const BOARD_STAGES = Object.freeze([
  'product_backlog',
  'sprint_planning',
  'active_sprint',
  'completed'
]);

const BOARD_STAGE_SET = new Set(BOARD_STAGES);

// True if the given value is one of the four real stage names. Not used yet,
// this is here ready for when a later story (US-08a) needs to validate a
// stage a client is trying to move a PBI into.
export function isBoardStage(value) {
  return BOARD_STAGE_SET.has(value);
}
